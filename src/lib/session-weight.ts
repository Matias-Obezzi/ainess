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
