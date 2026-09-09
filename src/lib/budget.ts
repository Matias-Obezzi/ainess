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
