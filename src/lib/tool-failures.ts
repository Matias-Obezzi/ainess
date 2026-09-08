/**
 * How often a tool has failed inside one run.
 *
 * A tool that fails is the agent's own business: it retries and carries on, and shouting about it
 * only frightens whoever is reading. The same tool failing again and again is a different thing —
 * that is an agent going in circles — so the failures are counted per run and per tool, and the
 * threshold is the one moment worth saying out loud.
 */
export function bumpToolFailure(counts: Map<string, number>, runId: string, tool: string): number {
  const key = `${runId}:${tool}`;
  const count = (counts.get(key) ?? 0) + 1;
  counts.set(key, count);
  return count;
}

export const REPEATED_FAILURE_AT = 3;
