import { describe, it, expect } from "vitest";
import { parseAgyModels, parseOllamaList, parseResetDuration, poolOf, copilotQuotaFromJson, claudeQuotaFromJson } from "@/lib/quota";
import { useAppStore } from "@/store";
import { es, loadLanguage } from "@/i18n";
import { en } from "@/i18n/en";

/** What a window is called is a dictionary entry now, not a string built into the parser. */
async function withLanguage<T>(language: "es" | "en", body: () => T): Promise<T> {
  await loadLanguage(language);
  const before = useAppStore.getState().config.language;
  useAppStore.setState(state => ({ config: { ...state.config, language } }));
  try {
    return body();
  } finally {
    useAppStore.setState(state => ({ config: { ...state.config, language: before } }));
  }
}

describe("parseAgyModels", () => {
  it("parses id<TAB>label lines and ignores the header", () => {
    const stdout = "Fetching available models...\nclaude-opus-4-6-thinking\tClaude Opus 4.6 (Thinking)\ngemini-3.1-pro-high\tGemini 3.1 Pro (High)\n";
    expect(parseAgyModels(stdout)).toEqual([
      { id: "claude-opus-4-6-thinking", label: "Claude Opus 4.6 (Thinking)" },
      { id: "gemini-3.1-pro-high", label: "Gemini 3.1 Pro (High)" },
    ]);
  });

  it("returns an empty list when there is no tab-separated line", () => {
    expect(parseAgyModels("nothing here\njust text\n")).toEqual([]);
  });
});

describe("parseOllamaList", () => {
  it("skips the header line starting with NAME and takes the first whitespace-separated column", () => {
    const stdout = "NAME                ID              SIZE      MODIFIED\nllama3.1:8b         46e0c10c039e    4.7 GB    2 days ago\nmistral:latest      6276e6d9e374    4.1 GB    3 weeks ago\n";
    expect(parseOllamaList(stdout)).toEqual([
      { id: "llama3.1:8b", label: "llama3.1:8b" },
      { id: "mistral:latest", label: "mistral:latest" },
    ]);
  });

  it("handles blank output or header-only output", () => {
    expect(parseOllamaList("")).toEqual([]);
    expect(parseOllamaList("   \n\n  ")).toEqual([]);
    expect(parseOllamaList("NAME      ID    SIZE    MODIFIED\n")).toEqual([]);
  });

  it("handles CRLF line endings and spaces/tabs", () => {
    const stdout = "NAME\tID\tSIZE\r\nllama3.1:8b\t46e0c10c039e\t4.7GB\r\nqwen2.5-coder:7b\t2b04965d41c7\t4.7GB\r\n";
    expect(parseOllamaList(stdout)).toEqual([
      { id: "llama3.1:8b", label: "llama3.1:8b" },
      { id: "qwen2.5-coder:7b", label: "qwen2.5-coder:7b" },
    ]);
  });

  it("deduplicates multiple entries of the same model", () => {
    const stdout = "NAME ID\nllama3.1:8b 1\nllama3.1:8b 2\n";
    expect(parseOllamaList(stdout)).toEqual([
      { id: "llama3.1:8b", label: "llama3.1:8b" },
    ]);
  });
});

describe("parseResetDuration", () => {
  it("parses hours, minutes and seconds", () => {
    expect(parseResetDuration("1h45m26s")).toBe((1 * 3600 + 45 * 60 + 26) * 1000);
  });

  it("parses minutes only", () => {
    expect(parseResetDuration("45m")).toBe(45 * 60 * 1000);
  });

  it("parses seconds only", () => {
    expect(parseResetDuration("30s")).toBe(30 * 1000);
  });

  it("returns null for garbage", () => {
    expect(parseResetDuration("nope")).toBeNull();
    expect(parseResetDuration("")).toBeNull();
  });
});

describe("poolOf", () => {
  it("groups gemini and claude models into their family pool", () => {
    expect(poolOf("gemini-3.1-pro-high")).toBe("gemini");
    expect(poolOf("claude-opus-4-6-thinking")).toBe("claude");
  });

  it("falls back to the id up to the first hyphen", () => {
    expect(poolOf("gpt-oss-20b")).toBe("gpt");
  });

  it("uses the whole id when there is no hyphen", () => {
    expect(poolOf("solo")).toBe("solo");
  });
});

describe("copilotQuotaFromJson", () => {
  it("maps quota_snapshots to QuotaItem[]", () => {
    const obj = {
      quota_reset_date: "2026-10-01",
      quota_snapshots: {
        premium_interactions: { entitlement: 1500, remaining: 1383, percent_remaining: 92.2, unlimited: false },
        chat: { unlimited: true },
      },
    };
    const items = copilotQuotaFromJson(obj);
    expect(items).toHaveLength(2);
    const premium = items.find(i => i.label === "Premium requests");
    expect(premium).toMatchObject({ entitlement: 1500, remaining: 1383, percentRemaining: 92.2, unlimited: false });
    expect(premium?.resetsAt).toBe(Date.parse("2026-10-01"));
    const chat = items.find(i => i.label === "Chat");
    expect(chat).toMatchObject({ unlimited: true });
  });
});

describe("claudeQuotaFromJson", () => {
  it("maps five_hour/seven_day windows", async () => {
    const obj = {
      five_hour: { utilization: 9.0, resets_at: "2026-09-05T21:50:00Z" },
      seven_day: { utilization: 42.0, resets_at: "2026-09-08T00:00:00Z" },
    };
    const items = await withLanguage("es", () => claudeQuotaFromJson(obj));
    expect(items).toHaveLength(2);
    expect(items[0]).toMatchObject({ label: es["quota.claude.window5h"], usedPercent: 9.0 });
    expect(items[1]).toMatchObject({ label: es["quota.claude.week"], usedPercent: 42.0 });
  });

  it("names the windows in the language the app is in", async () => {
    const obj = { five_hour: { utilization: 9.0, resets_at: "2026-09-05T21:50:00Z" } };
    expect((await withLanguage("en", () => claudeQuotaFromJson(obj)))[0].label).toBe(en["quota.claude.window5h"]);
    expect((await withLanguage("es", () => claudeQuotaFromJson(obj)))[0].label).toBe(es["quota.claude.window5h"]);
  });

  it("adds per-model items when seven_day_opus/seven_day_sonnet are present", async () => {
    const obj = {
      five_hour: { utilization: 9.0, resets_at: "2026-09-05T21:50:00Z" },
      seven_day: { utilization: 42.0, resets_at: "2026-09-08T00:00:00Z" },
      seven_day_opus: { utilization: 10.0, resets_at: "2026-09-08T00:00:00Z" },
      seven_day_sonnet: null,
    };
    const items = await withLanguage("es", () => claudeQuotaFromJson(obj));
    expect(items.find(i => i.model === "opus")).toMatchObject({ label: "Semana (Opus)", usedPercent: 10.0 });
    expect(items.find(i => i.model === "sonnet")).toBeUndefined();
  });
});
