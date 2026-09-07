// Global persistence of the bell's notification list. Mirrors the pattern of src/lib/task-store.ts:
// a single store subscription drives debounced saves, and a load function fills in the gaps on
// startup without overwriting anything the process already received since it started.
//
// File: <configDir>/notifications.json  (global, not per-project)
// Shape: { version: 1, notifications: AppNotification[] }
// Cap: MAX_NOTIFICATIONS (from src/lib/notifications.ts)
import { useAppStore } from "@/store";
import { getTransport } from "@/lib/transport";
import { log } from "@/lib/logger";
import { MAX_NOTIFICATIONS } from "@/lib/notifications";
import type { AppNotification, NotificationKind } from "@/types";

const FILE_PATH = "notifications.json";
const SAVE_DELAY_MS = 500;

interface NotificationFile {
  version: 1;
  notifications: AppNotification[];
}

let subscribed = false;
let dirty = false;
let timer: ReturnType<typeof setTimeout> | null = null;

/** The notification kinds we know about; entries with unknown kinds are discarded on load. */
const VALID_KINDS: Set<NotificationKind> = new Set<NotificationKind>([
  "approval",
  "task-done",
  "task-failed",
  "interrupted",
  "tunnel",
  "update",
  "info",
]);

/** Discard structurally invalid entries a corrupted or hand-edited file might contain. */
export function sanitize(raw: unknown): AppNotification[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: AppNotification[] = [];
  for (const item of raw) {
    const n = item as Partial<AppNotification>;
    if (
      !n ||
      typeof n.id !== "string" ||
      typeof n.ts !== "number" ||
      typeof n.kind !== "string" ||
      !VALID_KINDS.has(n.kind as NotificationKind)
    ) continue;
    if (seen.has(n.id)) continue;
    seen.add(n.id);
    out.push({
      id: n.id,
      kind: n.kind as NotificationKind,
      title: typeof n.title === "string" ? n.title : "",
      body: typeof n.body === "string" ? n.body : undefined,
      ts: n.ts,
      // Preserve the read flag that was saved — a bell with a badge on startup is the point.
      read: Boolean(n.read),
      projectId: typeof n.projectId === "string" ? n.projectId : undefined,
      agentId: typeof n.agentId === "string" ? n.agentId : undefined,
      runId: typeof n.runId === "string" ? n.runId : undefined,
      approvalId: typeof n.approvalId === "string" ? n.approvalId : undefined,
    });
  }
  // Newest first, capped to the same limit the in-memory list uses.
  return out.sort((a, b) => b.ts - a.ts).slice(0, MAX_NOTIFICATIONS);
}

/**
 * Parse the contents of `notifications.json` into a usable list. Anything unreadable — bad JSON, an
 * unknown version, entries missing their id/ts/kind — yields an empty list instead of throwing, so a
 * corrupted file can never keep the app from starting. Exported so the tests exercise this exact
 * function and not a copy of it.
 */
export function parseNotificationFile(raw: string): AppNotification[] {
  let parsed: Partial<NotificationFile>;
  try {
    parsed = JSON.parse(raw) as Partial<NotificationFile>;
  } catch (e) {
    log.warn("notification-store", `notifications.json could not be parsed: ${e}; starting with empty list`);
    return [];
  }
  if (parsed?.version !== 1) {
    log.warn("notification-store", "notifications.json has an unknown version; starting with empty list");
    return [];
  }
  return sanitize(parsed.notifications);
}

function scheduleSave(): void {
  dirty = true;
  if (timer !== null) return;
  timer = setTimeout(() => {
    timer = null;
    void save();
  }, SAVE_DELAY_MS);
}

async function save(): Promise<void> {
  dirty = false;
  const { notifications } = useAppStore.getState();
  const file: NotificationFile = { version: 1, notifications };
  try {
    await getTransport().writeTextFile(FILE_PATH, JSON.stringify(file));
  } catch { /* the null transport (browser preview) cannot write; ignore */ }
}

/** Subscribe once to the store and persist whenever the notification list changes. */
export function attachNotificationPersistence(): void {
  if (subscribed) return;
  subscribed = true;
  useAppStore.subscribe((state, prev) => {
    if (state.notifications !== prev.notifications) scheduleSave();
  });
}

/**
 * Read persisted notifications from disk and merge them into the store.
 * Entries already in memory (received since the process started) take precedence.
 * Calling this does NOT trigger notify() — no toasts, no sounds, no system notifications.
 * A corrupted or version-mismatched file is silently ignored; the app starts with an empty list.
 */
export async function loadNotifications(): Promise<void> {
  let raw: string | null = null;
  try { raw = await getTransport().readTextFile(FILE_PATH); } catch { raw = null; }
  if (!raw) return;

  const fromDisk = parseNotificationFile(raw);
  if (fromDisk.length === 0) return;

  useAppStore.setState(state => {
    const inMemory = state.notifications;
    if (inMemory.length === 0) return { notifications: fromDisk };
    // Anything the app already received while this file was being read stays in place.
    const known = new Set(inMemory.map(n => n.id));
    const merged = [...inMemory, ...fromDisk.filter(n => !known.has(n.id))];
    // Keep newest-first order and cap to the limit.
    return { notifications: merged.sort((a, b) => b.ts - a.ts).slice(0, MAX_NOTIFICATIONS) };
  });
}

/** Write any pending save immediately (call before a CLI process exits). */
export async function flushNotifications(): Promise<void> {
  if (timer !== null) { clearTimeout(timer); timer = null; }
  if (dirty) await save();
}
