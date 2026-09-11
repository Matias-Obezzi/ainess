import { useEffect, useRef } from "react";
import { useAppStore, selectAllAgents } from "@/store";
import { isTauri } from "@/lib/tauri";
import { log } from "@/lib/logger";
import { translateNow } from "@/i18n/useT";
import { pendingApprovals } from "@/lib/approvals";
import { freshMessages, sessionStartedAt } from "@/lib/notifications";

/** Truncates to `max` chars, adding an ellipsis when it cuts the text short. */
function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

let requestedPermission = false;

/** Lazily asks for OS notification permission once per session; never throws. */
async function ensureNotificationsGranted(): Promise<boolean> {
  try {
    const mod = await import("@tauri-apps/plugin-notification");
    let granted = await mod.isPermissionGranted();
    if (!granted && !requestedPermission) {
      requestedPermission = true;
      granted = (await mod.requestPermission()) === "granted";
    }
    return granted;
  } catch (e) {
    log.warn("notifications", "could not check the notification permission", e);
    return false;
  }
}

async function notify(title: string, body: string): Promise<void> {
  try {
    const granted = await ensureNotificationsGranted();
    if (!granted) return;
    const mod = await import("@tauri-apps/plugin-notification");
    mod.sendNotification({ title, body });
  } catch (e) {
    log.warn("notifications", "could not send the system notification", e);
  }
}

/**
 * System-level notifications (tray/OS), independent from the in-app toasts of
 * `useNotifications`: they fire for every project (not just the one currently open) and
 * regardless of whether the window is visible, so the user never misses an approval request.
 */
export function useSystemNotifications() {
  const lastMessageId = useRef<string | null>(null);
  const knownPendingApprovals = useRef<Set<string>>(new Set());

  useEffect(() => {
    if (!isTauri()) return;

    return useAppStore.subscribe((state) => {
      const { config } = state;
      if (!config.tray) return;

      // New pending approvals: diff against what we've already seen. One asked for in an earlier
      // session is not new — the badge and the bell already carry it — and it only reaches this
      // store when its project's history is read, long after the first callback.
      if (config.tray.notifyApprovals) {
        const pending = pendingApprovals(state.approvals, state.config.projects);
        const currentPending = new Set(pending.map(a => a.id));
        for (const approval of pending) {
          if (!knownPendingApprovals.current.has(approval.id) && approval.createdAt >= sessionStartedAt) {
            void notify(translateNow("notify.needsPermission"), truncate(approval.summary, 200));
          }
        }
        knownPendingApprovals.current = currentPending;
      }

      // "Task finished" messages of this session, across every project.
      if (config.tray.notifyResults) {
        const messages = state.messages;
        if (messages.length > 0) {
          const newMessages = freshMessages(messages, lastMessageId.current);
          for (const msg of newMessages) {
            if (msg.kind !== "result" || msg.toAgentId !== "user") continue;
            const project = state.config.projects.find(p => p.id === msg.projectId);
            const agent = selectAllAgents(state).find(a => a.id === msg.fromAgentId);
            const prefix = [project?.name, agent?.name].filter(Boolean).join(" · ");
            const body = `${prefix ? `${prefix}: ` : ""}${truncate(msg.text, 150)}`;
            void notify(translateNow("notify.taskDoneTitle"), body);
          }
          lastMessageId.current = messages[messages.length - 1].id;
        }
      }
    });
  }, []);
}
