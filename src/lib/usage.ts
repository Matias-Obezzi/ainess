// What the runs of a project cost, added up. Pure functions over the runs already in the store:
// nothing here talks to a CLI, and nothing is ever estimated — a figure shows up only when the
// provider reported it (see `RunUsage` in src/types.ts).
//
// This is *spending history*, not quota: `src/lib/quota.ts` answers "how much is left", this one
// answers "how much was used".
import type { Run, RunUsage } from "@/types";

export interface UsageTotals {
  costUsd: number;
  inputTokens: number;
  outputTokens: number;
  cachedInputTokens: number;
  premiumRequests: number;
  runs: number;
  /** How many runs of the set reported nothing at all. */
  unreported: number;
}

/** The fields that add up into a total. `turns` and `durationMs` are per-run detail, not a total. */
const COUNTED_FIELDS = ["costUsd", "inputTokens", "outputTokens", "cachedInputTokens", "premiumRequests"] as const;

export function emptyTotals(): UsageTotals {
  return { costUsd: 0, inputTokens: 0, outputTokens: 0, cachedInputTokens: 0, premiumRequests: 0, runs: 0, unreported: 0 };
}

/** True when the CLI reported at least one figure that adds up. */
export function hasUsage(usage: RunUsage | undefined): boolean {
  if (!usage) return false;
  return COUNTED_FIELDS.some(field => typeof usage[field] === "number");
}

function add(totals: UsageTotals, usage: RunUsage | undefined): void {
  totals.runs += 1;
  if (!usage || !hasUsage(usage)) {
    totals.unreported += 1;
    return;
  }
  totals.costUsd += usage.costUsd ?? 0;
  totals.inputTokens += usage.inputTokens ?? 0;
  totals.outputTokens += usage.outputTokens ?? 0;
  totals.cachedInputTokens += usage.cachedInputTokens ?? 0;
  totals.premiumRequests += usage.premiumRequests ?? 0;
}

export function totalsOf(runs: Run[]): UsageTotals {
  const totals = emptyTotals();
  for (const run of runs) add(totals, run.usage);
  return totals;
}

export function totalsByAgent(runs: Run[]): Record<string, UsageTotals> {
  const byAgent: Record<string, UsageTotals> = {};
  for (const run of runs) {
    const totals = (byAgent[run.agentId] ??= emptyTotals());
    add(totals, run.usage);
  }
  return byAgent;
}

/** `YYYY-MM-DD` of a timestamp in the machine's own timezone (never UTC: the user reads local days). */
export function dayKey(ts: number): string {
  const d = new Date(ts);
  const month = `${d.getMonth() + 1}`.padStart(2, "0");
  const day = `${d.getDate()}`.padStart(2, "0");
  return `${d.getFullYear()}-${month}-${day}`;
}

/**
 * One entry per day of the window that ends today, oldest first — days with no run included, so a
 * bar chart can draw them as gaps. Runs outside the window are left out.
 */
export function totalsByDay(runs: Run[], days: number, now: number = Date.now()): Array<{ day: string; totals: UsageTotals }> {
  const window: Array<{ day: string; totals: UsageTotals }> = [];
  const index = new Map<string, UsageTotals>();
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  for (let i = days - 1; i >= 0; i--) {
    const d = new Date(today);
    d.setDate(today.getDate() - i);
    const key = dayKey(d.getTime());
    const totals = emptyTotals();
    index.set(key, totals);
    window.push({ day: key, totals });
  }
  for (const run of runs) {
    const totals = index.get(dayKey(run.startedAt));
    if (totals) add(totals, run.usage);
  }
  return window;
}

/** Runs of one project, in the shape the panels want them (a plain array). */
export function runsOfProject(runs: Record<string, Run>, projectId: string): Run[] {
  return Object.values(runs).filter(run => run.projectId === projectId);
}

/** Dollars the way the active locale writes them: "US$ 0,42" in Spanish, "$0.42" in English. */
export function formatCost(costUsd: number, locale: string): string {
  const fractionDigits = costUsd > 0 && costUsd < 0.01 ? 4 : 2;
  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency: "USD",
    minimumFractionDigits: fractionDigits,
    maximumFractionDigits: fractionDigits,
  }).format(costUsd);
}

/** Short token counts: 940, "1,2k", "3,4M". */
export function formatCompact(value: number, locale: string): string {
  const number = (n: number, digits: number) =>
    new Intl.NumberFormat(locale, { minimumFractionDigits: 0, maximumFractionDigits: digits }).format(n);
  if (value >= 1_000_000) return `${number(value / 1_000_000, 1)}M`;
  if (value >= 1_000) return `${number(value / 1_000, 1)}k`;
  return number(value, 0);
}

/** Every token the run moved: what went in, what came out and what came from the cache. */
export function totalTokens(totals: UsageTotals): number {
  return totals.inputTokens + totals.outputTokens + totals.cachedInputTokens;
}

/** Nouns `formatUsage` puts after the numbers. The UI passes them translated. */
export interface UsageLabels {
  tokens: string;
  premiumRequests: string;
}

const DEFAULT_LABELS: UsageLabels = { tokens: "tokens", premiumRequests: "premium" };

/**
 * One short line for a card: "US$ 0,42 · 1,2k tokens · 3 premium". Empty when nothing was
 * reported, so the caller can simply not render it.
 */
export function formatUsage(totals: UsageTotals, locale: string, labels: UsageLabels = DEFAULT_LABELS): string {
  const parts: string[] = [];
  if (totals.costUsd > 0) parts.push(formatCost(totals.costUsd, locale));
  const tokens = totalTokens(totals);
  if (tokens > 0) parts.push(`${formatCompact(tokens, locale)} ${labels.tokens}`);
  if (totals.premiumRequests > 0) parts.push(`${formatCompact(totals.premiumRequests, locale)} ${labels.premiumRequests}`);
  return parts.join(" · ");
}
