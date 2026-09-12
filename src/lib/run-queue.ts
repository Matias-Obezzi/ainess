// One agent, one process. Work handed to an agent that is already in a turn waits its turn.
//
// The team is a hierarchy with one instance of each agent in it: "Reviewer" is one reviewer, not a
// pool. Nothing enforced that. A review was started for the implementer that had just finished
// while the same reviewer was still working on the task the planner gave it, and for six minutes
// there were two `agy.exe` writing the same agent's conversation at once. Every path that starts a
// run — a delegation, a review, an answer, a retry — goes through `startRun`, so that is where an
// agent that is busy gets a queued run instead of a second process, and the end of its current run
// is what launches the next one (`launchQueuedRuns`).
//
// The rules live here, apart from the orchestrator, so they can be read and tested on their own.
import type { Run, RunStatus } from "@/types";

/** Not over yet: either running or waiting to. A parent waiting on it keeps waiting. */
export function isLiveRun(status: RunStatus): boolean {
  return status === "running" || status === "queued";
}

/** Over, one way or another: done, failed or stopped. */
export function isFinishedRun(status: RunStatus): boolean {
  return !isLiveRun(status);
}

/** The runs waiting for this agent, in the order they were asked for. */
export function queuedRunsOf(runs: Record<string, Run>, agentId: string, projectId: string): Run[] {
  return Object.values(runs)
    .filter(r => r.agentId === agentId && r.projectId === projectId && r.status === "queued")
    .sort((a, b) => a.startedAt - b.startedAt || a.id.localeCompare(b.id));
}

/** The run that goes next for this agent, once whatever it is doing ends. */
export function nextQueuedRun(runs: Record<string, Run>, agentId: string, projectId: string): Run | undefined {
  return queuedRunsOf(runs, agentId, projectId)[0];
}
