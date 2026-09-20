import type { AgentConfig, Run } from "@/types";
import { PROVIDERS } from "@/lib/providers";

/**
 * The models offered when retrying with `agent`, with the agent's own included.
 *
 * Always a copy. Handing back the provider's own array would put the list every agent of that
 * provider reads one `sort` or `push` away from whoever asked for it.
 */
export function retryModels(agent: AgentConfig): string[] {
  const defaults = PROVIDERS[agent.provider]?.defaultModels ?? [];
  if (agent.model && !defaults.includes(agent.model)) return [...defaults, agent.model];
  return [...defaults];
}

/** The model to preselect: the one the run used, but only when the new agent can run it. */
export function retryModelFor(agent: AgentConfig, previous: string | undefined): string | undefined {
  if (!previous) return undefined;
  return retryModels(agent).includes(previous) ? previous : undefined;
}

/**
 * The root runs a thread draws, in the order it draws them.
 *
 * A retry replaces the run it retries instead of queueing behind it, so two things happen here: the
 * replaced run is dropped — it stays in the store and on disk, reachable from the detail of the run
 * that took its place, it is only no longer drawn — and the replacement is sorted by when the
 * *first* attempt of its chain started, which is where the reader's eye already was. Its own
 * `startedAt` keeps saying when this attempt began: the clock on the bubble and the elapsed time
 * are read off it.
 */
export function shownRootRuns(runs: Run[]): Run[] {
  const byId = new Map(runs.map(run => [run.id, run]));
  // A run that replaces itself is a corrupt record, and taking it at its word would drop a turn off
  // the thread for good. It is drawn, like any run nothing replaced.
  const replaced = new Set(
    runs.filter(run => run.replacesRunId && run.replacesRunId !== run.id).map(run => run.replacesRunId as string),
  );

  // Same file, same reason: a chain can point at a run that is not here — it was trimmed — or round
  // in a circle. Either way the walk has to end.
  const chainStartedAt = (run: Run): number => {
    const seen = new Set([run.id]);
    let first = run;
    while (first.replacesRunId && !seen.has(first.replacesRunId)) {
      const previous = byId.get(first.replacesRunId);
      if (!previous) break;
      seen.add(previous.id);
      first = previous;
    }
    return first.startedAt;
  };

  return runs
    .filter(run => !replaced.has(run.id))
    .sort((a, b) => chainStartedAt(a) - chainStartedAt(b));
}
