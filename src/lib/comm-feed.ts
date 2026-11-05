import type { CommMessage } from "@/types";

/** The label `chat.ts` writes in front of the user's prompt and of a chat's result. */
export const CHAT_PREFIX = /^\[Chat: (.+?)\] /;

export function splitChatPrefix(text: string): { chat?: string; body: string } {
  const m = CHAT_PREFIX.exec(text);
  return m ? { chat: m[1], body: text.slice(m[0].length) } : { body: text };
}

/**
 * Hides a `result` row that only repeats the `text` row of the same run. The text is the whole
 * transcript, so it is the one kept; a result that says something the text does not stays.
 *
 * The kept text inherits what the result carried and it lacked: its `toAgentId` and, for a chat,
 * the `[Chat: name] ` prefix (a copy, the inputs are never mutated). Presentation only: nothing is
 * removed from the store. Accepted limit: the raw view of that row shows the prefix.
 */
export function withoutRepeatedResults(messages: CommMessage[]): CommMessage[] {
  const texts = new Map<string, { m: CommMessage; text: string }[]>();
  for (const m of messages) {
    if (m.kind === "text" && m.runId) {
      const entry = { m, text: m.text.trim() };
      const list = texts.get(m.runId);
      if (list) list.push(entry);
      else texts.set(m.runId, [entry]);
    }
  }
  if (texts.size === 0) return messages;
  const inherited = new Map<CommMessage, CommMessage>();
  const kept = messages.filter(m => {
    if (m.kind !== "result" || !m.runId) return true;
    const candidates = texts.get(m.runId);
    if (!candidates) return true;
    const split = splitChatPrefix(m.text);
    const body = split.body.trim();
    const hit = candidates.find(c => c.text.startsWith(body));
    if (!hit) return true;
    const prev = inherited.get(hit.m) ?? hit.m;
    inherited.set(hit.m, {
      ...prev,
      toAgentId: m.toAgentId,
      text: split.chat !== undefined && !CHAT_PREFIX.test(prev.text) ? `[Chat: ${split.chat}] ${prev.text}` : prev.text,
    });
    return false;
  });
  if (kept.length === messages.length) return messages;
  return kept.map(m => inherited.get(m) ?? m);
}
