// Session weight and auto-compaction threshold. Pure functions over runs:
// nothing here touches the store, React, or the transport.
import type { Run } from "@/types";

/**
 * ponytail: the knob to adjust if auto-compaction triggers too often or too rarely.
 *
 * Sits between the median (167k) and the 75th percentile (213k) of measured conversations,
 * so it triggers only on the heaviest sessions rather than on every turn.
 */
export const COMPACT_AT_TOKENS = 200_000;

/**
 * Decides whether a finished run's conversation has grown heavy enough to warrant compacting.
 *
 * Returns false when:
 * - `run.kind === "compact"` (a compaction run must never compact itself)
 * - `run.usage?.contextTokens` is missing (providers that do not report cache, like Antigravity,
 *   will never have it and that is expected)
 * - `contextTokens` is below the threshold
 */
export function shouldCompact(run: Run, threshold = COMPACT_AT_TOKENS): boolean {
  if (run.kind === "compact") return false;
  const tokens = run.usage?.contextTokens;
  if (typeof tokens !== "number" || Number.isNaN(tokens)) return false;
  return tokens >= threshold;
}

/**
 * Context tokens from the most recent run of this agent that reported them,
 * or undefined if none did.
 *
 * We take the most recent run rather than the all-time maximum: after a compaction,
 * the session starts fresh and lightweight, and the number has to drop on its own
 * when that happens. If we took the maximum, an already compacted session would
 * keep showing the stale peak forever.
 */
export function sessionWeight(runs: Run[], agentId: string): number | undefined {
  let latest: Run | undefined;
  for (const run of runs) {
    if (run.agentId !== agentId) continue;
    const tokens = run.usage?.contextTokens;
    if (typeof tokens !== "number" || Number.isNaN(tokens)) continue;
    if (!latest || run.startedAt >= latest.startedAt) {
      latest = run;
    }
  }
  return latest?.usage?.contextTokens;
}

