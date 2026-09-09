import { describe, it, expect } from "vitest";
import {
  budgetState,
  budgetAllowsStart,
  BUDGET_WARN_AT,
  type Budget,
  type BudgetState,
} from "@/lib/budget";
import type { Run } from "@/types";

function makeRun(over: Partial<Run> = {}): Run {
  return {
    id: "r1",
    projectId: "p1",
    agentId: "a1",
    parentRunId: null,
    rootRunId: "r1",
    prompt: "test",
    status: "done",
    startedAt: new Date(2026, 8, 8, 12, 0, 0).getTime(), // Sep 8, 2026 local time
    output: "",
    rawLines: [],
    childRunIds: [],
    round: 0,
    ...over,
  };
}

describe("budgetState", () => {
  const fixedNow = new Date(2026, 8, 8, 15, 0, 0).getTime(); // Sep 8, 2026 15:00 local time

  it("handles no budget: ratio and limit are undefined, exceeded and warning are false", () => {
    const runs = [makeRun({ usage: { costUsd: 10 } })];

    const s1 = budgetState(runs, undefined, fixedNow);
    expect(s1.ratio).toBeUndefined();
    expect(s1.limit).toBeUndefined();
    expect(s1.exceeded).toBe(false);
    expect(s1.warning).toBe(false);
    expect(s1.spentToday).toBe(10);
    expect(s1.spentMonth).toBe(10);

    const s2 = budgetState(runs, { onReached: "warn" }, fixedNow);
    expect(s2.ratio).toBeUndefined();
    expect(s2.limit).toBeUndefined();
    expect(s2.exceeded).toBe(false);
    expect(s2.warning).toBe(false);

    const s3 = budgetState(runs, { dailyUsd: undefined, monthlyUsd: undefined, onReached: "block" }, fixedNow);
    expect(s3.ratio).toBeUndefined();
    expect(s3.limit).toBeUndefined();
    expect(s3.exceeded).toBe(false);
    expect(s3.warning).toBe(false);
  });

  it("handles only daily limit and only monthly limit", () => {
    const runs = [makeRun({ usage: { costUsd: 5 } })];

    const dailyBudget: Budget = { dailyUsd: 10, onReached: "warn" };
    const sDaily = budgetState(runs, dailyBudget, fixedNow);
    expect(sDaily.limit).toEqual({ kind: "daily", usd: 10 });
    expect(sDaily.ratio).toBe(0.5);
    expect(sDaily.exceeded).toBe(false);
    expect(sDaily.warning).toBe(false);

    const monthlyBudget: Budget = { monthlyUsd: 50, onReached: "block" };
    const sMonthly = budgetState(runs, monthlyBudget, fixedNow);
    expect(sMonthly.limit).toEqual({ kind: "monthly", usd: 50 });
    expect(sMonthly.ratio).toBe(0.1);
    expect(sMonthly.exceeded).toBe(false);
    expect(sMonthly.warning).toBe(false);
  });

  it("with both limits, picks the one closest to being reached (highest ratio)", () => {
    const budget: Budget = { dailyUsd: 10, monthlyUsd: 100, onReached: "warn" };

    // Today: 8 (ratio 0.8), Month: 50 (ratio 0.5) -> daily wins (0.8 > 0.5)
    const runsDailyCloser = [
      makeRun({ id: "today", startedAt: fixedNow, usage: { costUsd: 8 } }),
      makeRun({ id: "yesterday", startedAt: new Date(2026, 8, 7, 12, 0, 0).getTime(), usage: { costUsd: 42 } }),
    ];
    const s1 = budgetState(runsDailyCloser, budget, fixedNow);
    expect(s1.spentToday).toBe(8);
    expect(s1.spentMonth).toBe(50);
    expect(s1.limit).toEqual({ kind: "daily", usd: 10 });
    expect(s1.ratio).toBe(0.8);

    // Today: 2 (ratio 0.2), Month: 90 (ratio 0.9) -> monthly wins (0.9 > 0.2)
    const runsMonthlyCloser = [
      makeRun({ id: "today", startedAt: fixedNow, usage: { costUsd: 2 } }),
      makeRun({ id: "yesterday", startedAt: new Date(2026, 8, 7, 12, 0, 0).getTime(), usage: { costUsd: 88 } }),
    ];
    const s2 = budgetState(runsMonthlyCloser, budget, fixedNow);
    expect(s2.spentToday).toBe(2);
    expect(s2.spentMonth).toBe(90);
    expect(s2.limit).toEqual({ kind: "monthly", usd: 100 });
    expect(s2.ratio).toBe(0.9);
  });

  it("ignores limits that are 0, negative, or NaN", () => {
    const runs = [makeRun({ usage: { costUsd: 5 } })];

    const sZero = budgetState(runs, { dailyUsd: 0, monthlyUsd: -20, onReached: "warn" }, fixedNow);
    expect(sZero.limit).toBeUndefined();
    expect(sZero.ratio).toBeUndefined();
    expect(sZero.exceeded).toBe(false);
    expect(sZero.warning).toBe(false);

    const sNaN = budgetState(runs, { dailyUsd: Number.NaN, monthlyUsd: 50, onReached: "block" }, fixedNow);
    expect(sNaN.limit).toEqual({ kind: "monthly", usd: 50 });
    expect(sNaN.ratio).toBe(0.1);
  });

  it("verifies threshold behavior: 0.79 is not warning, 0.80 is warning, 1.0 is exceeded and not warning", () => {
    expect(BUDGET_WARN_AT).toBe(0.8);
    const budget: Budget = { dailyUsd: 100, onReached: "warn" };

    // 79% -> neither warning nor exceeded
    const s79 = budgetState([makeRun({ usage: { costUsd: 79 } })], budget, fixedNow);
    expect(s79.ratio).toBe(0.79);
    expect(s79.warning).toBe(false);
    expect(s79.exceeded).toBe(false);

    // 80% -> warning, not exceeded
    const s80 = budgetState([makeRun({ usage: { costUsd: 80 } })], budget, fixedNow);
    expect(s80.ratio).toBe(0.8);
    expect(s80.warning).toBe(true);
    expect(s80.exceeded).toBe(false);

    // 99% -> warning, not exceeded
    const s99 = budgetState([makeRun({ usage: { costUsd: 99 } })], budget, fixedNow);
    expect(s99.ratio).toBe(0.99);
    expect(s99.warning).toBe(true);
    expect(s99.exceeded).toBe(false);

    // 100% -> exceeded, not warning
    const s100 = budgetState([makeRun({ usage: { costUsd: 100 } })], budget, fixedNow);
    expect(s100.ratio).toBe(1.0);
    expect(s100.warning).toBe(false);
    expect(s100.exceeded).toBe(true);

    // 120% -> exceeded, not warning
    const s120 = budgetState([makeRun({ usage: { costUsd: 120 } })], budget, fixedNow);
    expect(s120.ratio).toBe(1.2);
    expect(s120.warning).toBe(false);
    expect(s120.exceeded).toBe(true);
  });

  it("yesterday runs count for the month but not for today; last month runs count for neither", () => {
    const runs = [
      makeRun({ id: "today", startedAt: new Date(2026, 8, 8, 10, 0, 0).getTime(), usage: { costUsd: 5 } }),
      makeRun({ id: "yesterday", startedAt: new Date(2026, 8, 7, 18, 0, 0).getTime(), usage: { costUsd: 15 } }),
      makeRun({ id: "lastMonth", startedAt: new Date(2026, 7, 31, 23, 59, 59).getTime(), usage: { costUsd: 50 } }),
      makeRun({ id: "lastYear", startedAt: new Date(2025, 8, 8, 10, 0, 0).getTime(), usage: { costUsd: 100 } }),
    ];

    const state = budgetState(runs, undefined, fixedNow);
    expect(state.spentToday).toBe(5);
    expect(state.spentMonth).toBe(20); // 5 + 15
  });

  it("runs without usage or with usage missing costUsd add 0", () => {
    const runs = [
      makeRun({ id: "r1", usage: undefined }),
      makeRun({ id: "r2", usage: {} }),
      makeRun({ id: "r3", usage: { inputTokens: 500, outputTokens: 200 } }),
      makeRun({ id: "r4", usage: { costUsd: undefined } }),
      makeRun({ id: "r5", usage: { costUsd: Number.NaN } }),
    ];

    const state = budgetState(runs, { dailyUsd: 10, onReached: "warn" }, fixedNow);
    expect(state.spentToday).toBe(0);
    expect(state.spentMonth).toBe(0);
    expect(state.ratio).toBe(0);
    expect(state.warning).toBe(false);
    expect(state.exceeded).toBe(false);
  });
});

