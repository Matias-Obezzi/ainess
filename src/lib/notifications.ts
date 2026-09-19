// Pure list logic behind the bell in the window bar. The store keeps the array; everything that
// decides what goes in it (dedup, cap, read flags) lives here so it can be tested on its own.
import type { AppNotification } from "@/types";

/** Oldest entries fall off past this many. There is no pagination on purpose. */
export const MAX_NOTIFICATIONS = 200;

/** What a caller provides: the id, the timestamp and the read flag are ours. */
export type NotificationInput = Omit<AppNotification, "id" | "ts" | "read">;

/**
 * The entity a notification is about, when there is one. Two unread notifications of the same
 * kind about the same entity are the same news, so the newer one replaces the older.
 */
function dedupKey(n: Pick<AppNotification, "kind" | "approvalId" | "runId">): string | null {
  const id = n.approvalId ?? n.runId;
  return id ? `${n.kind}:${id}` : null;
}

/**
 * Adds `input` at the front of `list`, newest first. When an unread notification of the same kind
 * already talks about the same approval or run, that one is refreshed instead of piling up.
 * `id` and `ts` are injected so tests (and the store) stay deterministic.
 */
export function pushNotification(
  list: AppNotification[],
  input: NotificationInput,
  meta: { id: string; ts: number },
): AppNotification[] {
  const next: AppNotification = { ...input, id: meta.id, ts: meta.ts, read: false };
  const key = dedupKey(next);
  if (key) {
    const existing = list.find(n => !n.read && dedupKey(n) === key);
    if (existing) {
      const merged: AppNotification = { ...existing, ...input, ts: meta.ts, read: false };
      return [merged, ...list.filter(n => n.id !== existing.id)].slice(0, MAX_NOTIFICATIONS);
    }
  }
  return [next, ...list].slice(0, MAX_NOTIFICATIONS);
}

/** How many are still unread. */
export function unreadCount(list: AppNotification[]): number {
  return list.reduce((n, item) => (item.read ? n : n + 1), 0);
}

/** Badge text for the bell: "3", "9+", or null when there is nothing unread. */
export function unreadBadge(count: number): string | null {
  if (count <= 0) return null;
  return count > 9 ? "9+" : String(count);
}

/** Marks every entry as read. Returns the same array when nothing changed. */
export function markAllRead(list: AppNotification[]): AppNotification[] {
  if (list.every(n => n.read)) return list;
  return list.map(n => (n.read ? n : { ...n, read: true }));
}

/** Marks one entry as read by id. Returns the same array when nothing changed. */
export function markRead(list: AppNotification[], id: string): AppNotification[] {
  if (!list.some(n => n.id === id && !n.read)) return list;
  return list.map(n => (n.id === id && !n.read ? { ...n, read: true } : n));
}

/**
 * Marks as read whatever was said about one approval: the user already decided, so the bell has
 * nothing left to ask. Returns the same array when nothing changed.
 */
export function markApprovalRead(list: AppNotification[], approvalId: string): AppNotification[] {
  if (!list.some(n => n.approvalId === approvalId && !n.read)) return list;
  return list.map(n => (n.approvalId === approvalId && !n.read ? { ...n, read: true } : n));
}

/** Drops one entry by id. */
export function dismissNotification(list: AppNotification[], id: string): AppNotification[] {
  return list.filter(n => n.id !== id);
}

/**
 * When this window came up. What is older than this was read from disk, not lived through.
 */
export const sessionStartedAt = Date.now();

/**
 * Where the last announcement got to. A plain id is not enough: the live text of a run is written
 * as `text-<runId>` at the tail of the feed and deleted when the run ends, so a cursor pointing
 * at it pointed at nothing — `findIndex` gave -1 and the whole session was announced again. A
 * timestamp is not deleted along with the message that carried it.
 *
 * `ids` are the messages already announced at exactly `ts`. Two messages can share a millisecond,
 * and neither `> ts` (loses the second one) nor `>= ts` (repeats the first) is right on its own;
 * naming the ones already covered at that boundary settles it.
 */
export type MessageCursor = { ts: number; ids: string[] } | null;

/**
 * The messages worth announcing: the ones the cursor does not cover that also happened in this
 * session. The cursor alone is not enough — it starts empty, so the whole restored feed read as
 * new and reopening the app fired a toast (and a system notification) for every task that had
 * ever finished. History arrives asynchronously, project by project, well after the first
 * callback, so what separates news from history is when it happened, not what came first.
 */
export function freshMessages<T extends { id: string; ts: number }>(
  messages: T[],
  cursor: MessageCursor,
  since: number = sessionStartedAt,
): T[] {
  return messages.filter(
    m => m.ts >= since && (!cursor || m.ts > cursor.ts || (m.ts === cursor.ts && !cursor.ids.includes(m.id))),
  );
}

/**
 * The cursor that covers everything in `messages`. It follows the feed, not only what was
 * announced, so a message restored from disk after this one is never revisited. The feed is kept
 * sorted by `ts` (see `lib/history`), so the newest is at the tail and the walk back stops at
 * the first older one.
 */
export function messageCursor<T extends { id: string; ts: number }>(messages: T[]): MessageCursor {
  const last = messages[messages.length - 1];
  if (!last) return null;
  const ids: string[] = [];
  for (let i = messages.length - 1; i >= 0 && messages[i].ts === last.ts; i--) ids.push(messages[i].id);
  return { ts: last.ts, ids };
}
