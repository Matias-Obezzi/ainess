// What of a run's activity is on screen, and what is folded behind the line that shows it.
//
// A working agent writes a line per tool call, and a long run writes hundreds. They arrived in the
// thread as a list that only grew, so a single run pushed the conversation off the top of the
// screen and what it was doing *now* — the one line worth reading — was buried in what it had
// already finished. Only the current step is shown; the rest is one click away.
//
// Not everything folds. A `text` row is the agent talking, and a `delegation` row is another
// agent's whole card, approval prompt and all — folding those would hide the answer and the thing
// waiting for a yes. An `error` stays for the same reason: it is an outcome, not a step. What folds
// is the running commentary, which is exactly what the ticker was made for.

/** Kinds the ticker speaks for. Everything else is drawn in full, collapsed or not. */
const STEP_KINDS = new Set(["tool", "system"]);

export function isStep(kind: string): boolean {
  return STEP_KINDS.has(kind);
}

export interface ActivityView<T> {
  /** What to draw above the ticker, in arrival order. */
  rows: T[];
  /** The step the ticker is showing, or null when the run has not taken one yet. */
  current: T | null;
  /** Steps the ticker is standing in for. Zero when there is nothing behind it. */
  hidden: number;
}

/**
 * Splits a run's rows into the ticker's step and everything drawn above it.
 *
 * The current step is always the last one taken, and it is never in `rows`: it is the ticker, and a
 * row shown twice reads as the agent having done it twice.
 */
export function activityView<T extends { kind: string }>(rows: T[], expanded: boolean): ActivityView<T> {
  let current: T | null = null;
  for (let i = rows.length - 1; i >= 0; i--) {
    if (isStep(rows[i].kind)) {
      current = rows[i];
      break;
    }
  }

  const above: T[] = [];
  let hidden = 0;
  for (const row of rows) {
    if (row === current) continue;
    if (!isStep(row.kind)) {
      above.push(row);
      continue;
    }
    hidden++;
    if (expanded) above.push(row);
  }

  return { rows: above, current, hidden };
}
