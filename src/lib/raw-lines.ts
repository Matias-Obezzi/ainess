// The raw output of a run while it is still running, kept out of the store on purpose.
//
// Every line a CLI prints used to be appended to `runs[id].rawLines` in the store, in batches of
// 80ms. That gave `runs` a new identity twelve times a second for the whole length of a run, and
// eight components subscribe to the whole `runs` map — the composer you are typing into among them.
// The app went sluggish while an agent worked, and the reason was a buffer nothing on screen was
// reading: `rawLines` is only ever shown in one dialog, and only when you open it.
//
// So the lines live here while the run is alive. Two places take them out again:
//   - the run's exit, which writes them into the run once, where they are the record of what it did
//   - saving the project's history, so a crash mid-run still leaves the log on disk
//
// The dialog subscribes for the live case. Nothing else needs to know this module exists.

/** Same cap the store used to keep: enough to see what happened, bounded for a long run. */
const MAX_LINES = 2000;

const lines = new Map<string, string[]>();
const listeners = new Map<string, Set<() => void>>();
/**
 * How many times each run's buffer has changed.
 *
 * The buffer is one array appended to in place — a fresh copy per flush is the work this module
 * exists to avoid — so its identity never moves and `useSyncExternalStore`, which compares
 * snapshots with `Object.is`, would never notice a new line. The count is the snapshot instead.
 */
const versions = new Map<string, number>();

function notify(runId: string): void {
  versions.set(runId, (versions.get(runId) ?? 0) + 1);
  const subs = listeners.get(runId);
  if (!subs) return;
  for (const fn of subs) fn();
}

/** Adds to a run's buffer. Called from the stream flush, twelve times a second at most. */
export function appendRawLines(runId: string, incoming: string[]): void {
  if (incoming.length === 0) return;
  const current = lines.get(runId);
  if (!current) {
    lines.set(runId, incoming.slice(-MAX_LINES));
  } else {
    current.push(...incoming);
    // Trimmed in place: a fresh array every flush is the copying this module exists to avoid.
    if (current.length > MAX_LINES) current.splice(0, current.length - MAX_LINES);
  }
  notify(runId);
}

/** What has come in so far, or nothing when this run has no live buffer (finished, or restored). */
export function rawLinesOf(runId: string): string[] | undefined {
  return lines.get(runId);
}

/** What to hand `useSyncExternalStore` as the snapshot. See `versions`. */
export function rawLinesVersion(runId: string): number {
  return versions.get(runId) ?? 0;
}

/** Drops a run's buffer. Called once its lines have been written into the run itself. */
export function forgetRawLines(runId: string): void {
  lines.delete(runId);
  // Told before the version goes, so an open dialog re-reads and falls back to the run's own lines.
  // The listeners themselves stay: they are the dialog's, and it unsubscribes when it closes.
  const subs = listeners.get(runId);
  if (subs) for (const fn of subs) fn();
  versions.delete(runId);
}

/**
 * For `useSyncExternalStore` in the one dialog that shows this. Returns the unsubscribe, and is a
 * no-op for a run with no buffer — a finished run reads its lines off the run itself.
 */
export function subscribeRawLines(runId: string, onChange: () => void): () => void {
  const subs = listeners.get(runId) ?? new Set<() => void>();
  subs.add(onChange);
  listeners.set(runId, subs);
  return () => {
    subs.delete(onChange);
    if (subs.size === 0) listeners.delete(runId);
  };
}
