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
// A second reason to queue arrived later: the machine. Nothing bounded how many CLIs ran at once,
// and the approval dialog was the only throttle — attended you see ten delegations and approve them
// at your pace; unattended they all start together. `config.maxConcurrentRuns` is the ceiling, and
// it holds app-wide because two projects working at once share one machine. Over the ceiling a run
// is queued exactly like one behind a busy agent, so nothing is dropped and nothing is asked for
// twice: it starts the moment a slot frees.
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

/**
 * How many runs may hold a CLI process at once, app-wide, when nothing says otherwise.
 *
 * Four, not "as many as asked for": a run is a process that itself runs tests, builds and installs,
 * and ten delegations approving themselves unattended is ten of those at once on whatever machine
 * the app happens to be on.
 */
export const DEFAULT_MAX_CONCURRENT_RUNS = 4;

/** Runs with a process behind them right now. A `queued` one has none yet, so it costs nothing. */
export function runningRunCount(runs: Record<string, Run>): number {
  let n = 0;
  for (const r of Object.values(runs)) if (r.status === "running") n++;
  return n;
}

/**
 * Whether one more process fits under the ceiling.
 *
 * The count is every project's, not one project's: what is being protected is the machine, and
 * whoever has two projects working at once feels the sum. 0 — and a config too old to have the
 * field at all — means no ceiling, which is what the app did before this existed.
 */
export function slotAvailable(runs: Record<string, Run>, maxConcurrentRuns: number | undefined): boolean {
  if (!maxConcurrentRuns || maxConcurrentRuns <= 0) return true;
  return runningRunCount(runs) < maxConcurrentRuns;
}

/**
 * Everything queued anywhere, in the order the work arrived: the order a freed slot is handed out in.
 *
 * Arrival order is passed in rather than read off the runs because `startedAt` cannot carry it: a
 * loop of delegations queues several runs inside the same millisecond, and every one of them gets
 * the same number. This used to break that tie on `id`, which is a random UUID — so which run got
 * the freed slot was decided by a string comparison between two random strings. The caller holds the
 * real record of arrival: the insertion order of its map of queued runs.
 *
 * What is not in that record goes last, by the old comparison. A run only lands there if the process
 * that queued it is gone, and such a run cannot be launched at all (`launchRunsWaitingForSlot`
 * skips it), so nothing that can move is ordered by a coin flip.
 */
export function queuedRunsEverywhere(runs: Record<string, Run>, arrivalOrder: Iterable<string>): Run[] {
  const arrived = new Map<string, number>();
  for (const id of arrivalOrder) if (!arrived.has(id)) arrived.set(id, arrived.size);
  const at = (r: Run) => arrived.get(r.id) ?? Number.MAX_SAFE_INTEGER;
  return Object.values(runs)
    .filter(r => r.status === "queued")
    .sort((a, b) => at(a) - at(b) || a.startedAt - b.startedAt || a.id.localeCompare(b.id));
}
