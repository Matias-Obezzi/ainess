import { useEffect, useRef } from "react";
import { useAppStore } from "@/store";
import { isTauri } from "@/lib/tauri";

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
    console.warn("No se pudo verificar el permiso de notificaciones", e);
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
    console.warn("No se pudo enviar la notificación del sistema", e);
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

      // New pending approvals: diff against what we've already seen.
      if (config.tray.notifyApprovals) {
        const currentPending = new Set(
          Object.values(state.approvals).filter(a => a.status === "pending").map(a => a.id)
        );
        for (const id of currentPending) {
          if (!knownPendingApprovals.current.has(id)) {
            const approval = state.approvals[id];
            void notify("AIS: un agente necesita tu permiso", truncate(approval.summary, 200));
          }
        }
        knownPendingApprovals.current = currentPending;
      }

      // New "task finished" messages, across every project.
      if (config.tray.notifyResults) {
        const messages = state.messages;
        if (messages.length > 0) {
          const lastIdx = lastMessageId.current
            ? messages.findIndex(m => m.id === lastMessageId.current)
            : -1;
          const newMessages = messages.slice(lastIdx + 1);
          for (const msg of newMessages) {
            if (msg.kind !== "result" || msg.toAgentId !== "user") continue;
            const project = state.config.projects.find(p => p.id === msg.projectId);
            const agent = config.agents.find(a => a.id === msg.fromAgentId);
            const prefix = [project?.name, agent?.name].filter(Boolean).join(" · ");
            const body = `${prefix ? `${prefix}: ` : ""}${truncate(msg.text, 150)}`;
            void notify("AIS: tarea terminada", body);
          }
          lastMessageId.current = messages[messages.length - 1].id;
        }
      }
    });
  }, []);
}
