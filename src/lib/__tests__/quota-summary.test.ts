import { describe, it, expect } from "vitest";
import { summarizeAgentQuota } from "@/lib/quota-summary";
import type { ProviderQuota, QuotaItem } from "@/types";

function quota(items: QuotaItem[], over: Partial<ProviderQuota> = {}): ProviderQuota {
  return { provider: "copilot", status: "ok", fetchedAt: 0, items, ...over };
}

describe("summarizeAgentQuota", () => {
  it("adds up remaining/entitlement across the items that apply", () => {
    const summary = summarizeAgentQuota(
      quota([
        { label: "Premium requests", remaining: 30, entitlement: 100 },
        { label: "Chat", remaining: 20, entitlement: 100 },
      ]),
      {},
    );
    expect(summary.fraction).toBeCloseTo(0.25);
    expect(summary.label).toBe("50/200");
    expect(summary.status).toBe("ok");
  });

  it("averages percentRemaining when there are no absolute numbers", () => {
    const summary = summarizeAgentQuota(
      quota([
        { label: "A", percentRemaining: 80 },
        { label: "B", percentRemaining: 40 },
      ]),
      {},
    );
    expect(summary.fraction).toBeCloseTo(0.6);
    expect(summary.label).toBe("60%");
  });

  it("turns usedPercent into what is left", () => {
    const summary = summarizeAgentQuota(quota([{ label: "Ventana de 5 h", usedPercent: 80 }]), {});
    expect(summary.fraction).toBeCloseTo(0.2);
    expect(summary.label).toBe("20%");
    expect(summary.detail).toContain("Ventana de 5 h");
  });

  it("reports a full ring when every item that applies is unlimited", () => {
    const summary = summarizeAgentQuota(
      quota([
        { label: "Chat", unlimited: true },
        { label: "Completions", unlimited: true },
      ]),
      {},
    );
    expect(summary.fraction).toBe(1);
    expect(summary.label).toBe("∞");
    expect(summary.status).toBe("ok");
  });

  it("has nothing to draw without a quota", () => {
    const summary = summarizeAgentQuota(undefined, {});
    expect(summary.fraction).toBeNull();
    expect(summary.status).toBe("unavailable");
  });

  it("keeps the provider's status and message when the lookup failed", () => {
    const summary = summarizeAgentQuota(quota([], { status: "error", message: "HTTP 500" }), {});
    expect(summary.fraction).toBeNull();
    expect(summary.status).toBe("error");
    expect(summary.detail).toBe("HTTP 500");
  });

  it("calls a used-up quota exhausted", () => {
    const summary = summarizeAgentQuota(
      quota([{ label: "Premium requests", remaining: 0, entitlement: 300 }]),
      {},
    );
    expect(summary.fraction).toBe(0);
    expect(summary.status).toBe("exhausted");
  });

  it("only counts the items of the agent's model", () => {
    const items: QuotaItem[] = [
      { label: "Semana (Opus)", model: "opus", usedPercent: 90 },
      { label: "Semana (Sonnet)", model: "sonnet", usedPercent: 10 },
    ];
    const opus = summarizeAgentQuota(quota(items, { provider: "claude" }), { model: "claude-opus-4-1" });
    expect(opus.fraction).toBeCloseTo(0.1);
    const sonnet = summarizeAgentQuota(quota(items, { provider: "claude" }), { model: "sonnet" });
    expect(sonnet.fraction).toBeCloseTo(0.9);
  });

  it("joins every model of the provider when the orchestrator picks the model", () => {
    const items: QuotaItem[] = [
      { label: "Opus", model: "opus", remaining: 10, entitlement: 100 },
      { label: "Sonnet", model: "sonnet", remaining: 40, entitlement: 100 },
      { label: "Haiku", model: "haiku", remaining: 50, entitlement: 100 },
    ];
    const summary = summarizeAgentQuota(quota(items, { provider: "claude" }), {
      allModels: ["opus", "sonnet"],
    });
    expect(summary.label).toBe("50/200");
    expect(summary.fraction).toBeCloseTo(0.25);
  });

  it("counts an item once even when several models share its pool", () => {
    const summary = summarizeAgentQuota(
      quota([{ label: "Pool Gemini", model: "gemini", remaining: 5, entitlement: 10 }], {
        provider: "antigravity",
      }),
      { allModels: ["gemini-3.1-pro-high", "gemini-3.1-flash"] },
    );
    expect(summary.label).toBe("5/10");
  });

  it("keeps the provider-wide items whatever the model is", () => {
    const summary = summarizeAgentQuota(
      quota([{ label: "Premium requests", remaining: 7, entitlement: 300 }]),
      { model: "gpt-5" },
    );
    expect(summary.label).toBe("7/300");
  });
});

// opencode reports what each linked account spent and no ceiling at all: there is no ring to draw,
// and the lines are the whole answer — one per account.
describe("summarizeAgentQuota with amounts spent and no limits", () => {
  const spent = (): ProviderQuota => ({
    provider: "opencode",
    status: "ok",
    message: "opencode no informa límites",
    fetchedAt: 0,
    items: [
      { label: "opencode", model: "opencode", note: "12 mensajes · 82.2K entrada" },
      { label: "Google", model: "google", note: "7 mensajes · 1.5K entrada" },
    ],
  });

  it("gives every account a line when the agent pins no model", () => {
    const summary = summarizeAgentQuota(spent(), {});
    expect(summary.fraction).toBeNull();
    expect(summary.details).toHaveLength(2);
    expect(summary.details[0]).toContain("opencode");
    expect(summary.details[1]).toContain("Google");
  });

  it("narrows to the account of the model the agent uses", () => {
    const summary = summarizeAgentQuota(spent(), { model: "google/gemini-3-flash" });
    expect(summary.details).toEqual([expect.stringContaining("Google")]);
  });

  it("keeps one line per summary for a provider that does report numbers", () => {
    const quota: ProviderQuota = {
      provider: "copilot",
      status: "ok",
      fetchedAt: 0,
      items: [{ label: "Premium requests", remaining: 30, entitlement: 300 }],
    };
    const summary = summarizeAgentQuota(quota, {});
    expect(summary.fraction).toBeCloseTo(0.1);
    expect(summary.details).toHaveLength(1);
  });
});
