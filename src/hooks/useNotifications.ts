import { useEffect, useRef } from "react";
import { useAppStore, selectAllAgents } from "@/store";
import { toast } from "@/components/ui/toast";
import { translateNow } from "@/i18n/useT";
import { freshMessages, messageCursor, type MessageCursor } from "@/lib/notifications";

/** Toasts for what happens while the user is watching. History is not news: see `freshMessages`. */
export function useNotifications() {
  const cursor = useRef<MessageCursor>(null);
  const lastMessages = useRef<unknown>(null);

  useEffect(() => {
    return useAppStore.subscribe((state) => {
      const messages = state.messages;
      // The subscription has no selector, so it runs on every store write — hundreds a second
      // while an agent streams. Nothing here depends on anything but the feed.
      if (messages === lastMessages.current) return;
      lastMessages.current = messages;
      if (messages.length === 0) return;

      const newMessages = freshMessages(messages, cursor.current);

      // Someone looking at the project's own thread with the window in front is already seeing
      // what a toast would tell them; the toast only adds a box over the thing it repeats. It still
      // shows when the window is in the background, which is when it is the only way to find out.
      const watching = typeof document !== "undefined" && document.hasFocus() && state.screen === "project";

      for (const msg of newMessages) {
        if (msg.projectId && msg.projectId !== state.currentProjectId) continue;
        if (watching && msg.projectId === state.currentProjectId) continue;
        if (msg.kind === "delegation") {
          const someone = translateNow("notify.someone");
          const from = selectAllAgents(state).find(a => a.id === msg.fromAgentId)?.name || someone;
          const to = selectAllAgents(state).find(a => a.id === msg.toAgentId)?.name || someone;
          toast.info(translateNow("notify.delegated", { from, to }));
        } else if (msg.kind === "error") {
          toast.error(msg.text);
        } else if (msg.kind === "result" && msg.toAgentId === "user") {
          toast.success(translateNow("notify.taskDone"));
        }
      }
      
      cursor.current = messageCursor(messages);
    });
  }, []);
}
