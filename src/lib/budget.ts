// Spending limits and budget enforcement per project. Pure functions over runs and limits:
// nothing here touches the store, React, or the transport. All calculations use the machine's
// local timezone (mirroring dayKey from usage.ts) because users track spending by their own day.
import type { Run, Budget } from "@/types";
import { dayKey } from "@/lib/usage";

export type { Budget };

export interface BudgetState {
  /** Spent today and this month, in dollars. */
  spentToday: number;
  spentMonth: number;
  /** 0 to 1 against whichever limit is closest to being reached; undefined with no limits. */
  ratio?: number;
  /** Which limit is the one about to be hit. */
  limit?: { kind: "daily" | "monthly"; usd: number };
  /** Over the limit right now. */
  exceeded: boolean;
  /** Past the warning threshold but not over. */
  warning: boolean;
}

export const BUDGET_WARN_AT = 0.8;

/** True only for non-zero positive finite numbers. 0, negative, NaN or undefined mean no limit. */
function isValidLimit(usd: number | undefined): usd is number {
  return typeof usd === "number" && !Number.isNaN(usd) && Number.isFinite(usd) && usd > 0;
}

/**
 * Calculates current spending and threshold state against configured daily and monthly limits.
 * Spending is summed only from reported costUsd figures.
 */
export function budgetState(runs: Run[], budget: Budget | undefined, now: number = Date.now()): BudgetState {
  const today = dayKey(now);
  const nowDate = new Date(now);
  const currentYear = nowDate.getFullYear();
  const currentMonth = nowDate.getMonth();

  let spentToday = 0;
  let spentMonth = 0;

  for (const run of runs) {
    const cost = (typeof run.usage?.costUsd === "number" && !Number.isNaN(run.usage.costUsd))
      ? run.usage.costUsd
      : 0;
    if (cost <= 0) continue;

    if (dayKey(run.startedAt) === today) {
      spentToday += cost;
    }

    const d = new Date(run.startedAt);
    if (d.getFullYear() === currentYear && d.getMonth() === currentMonth) {
      spentMonth += cost;
    }
  }

  const hasDaily = isValidLimit(budget?.dailyUsd);
  const hasMonthly = isValidLimit(budget?.monthlyUsd);

  let ratio: number | undefined;
  let limit: { kind: "daily" | "monthly"; usd: number } | undefined;

  if (hasDaily && hasMonthly) {
    const dailyRatio = spentToday / budget!.dailyUsd!;
    const monthlyRatio = spentMonth / budget!.monthlyUsd!;
    if (dailyRatio >= monthlyRatio) {
      ratio = dailyRatio;
      limit = { kind: "daily", usd: budget!.dailyUsd! };
    } else {
      ratio = monthlyRatio;
      limit = { kind: "monthly", usd: budget!.monthlyUsd! };
    }
  } else if (hasDaily) {
    ratio = spentToday / budget!.dailyUsd!;
    limit = { kind: "daily", usd: budget!.dailyUsd! };
  } else if (hasMonthly) {
    ratio = spentMonth / budget!.monthlyUsd!;
    limit = { kind: "monthly", usd: budget!.monthlyUsd! };
  }

  const exceeded = ratio !== undefined && ratio >= 1;
  const warning = ratio !== undefined && !exceeded && ratio >= BUDGET_WARN_AT;

  return {
    spentToday,
    spentMonth,
    ratio,
    limit,
    exceeded,
    warning,
  };
}

/** Whether a new run may start. A budget that only warns never stops anything. */
export function budgetAllowsStart(state: BudgetState, budget: Budget | undefined): boolean {
  return !(budget?.onReached === "block" && state.exceeded);
}


/**
 * Whether one run cost more than a single run is allowed to.
 *
 * Answered from what the run reported, which is all there is: every CLI here prints its cost when
 * it finishes and not while it works, so there is nothing to compare against mid-run. A run with no
 * cost reported is not over: absence of a number is not a large number.
 */
export function runOverCap(run: Pick<Run, "usage">, budget: Budget | undefined): boolean {
  if (!isValidLimit(budget?.perRunUsd)) return false;
  const cost = run.usage?.costUsd;
  if (typeof cost !== "number" || Number.isNaN(cost)) return false;
  return cost > budget!.perRunUsd!;
}

/**
 * The run of this chain that blew the per-run ceiling, if any.
 *
 * The whole chain and not just the last one: a root, its rounds and everything it delegated are one
 * piece of work as far as the ceiling is concerned, and letting the next round start because the
 * expensive run was two rounds ago is how a ceiling stops being one.
 */
export function capBreachIn(runs: Run[], rootRunId: string | undefined, budget: Budget | undefined): Run | undefined {
  if (!rootRunId || !isValidLimit(budget?.perRunUsd)) return undefined;
  return runs.find(r => (r.rootRunId === rootRunId || r.id === rootRunId) && runOverCap(r, budget));
}

/** Whether the chain may carry on. A budget that only warns never stops anything. */
export function capAllowsContinue(breach: Run | undefined, budget: Budget | undefined): boolean {
  return !(budget?.onReached === "block" && !!breach);
}
