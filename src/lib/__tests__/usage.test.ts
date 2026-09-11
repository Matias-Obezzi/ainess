import { describe, it, expect } from "vitest";
import {
  dayKey,
  emptyTotals,
  formatCompact,
  formatCost,
  formatUsage,
  hasUsage,
  totalsByAgent,
  totalsByDay,
  totalsOf,
  totalsSince,
  totalTokens,
} from "@/lib/usage";
import type { Run, RunUsage } from "@/types";

const run = (over: Partial<Run> = {}): Run => ({
  id: "r1",
  projectId: "p1",
  agentId: "a1",
  parentRunId: null,
  rootRunId: "r1",
  prompt: "hacé algo",
  status: "done",
  startedAt: Date.parse("2026-09-06T10:00:00"),
  output: "",
  rawLines: [],
  childRunIds: [],
  round: 0,
  ...over,
});

const claude: RunUsage = { costUsd: 0.25, inputTokens: 100, outputTokens: 50, cachedInputTokens: 400, turns: 3, durationMs: 12_000 };
const copilot: RunUsage = { premiumRequests: 2, durationMs: 8_000 };

describe("hasUsage", () => {
  it("is false for a run that reported nothing that adds up", () => {
    expect(hasUsage(undefined)).toBe(false);
    expect(hasUsage({})).toBe(false);
    // Turns and duration are per-run detail: they do not make a run "reported".
    expect(hasUsage({ turns: 4, durationMs: 900 })).toBe(false);
  });

  it("is true as soon as one counted figure came in", () => {
    expect(hasUsage({ premiumRequests: 1 })).toBe(true);
    expect(hasUsage({ costUsd: 0 })).toBe(true);
  });
});

describe("totalsOf", () => {
  it("adds up what was reported and counts the rest as unreported", () => {
    const totals = totalsOf([
      run({ id: "1", usage: claude }),
      run({ id: "2", usage: copilot }),
      run({ id: "3" }),
      run({ id: "4", usage: {} }),
    ]);
    expect(totals).toEqual({
      costUsd: 0.25,
      inputTokens: 100,
      outputTokens: 50,
      cachedInputTokens: 400,
      premiumRequests: 2,
      runs: 4,
      unreported: 2,
    });
  });

  it("never invents a zero for a field nobody reported", () => {
    const totals = totalsOf([run({ usage: { premiumRequests: 3 } })]);
    expect(totals.costUsd).toBe(0);
    expect(totals.unreported).toBe(0);
    expect(totalTokens(totals)).toBe(0);
  });

  it("returns an empty set of totals for no runs", () => {
    expect(totalsOf([])).toEqual({ costUsd: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, premiumRequests: 0, runs: 0, unreported: 0 });
  });
});

describe("totalsByAgent", () => {
  it("keeps one bucket per agent", () => {
    const byAgent = totalsByAgent([
      run({ id: "1", agentId: "claude", usage: claude }),
      run({ id: "2", agentId: "claude", usage: { costUsd: 0.75 } }),
      run({ id: "3", agentId: "copilot", usage: copilot }),
      run({ id: "4", agentId: "agy" }),
    ]);
    expect(Object.keys(byAgent).sort()).toEqual(["agy", "claude", "copilot"]);
    expect(byAgent.claude.costUsd).toBeCloseTo(1);
    expect(byAgent.claude.runs).toBe(2);
    expect(byAgent.copilot.premiumRequests).toBe(2);
    expect(byAgent.agy).toMatchObject({ runs: 1, unreported: 1, costUsd: 0 });
  });
});

