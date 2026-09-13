// A run that has gone quiet. An agent stuck on a prompt nobody will answer, a CLI waiting on a
// network that is not coming back, a model that stopped streaming — all of them look exactly like
// an agent thinking hard, for as long as you care to wait. The time since the last line it printed
// is the one thing that tells them apart, and it lives here, out of the store: it moves with every
// line, and every line moving the store is the slowness `lib/raw-lines` was written to end.

/** Quiet this long, and the run's ticker says so. */
export const STALL_AFTER_MS = 3 * 60_000;
/** Quiet this long, and the bell rings once. */
export const STALL_NOTIFY_MS = 10 * 60_000;

const lastOutput = new Map<string, number>();
const announced = new Set<string>();

/** A line arrived for this run. */
export function touchRun(runId: string, now = Date.now()): void {
  lastOutput.set(runId, now);
}

/** When the run last printed anything, or nothing when it never has in this process. */
export function lastOutputAt(runId: string): number | undefined {
  return lastOutput.get(runId);
}

/** The run is over: nothing left to time. */
export function forgetStall(runId: string): void {
  lastOutput.delete(runId);
  announced.delete(runId);
}

/** How long a run has been quiet: since its last line, or since it started when there was none. */
export function silenceMs(last: number | undefined, startedAt: number, now: number): number {
  return Math.max(0, now - (last ?? startedAt));
}

/**
 * The runs that have been quiet long enough to say so, each one once. A run that prints again
 * and goes quiet again is not announced twice: the first time was the news.
 */
export function stalledRuns<T extends { id: string; startedAt: number }>(running: T[], now: number, after = STALL_NOTIFY_MS): T[] {
  const out: T[] = [];
  for (const run of running) {
    if (announced.has(run.id)) continue;
    if (silenceMs(lastOutput.get(run.id), run.startedAt, now) < after) continue;
    announced.add(run.id);
    out.push(run);
  }
  return out;
}

/** For tests: back to nothing known. */
export function resetStalls(): void {
  lastOutput.clear();
  announced.clear();
}
