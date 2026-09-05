import { useEffect, useRef } from "react";
import { useAppStore } from "@/store";
import { toast } from "@/components/ui/toast";

export function useNotifications() {
  const lastProcessedId = useRef<string | null>(null);

  useEffect(() => {
    return useAppStore.subscribe((state) => {
      const messages = state.messages;
      if (messages.length === 0) return;

      const lastIdx = lastProcessedId.current 
        ? messages.findIndex(m => m.id === lastProcessedId.current) 
        : -1;
      
      const newMessages = messages.slice(lastIdx + 1);
      
      for (const msg of newMessages) {
        if (msg.projectId && msg.projectId !== state.currentProjectId) continue;
        if (msg.kind === "delegation") {
          const from = state.config.agents.find(a => a.id === msg.fromAgentId)?.name || "Alguien";
          const to = state.config.agents.find(a => a.id === msg.toAgentId)?.name || "Alguien";
          toast.info(`${from} delegó a ${to}`);
        } else if (msg.kind === "error") {
          toast.error(msg.text);
        } else if (msg.kind === "result" && msg.toAgentId === "user") {
          toast.success("Tarea terminada");
        }
      }
      
      if (newMessages.length > 0) {
        lastProcessedId.current = newMessages[newMessages.length - 1].id;
      }
    });
  }, []);
}