describe("totalsByDay", () => {
  const now = Date.parse("2026-09-06T15:00:00");
  const at = (iso: string) => Date.parse(iso);

  it("fills the whole window, oldest first, with the local day as the key", () => {
    const days = totalsByDay([], 3, now);
    expect(days.map(d => d.day)).toEqual(["2026-09-04", "2026-09-05", "2026-09-06"]);
    expect(days.every(d => d.totals.runs === 0)).toBe(true);
  });

  it("puts each run in its own local day and leaves out what falls outside", () => {
    const days = totalsByDay(
      [
        run({ id: "1", startedAt: at("2026-09-06T09:00:00"), usage: { costUsd: 1 } }),
        run({ id: "2", startedAt: at("2026-09-06T23:59:00"), usage: { costUsd: 2 } }),
        run({ id: "3", startedAt: at("2026-09-05T00:01:00"), usage: { costUsd: 4 } }),
        run({ id: "4", startedAt: at("2026-08-30T10:00:00"), usage: { costUsd: 99 } }),
      ],
      3,
      now,
    );
    expect(days.map(d => d.totals.costUsd)).toEqual([0, 4, 3]);
    expect(days[2].totals.runs).toBe(2);
    expect(days.reduce((n, d) => n + d.totals.runs, 0)).toBe(3);
  });

  it("uses the local calendar day, not UTC", () => {
    expect(dayKey(at("2026-09-06T00:30:00"))).toBe("2026-09-06");
    expect(dayKey(at("2026-09-06T23:30:00"))).toBe("2026-09-06");
  });
});

describe("formatting", () => {
  it("writes dollars the way the locale does, with more digits for cents of a cent", () => {
    expect(formatCost(0.42, "en")).toBe("$0.42");
    expect(formatCost(0.0031, "en")).toBe("$0.0031");
    expect(formatCost(12, "en")).toBe("$12.00");
    expect(formatCost(0.42, "es")).toContain("0,42");
  });

  it("shortens big counts", () => {
    expect(formatCompact(940, "en")).toBe("940");
    expect(formatCompact(1234, "en")).toBe("1.2k");
    expect(formatCompact(1_234_567, "en")).toBe("1.2M");
    expect(formatCompact(1234, "es")).toBe("1,2k");
  });

  it("puts one short line together and stays empty when there is nothing to say", () => {
    const totals = totalsOf([run({ usage: claude }), run({ id: "2", usage: copilot })]);
    expect(formatUsage(totals, "en", { tokens: "tokens", premiumRequests: "premium" }))
      .toBe("$0.25 · 550 tokens · 2 premium");
    expect(formatUsage(totalsOf([run({})]), "en")).toBe("");
  });
});

describe("a run's usage survives the trip to disk", () => {
  it("comes back with the same figures after the history file is written and read", () => {
    const saved = run({ usage: claude, rawLines: ["a", "b"] });
    // Same shape `src/lib/history.ts` writes: the run object, JSON, with its raw lines trimmed.
    const file = JSON.stringify({ version: 1, runs: [{ ...saved, rawLines: saved.rawLines.slice(-300) }], messages: [] });
    const back = (JSON.parse(file) as { runs: Run[] }).runs[0];
    expect(back.usage).toEqual(claude);
    expect(totalsOf([back]).costUsd).toBe(0.25);
  });
});

describe("totalsSince", () => {
  const run = (id: string, startedAt: number, costUsd: number): Run => ({
    id, projectId: "p1", agentId: "a1", parentRunId: null, rootRunId: id, prompt: "", status: "done",
    startedAt, output: "", rawLines: [], childRunIds: [], round: 0, usage: { costUsd },
  });

  it("adds up only what started inside the window", () => {
    const totals = totalsSince([run("viejo", 100, 1), run("nuevo", 5_000, 2)], 1_000);
    expect(totals.costUsd).toBe(2);
    expect(totals.runs).toBe(1);
  });

  it("takes a run that started exactly on the edge", () => {
    expect(totalsSince([run("justo", 1_000, 3)], 1_000).costUsd).toBe(3);
  });

  it("is empty for a window nothing started in", () => {
    expect(totalsSince([run("viejo", 100, 1)], 1_000)).toEqual(emptyTotals());
  });
});
