// A run parked waiting for quota gets a bounded number of goes, and the count survives the relaunch.
//
// The bug this pins: a relaunch that died of quota again was parked again, and "the last run ended"
// is one of the things that triggers a quota refresh — so the app relaunched the same prompt as
// fast as the CLI could fail, writing a message into the thread every time round. The count lived
// on the parked entry and the entry was dropped to relaunch it, so every attempt read as the first.
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { summarizeAgentQuota } from "@/lib/quota-summary";
import type { ProviderQuota } from "@/types";

const parked = (over: Partial<{ attempts: number; retrying: boolean }> = {}) => ({
  agentId: "a1",
  projectId: "p1",
  provider: "antigravity" as const,
  prompt: "hacé la migración",
  createdAt: 0,
  attempts: 0,
  ...over,
});

beforeEach(() => {
  useAppStore.setState({ quotaWaiting: {} });
});

describe("a parked run's attempt count", () => {
  it("goes up when it is relaunched, instead of the entry disappearing", () => {
    useAppStore.setState({ quotaWaiting: { r1: parked() } });
    useAppStore.getState().markQuotaRetrying("r1");

    const entry = useAppStore.getState().quotaWaiting.r1;
    expect(entry).toMatchObject({ attempts: 1, retrying: true });
  });

  it("marks it as in flight, so the next refresh does not launch it a second time", () => {
    useAppStore.setState({ quotaWaiting: { r1: parked() } });
    useAppStore.getState().markQuotaRetrying("r1");
    expect(useAppStore.getState().quotaWaiting.r1.retrying).toBe(true);
  });

  it("is forgotten once that piece of work is settled some other way", () => {
    useAppStore.setState({ quotaWaiting: { r1: parked({ attempts: 2 }), r2: parked({ attempts: 0 }) } });
    // Same project, same agent, same prompt: both entries are the same work.
    useAppStore.getState().clearQuotaWaitingFor("p1", "a1", "hacé la migración");
    expect(useAppStore.getState().quotaWaiting).toEqual({});
  });

  it("leaves another agent's parked work alone", () => {
    useAppStore.setState({ quotaWaiting: { r1: { ...parked(), agentId: "otro" } } });
    useAppStore.getState().clearQuotaWaitingFor("p1", "a1", "hacé la migración");
    expect(Object.keys(useAppStore.getState().quotaWaiting)).toEqual(["r1"]);
  });
});

describe("a provider that says it is out without saying how much there was", () => {
  const antigravity = (exhausted: boolean): ProviderQuota => ({
    provider: "antigravity",
    status: "ok",
    fetchedAt: 0,
    items: [{ label: "Pool Gemini", model: "gemini", exhausted, note: exhausted ? "Agotado" : "Disponible" }],
  });

  it("is reported as exhausted, not as a shrug", () => {
    // The whole reason the loop could start: with no numbers the summary said "ok", and everything
    // asking "is the quota back?" read that as a yes and relaunched into the same wall.
    expect(summarizeAgentQuota(antigravity(true), {}).status).toBe("exhausted");
    expect(summarizeAgentQuota(antigravity(true), {}).fraction).toBe(0);
  });

  it("still says nothing when the pool is available", () => {
    const summary = summarizeAgentQuota(antigravity(false), {});
    expect(summary.status).toBe("ok");
    expect(summary.fraction).toBeNull();
  });

  it("needs every pool used up before it counts as out", () => {
    const mixed: ProviderQuota = {
      provider: "antigravity",
      status: "ok",
      fetchedAt: 0,
      items: [
        { label: "Pool Gemini", model: "gemini", exhausted: true },
        { label: "Pool Claude", model: "claude", exhausted: false },
      ],
    };
    expect(summarizeAgentQuota(mixed, {}).status).toBe("ok");
  });
});
