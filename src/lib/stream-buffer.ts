export interface RunDelta {
  text: string;
  lines: string[];
}

/**
 * Accumulates streaming output from the CLI processes so they can be
 * written to the store in batches, reducing React renders.
 * 
 * Pure data structure: no timers inside.
 */
export class StreamBuffer {
  private buffer = new Map<string, RunDelta>();

  /** Adds text to the accumulated text for a given run. */
  pushText(runId: string, text: string): void {
    const delta = this.buffer.get(runId);
    if (delta) {
      delta.text += text;
    } else {
      this.buffer.set(runId, { text, lines: [] });
    }
  }

  /** Adds a line to the accumulated raw lines for a given run. */
  pushLine(runId: string, line: string): void {
    const delta = this.buffer.get(runId);
    if (delta) {
      delta.lines.push(line);
    } else {
      this.buffer.set(runId, { text: "", lines: [line] });
    }
  }

  /** Checks if there are any accumulated changes for a given run. */
  has(runId: string): boolean {
    return this.buffer.has(runId);
  }

  /** Checks if the buffer is empty. */
  isEmpty(): boolean {
    return this.buffer.size === 0;
  }

  /** Returns everything accumulated so far, and leaves the buffer empty. */
  take(): Map<string, RunDelta> {
    const all = this.buffer;
    this.buffer = new Map<string, RunDelta>();
    return all;
  }

  /** Returns only that run's data, and leaves it out of the buffer. */
  takeRun(runId: string): RunDelta | undefined {
    const delta = this.buffer.get(runId);
    if (delta) {
      this.buffer.delete(runId);
    }
    return delta;
  }
}
