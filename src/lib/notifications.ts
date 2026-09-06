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
