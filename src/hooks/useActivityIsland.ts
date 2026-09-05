import { useEffect } from "react";
import { useAppStore } from "@/store";
import { island, Spinner } from "@/components/ui/island";
import React from "react";

export function useActivityIsland() {
  useEffect(() => {
    return useAppStore.subscribe((state, prevState) => {
      const runningRuns = Object.values(state.runs).filter(r => r.status === "running");
      const prevRunningRuns = Object.values(prevState.runs).filter(r => r.status === "running");
      
      if (runningRuns.length > 0) {
        const lastRun = runningRuns.sort((a, b) => b.startedAt - a.startedAt)[0];
        const agent = state.config.agents.find(a => a.id === lastRun.agentId);
        
        island.show({
          id: "activity",
          leading: React.createElement(Spinner),
          content: `${runningRuns.length} agente${runningRuns.length > 1 ? "s" : ""} trabajando`,
          trailing: agent ? agent.name : "",
          dismissible: false
        });
      } else if (prevRunningRuns.length > 0 && runningRuns.length === 0) {
        island.dismiss("activity");
      }
    });
  }, []);
}
