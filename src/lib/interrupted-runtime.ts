// Putting each agent back to what it was cut off in the middle of.
//
// Its own module rather than a corner of `history.ts` or `recovery.ts`: the merge that finds the
// interrupted runs lives in one and the theme belongs to the other, and having them import each
// other for a pure function would close a cycle between two modules that already point one way.
import type { AgentRuntime, Run } from "@/types";

/**
 * Puts each agent back to the task it was cut off in the middle of.
 *
 * A restart builds `runtime` from the team alone, so every agent comes back idle with nothing to
 * say. The runs are restored from disk and closed as interrupted, and the thread shows them — but
 * the hierarchy reads `runtime`, so a project that was mid-delegation when the app was updated came
 * back looking like a project where nothing had ever happened.
 *
 * `stopped` rather than `error`: nothing failed, the app went away. It is the same status a run
 * killed by hand leaves behind, which is the truth here too.
 *
 * Never overwrites an agent this process has already put to work. Startup order makes that unlikely
 * and not impossible — the merge is async, and a bridge message or a schedule hook can start a run
 * while it is in flight — and stomping a live run with a dead one's task would leave the hierarchy
 * describing the wrong thing entirely.
 */
export function runtimeAfterInterruption(
  runtime: Record<string, AgentRuntime>,
  interrupted: Run[],
): Record<string, AgentRuntime> {
  // The winner per agent first, then one write each: an agent can have several interrupted runs and
  // only the last one it was on is worth showing.
  const latest = new Map<string, Run>();
  for (const run of interrupted) {
    const seen = latest.get(run.agentId);
    if (!seen || run.startedAt > seen.startedAt) latest.set(run.agentId, run);
  }

  let next = runtime;
  for (const [agentId, run] of latest) {
    const current = next[agentId];
    if (!current) continue;                                          // the agent was deleted since
    if (current.status !== "idle" || current.currentRunId) continue; // busy right now: leave it be
    next = {
      ...next,
      [agentId]: { ...current, status: "stopped", currentTask: run.prompt, currentRunId: run.id },
    };
  }
  return next;
}
