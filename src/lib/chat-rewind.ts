// Cutting a conversation back to one of its messages, and what that costs.
//
// The pure half of "revert to here" and "edit this message" lives apart from `lib/chat.ts` so the
// rule can be tested without a store, a transport or a running agent behind it.
import type { ChatMessage } from "@/types";

/**
 * The thread as it should look after rewinding to `messageId`.
 *
 * `inclusive` keeps the message itself — that is "revert to here", where the chosen message is the
 * last thing left standing. Dropping it too is what editing does: the new text takes its place, so
 * the old one has to go with everything it caused.
 *
 * An id that is not in the thread returns the thread untouched rather than emptying it. The list
 * comes from the same render that offered the menu, so a miss means something else already changed
 * it — a turn that landed, a chat that reloaded — and quietly deleting everything on that basis is
 * the worst possible reading of a menu item the user clicked a moment ago.
 */
export function rewound(messages: ChatMessage[], messageId: string, inclusive: boolean): ChatMessage[] {
  const at = messages.findIndex(m => m.id === messageId);
  if (at === -1) return messages;
  return messages.slice(0, inclusive ? at + 1 : at);
}

/**
 * Whether anything would actually be removed. A menu item that deletes nothing should not be asking
 * for confirmation, and the last message in a thread is exactly that case for "revert to here".
 */
export function rewindRemoves(messages: ChatMessage[], messageId: string, inclusive: boolean): number {
  const at = messages.findIndex(m => m.id === messageId);
  if (at === -1) return 0;
  return messages.length - (inclusive ? at + 1 : at);
}