describe("budgetAllowsStart", () => {
  const normalState: BudgetState = {
    spentToday: 5,
    spentMonth: 10,
    ratio: 0.5,
    limit: { kind: "daily", usd: 10 },
    exceeded: false,
    warning: false,
  };

  const warningState: BudgetState = {
    spentToday: 8,
    spentMonth: 15,
    ratio: 0.8,
    limit: { kind: "daily", usd: 10 },
    exceeded: false,
    warning: true,
  };

  const exceededState: BudgetState = {
    spentToday: 12,
    spentMonth: 20,
    ratio: 1.2,
    limit: { kind: "daily", usd: 10 },
    exceeded: true,
    warning: false,
  };

  it("with 'warn' policy, never stops starting even when exceeded", () => {
    const warnBudget: Budget = { dailyUsd: 10, onReached: "warn" };
    expect(budgetAllowsStart(normalState, warnBudget)).toBe(true);
    expect(budgetAllowsStart(warningState, warnBudget)).toBe(true);
    expect(budgetAllowsStart(exceededState, warnBudget)).toBe(true);
  });

  it("with 'block' policy, stops starting only when exceeded", () => {
    const blockBudget: Budget = { dailyUsd: 10, onReached: "block" };
    expect(budgetAllowsStart(normalState, blockBudget)).toBe(true);
    expect(budgetAllowsStart(warningState, blockBudget)).toBe(true);
    expect(budgetAllowsStart(exceededState, blockBudget)).toBe(false);
  });

  it("with undefined budget, allows starting", () => {
    expect(budgetAllowsStart(normalState, undefined)).toBe(true);
    expect(budgetAllowsStart(exceededState, undefined)).toBe(true);
  });
});
