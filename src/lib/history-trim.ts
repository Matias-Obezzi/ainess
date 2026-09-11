// How much of an agent's raw output a project's history file is allowed to carry.
//
// The file is rewritten in full every time it is saved, and read and parsed back before each write
// so another process's decisions are not lost. That is fine for a feed of messages and expensive
// for a feed of raw CLI output, which is most of what was in there: on this machine one project's
// file had grown to 47 MB, 83% of it raw lines, and the app was spending more than half of every
// second doing JSON on it — while an agent works, which is exactly when it is saving.
//
// The old cap counted lines and ignored their size. A `stream-json` line is a whole message: the
// median one here is 313 bytes, the 99th percentile is 17 KB, and the largest single line measured
// was 536 KB. Counting them was measuring the wrong thing.
//
// So three limits instead of one, and they cut that file to 7 MB. Nothing here decides what is
// shown while a run is alive — the live buffer in `lib/raw-lines` is untouched and the parsers
// never see a trimmed line. This is only what survives to disk.

/**
 * Longest single line kept, in characters.
 *
 * A raw line is read by a person in a scrolling box, and past a couple of thousand characters
 * nobody reads it: they read that it is long. Cutting says so and costs nothing else.
 */
export const MAX_LINE_CHARS = 2048;

/** Most raw output kept for one run, in characters, counted from its last line backwards. */
export const MAX_RUN_RAW_CHARS = 64 * 1024;

/**
 * How many of the most recent runs keep their raw output at all.
 *
 * Older ones keep everything else — the prompt, the answer, what it cost. What goes is the
 * transcript of how the CLI said it, which is a debugging aid for something that just happened.
 */
export const RUNS_KEEPING_RAW = 30;

const CUT_MARK = "…";

/**
 * The tail of a run's raw output, within both limits.
 *
 * The tail rather than the head: what a run was doing when it ended is the part anyone opens the
 * raw view to see. A line that alone is over the run's budget is still kept, cut to the line limit,
 * so a run whose every line is enormous does not come back empty.
 */
export function trimRawLines(lines: string[]): string[] {
  const kept: string[] = [];
  let chars = 0;
  for (let i = lines.length - 1; i >= 0; i--) {
    const line = lines[i];
    const cut = line.length > MAX_LINE_CHARS ? line.slice(0, MAX_LINE_CHARS) + CUT_MARK : line;
    if (chars + cut.length > MAX_RUN_RAW_CHARS && kept.length > 0) break;
    kept.unshift(cut);
    chars += cut.length;
    if (chars >= MAX_RUN_RAW_CHARS) break;
  }
  return kept;
}

/**
 * The runs as they go to disk: oldest first, and only the last `RUNS_KEEPING_RAW` of them carrying
 * any raw output.
 */
export function trimRunsForDisk<T extends { rawLines?: string[] }>(
  runs: T[],
  linesOf: (run: T) => string[] | undefined,
): T[] {
  const firstKeeping = Math.max(0, runs.length - RUNS_KEEPING_RAW);
  return runs.map((run, i) => ({
    ...run,
    rawLines: i >= firstKeeping ? trimRawLines(linesOf(run) ?? []) : [],
  }));
}

/**
 * Whether trimming would change anything, answered without building the trimmed copy.
 *
 * Called for every finished run each time one ends, so it stops counting the moment it is over
 * budget rather than measuring the whole buffer to find out it is enormous.
 */
export function needsTrim(lines: string[]): boolean {
  let chars = 0;
  for (const line of lines) {
    if (line.length > MAX_LINE_CHARS) return true;
    chars += line.length;
    if (chars > MAX_RUN_RAW_CHARS) return true;
  }
  return false;
}
