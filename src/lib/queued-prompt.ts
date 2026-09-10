// What was written while somebody was busy, turned into the one message that gets handed over.
//
// A run is a process that already has its prompt, so anything typed mid-turn waits. It used to wait
// in single file: the first message went out when the turn ended, and the second waited for *that*
// turn to end. Three lines typed in one sitting became three turns — three runs, three cards on the
// board, and an agent acting on the first before it had read the correction in the third.
//
// They go together now. Order is kept and nothing is added: what the agent reads is what would have
// been read anyway, in one piece, which is also how a person types into a chat.

/** Blank line between them, the way a paragraph break already reads in a prompt. */
const SEPARATOR = "\n\n";

/**
 * The queued lines as a single prompt.
 *
 * Blank entries are dropped rather than joined: an empty line contributes nothing to the prompt but
 * would leave a gap that reads as something missing.
 */
export function joinQueued(texts: string[]): string {
  return texts.map(text => text.trim()).filter(Boolean).join(SEPARATOR);
}

/**
 * The same, for a turn that was cut short to deliver them.
 *
 * The note goes first and says so: without it the agent reads its own interrupted transcript as a
 * turn it finished, and picks up from a place it never got to. Empty in, empty out — a note with
 * nothing under it is worse than nothing, since it interrupts to say only that it interrupted.
 */
export function interruptedPrompt(note: string, texts: string[]): string {
  const body = joinQueued(texts);
  return body ? `${note}${SEPARATOR}${body}` : "";
}
