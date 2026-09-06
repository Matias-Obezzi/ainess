import { useEffect, useRef } from "react";
import { useAppStore, selectAllAgents } from "@/store";
import { toast } from "@/components/ui/toast";
import { translateNow } from "@/i18n/useT";
import { freshMessages } from "@/lib/notifications";

/** Toasts for what happens while the user is watching. History is not news: see `freshMessages`. */
export function useNotifications() {
  const lastProcessedId = useRef<string | null>(null);

  useEffect(() => {
    return useAppStore.subscribe((state) => {
      const messages = state.messages;
      if (messages.length === 0) return;

      const newMessages = freshMessages(messages, lastProcessedId.current);

      for (const msg of newMessages) {
        if (msg.projectId && msg.projectId !== state.currentProjectId) continue;
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
      
      // The cursor follows the feed, not only what was announced, so a message restored from disk
      // after this one is never revisited.
      lastProcessedId.current = messages[messages.length - 1].id;
    });
  }, []);
}
