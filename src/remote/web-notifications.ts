// Notifications on the phone, for the things that need you: a delegation waiting for a yes, a
// question an agent asked, a task that finished or failed.
//
// This is the browser's own Notification API, driven by the SSE stream the page already keeps
// open — no push service, no keys, nothing leaving your machine and your phone. It only reaches
// you while the page is open (in the background, or with the screen locked, as long as the browser
// is alive); a notification with the page closed needs Web Push, which is another thing entirely.
//
// Two conditions the browser puts on it, worth knowing when it does nothing:
//   · a secure context — the tunnel's HTTPS URL, not `http://192.168.x.x`
//   · a gesture: the permission is asked from a button, never on load
import { useEffect, useRef } from "react";
import { useAppStore, selectAllAgents } from "@/store";
import { pendingApprovals } from "@/lib/approvals";
import { freshMessages, sessionStartedAt } from "@/lib/notifications";
import { translateNow } from "@/i18n/useT";

export type NotificationState = "unsupported" | "insecure" | "default" | "granted" | "denied";

/** What the page can do about notifications right now. */
export function notificationState(): NotificationState {
  // `globalThis`, not `window`: the same module is imported by the CLI bundle, where there is no
  // window and the answer is simply "unsupported".
  const env = globalThis as { Notification?: { permission: NotificationPermission }; isSecureContext?: boolean };
  if (!env.Notification) return "unsupported";
  // The API exists in an insecure context and refuses to work: saying why beats a silent no.
  if (!env.isSecureContext) return "insecure";
  return env.Notification.permission as NotificationState;
}

/** Registers the worker that shows the notifications (and is what makes this an installable app). */
export async function registerServiceWorker(): Promise<ServiceWorkerRegistration | null> {
  if (typeof navigator === "undefined" || !("serviceWorker" in navigator) || !globalThis.isSecureContext) {
    return null;
  }
  try {
    return await navigator.serviceWorker.register("/sw.js", { scope: "/" });
  } catch {
    // An old browser, a scope it does not like: notifications fall back to the page's own.
    return null;
  }
}

/** Asks for the permission. Must be called from a click: iOS refuses it any other way. */
export async function askForNotifications(): Promise<NotificationState> {
  const state = notificationState();
  if (state !== "default") return state;
  try {
    const result = await Notification.requestPermission();
    if (result === "granted") await registerServiceWorker();
    return result as NotificationState;
  } catch {
    return "denied";
  }
}

/**
 * Shows one. Through the service worker when there is one — on iOS that is the only way — and
 * through the page's own constructor otherwise.
 */
export async function showNotification(title: string, body: string, tag: string): Promise<void> {
  if (notificationState() !== "granted") return;
  const options: NotificationOptions = { body, tag, icon: "/icon.png", badge: "/icon.png" };
  try {
    const registration = await navigator.serviceWorker?.getRegistration();
    if (registration) {
      await registration.showNotification(title, options);
      return;
    }
  } catch {
    // Fall through to the page's own.
  }
  try {
    new Notification(title, options);
  } catch {
    // Some browsers only allow the worker's; nothing else to do about it here.
  }
}

function truncate(text: string, max: number): string {
  const trimmed = text.trim();
  return trimmed.length > max ? `${trimmed.slice(0, max - 1)}…` : trimmed;
}

/**
 * Watches the snapshot for what is worth interrupting you over. Only while the page is not the one
 * you are looking at: with it in front, the screen already says it.
 */
export function useWebNotifications(): void {
  const lastMessageId = useRef<string | null>(null);
  const knownApprovals = useRef<Set<string>>(new Set());
  const knownQuestions = useRef<Set<string>>(new Set());

  useEffect(() => {
    return useAppStore.subscribe(state => {
      if (notificationState() !== "granted") return;
      const hidden = typeof document !== "undefined" && document.hidden;

      // A delegation waiting for a yes.
      const pending = pendingApprovals(state.approvals, state.config.projects);
      const nowPending = new Set(pending.map(a => a.id));
      for (const approval of pending) {
        if (!knownApprovals.current.has(approval.id) && approval.createdAt >= sessionStartedAt && hidden) {
          void showNotification(translateNow("notify.needsPermission"), truncate(approval.summary, 160), `approval-${approval.id}`);
        }
      }
      knownApprovals.current = nowPending;

      // A question an agent stopped to ask.
      const questions = Object.values(state.questions).filter(q => q.status === "pending");
      const nowAsked = new Set(questions.map(q => q.id));
      for (const question of questions) {
        if (!knownQuestions.current.has(question.id) && question.createdAt >= sessionStartedAt && hidden) {
          void showNotification(translateNow("notify.questionTitle"), truncate(question.question, 160), `question-${question.id}`);
        }
      }
      knownQuestions.current = nowAsked;

      // And what came back finished.
      const messages = state.messages;
      if (messages.length > 0) {
        for (const msg of freshMessages(messages, lastMessageId.current)) {
          if (msg.kind !== "result" || msg.toAgentId !== "user" || !hidden) continue;
          const project = state.config.projects.find(p => p.id === msg.projectId);
          const agent = selectAllAgents(state).find(a => a.id === msg.fromAgentId);
          const prefix = [project?.name, agent?.name].filter(Boolean).join(" · ");
          void showNotification(
            translateNow("notify.taskDoneTitle"),
            `${prefix ? `${prefix}: ` : ""}${truncate(msg.text, 140)}`,
            `result-${msg.id}`,
          );
        }
        lastMessageId.current = messages[messages.length - 1].id;
      }
    });
  }, []);
}
