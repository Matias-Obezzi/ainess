// The facts under the card for a run that died of quota: when it is back, and whether the work has
// since been tried again.
import { describe, it, expect } from "vitest";
import { quotaResetsAt, retriedLater } from "@/lib/quota-card";
import { outOfQuota } from "@/lib/quota";
import { explainError } from "@/lib/errors";
import type { ProviderQuota, Run } from "@/types";

const quota = (items: ProviderQuota["items"], status: ProviderQuota["status"] = "ok"): ProviderQuota => ({
  provider: "claude", status, fetchedAt: 0, items,
});

describe("quotaResetsAt", () => {
  it("prefers the reset of what is actually used up", () => {
    const q = quota([
      { label: "5h", resetsAt: 1_000, usedPercent: 40 },
      { label: "week", resetsAt: 9_000, exhausted: true },
    ]);
    expect(quotaResetsAt(q)).toBe(9_000);
  });

  it("falls back to the earliest reset when nothing says it is spent", () => {
    const q = quota([{ label: "a", resetsAt: 5_000 }, { label: "b", resetsAt: 2_000 }]);
    expect(quotaResetsAt(q)).toBe(2_000);
  });

  it("keeps to the items of the model that ran", () => {
    const q = quota([
      { label: "gemini", model: "gemini", resetsAt: 1_000, exhausted: true },
      { label: "claude", model: "claude", resetsAt: 3_000, exhausted: true },
    ]);
    expect(quotaResetsAt(q, "claude-sonnet-5")).toBe(3_000);
  });

  it("knows nothing without a reading", () => {
    expect(quotaResetsAt(undefined)).toBeUndefined();
    expect(quotaResetsAt(quota([], "error"))).toBeUndefined();
    expect(quotaResetsAt(quota([{ label: "x" }]))).toBeUndefined();
  });
});

describe("retriedLater", () => {
  const run = (id: string, startedAt: number, over: Partial<Run> = {}): Run => ({
    id, projectId: "p1", agentId: "a1", parentRunId: null, rootRunId: id, prompt: "fix it", status: "error",
    startedAt, output: "", rawLines: [], childRunIds: [], round: 0, ...over,
  });

  it("sees the same work started again afterwards", () => {
    const runs = { dead: run("dead", 1), again: run("again", 2) };
    expect(retriedLater(runs, runs.dead)).toBe(true);
  });

  it("does not count an earlier run, another prompt, another agent or a child", () => {
    const dead = run("dead", 5);
    expect(retriedLater({ dead, before: run("before", 1) }, dead)).toBe(false);
    expect(retriedLater({ dead, other: run("other", 9, { prompt: "something else" }) }, dead)).toBe(false);
    expect(retriedLater({ dead, theirs: run("theirs", 9, { agentId: "a2" }) }, dead)).toBe(false);
    expect(retriedLater({ dead, child: run("child", 9, { parentRunId: "dead" }) }, dead)).toBe(false);
  });
});

// The phrase Claude Code actually prints when the five-hour window is spent. It was not on the
// list, so the run that died of it was shown as an answer made of that sentence.
describe("the session limit", () => {
  it("is out of quota, and explained as such", () => {
    const text = "You've hit your session limit. Resets in 2h30m10s.";
    expect(outOfQuota(text)).toBe(true);
    expect(outOfQuota("You've hit your usage limit")).toBe(true);
    expect(explainError(text).kind).toBe("quota");
    expect(explainError(text).values?.wait).toBeTruthy();
  });

  it("is not read into a sentence that only mentions a limit", () => {
    expect(outOfQuota("the rate limiter class has a limit field")).toBe(false);
  });
});
