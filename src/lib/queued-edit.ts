// Editing what is waiting for an agent.
//
// A queued line can only be edited while it is still waiting: once the turn ends or someone hits
// send-now, that line becomes a running prompt or has already been drained. Checking that the line
// at `index` still matches `previous` ensures an edit never overwrites a shifted line or resurrects
// a line that already went out.
import type { CommMessage } from "@/types";

/**
 * Replaces the queued line at `index` with `next`, but only if that position still equals
 * `previous`. An empty or whitespace-only `next` drops the line (cancel semantics).
 *
 * Returns the modified array, or `null` if the line was stale or the index is out of bounds.
 */
export function replaceQueuedLine(
  queue: string[] | undefined,
  index: number,
  previous: string,
  next: string,
): string[] | null {
  if (!queue || index < 0 || index >= queue.length) return null;
  if (queue[index] !== previous) return null;

  if (!next.trim()) {
    return queue.filter((_, i) => i !== index);
  }

  return queue.map((line, i) => (i === index ? next : line));
}

/**
 * For instructions, updates the corresponding `CommMessage` in history so that what the agent will
 * receive and what the Comunicación thread displays remain consistent.
 *
 * Finds the latest message from the end matching `kind === "instruction"`, `projectId`,
 * `toAgentId`, and `text === previous`. If `next` is empty or whitespace-only, the history message
 * is left as it was (mirroring unqueue semantics).
 */
export function replaceInstructionHistory(
  messages: CommMessage[],
  projectId: string,
  agentId: string,
  previous: string,
  next: string,
): CommMessage[] {
  if (!next.trim()) return messages;

  for (let i = messages.length - 1; i >= 0; i--) {
    const msg = messages[i];
    if (
      msg.kind === "instruction" &&
      msg.projectId === projectId &&
      msg.toAgentId === agentId &&
      msg.text === previous
    ) {
      const copy = [...messages];
      copy[i] = { ...msg, text: next };
      return copy;
    }
  }

  return messages;
}
