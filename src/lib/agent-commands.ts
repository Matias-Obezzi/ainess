// The slash commands each agent says it takes (ACP `available_commands_update`): its skills, its
// built-ins, whatever its tools add. Kept in memory and per agent — the agent repeats them on every
// session it opens, so there is nothing to save, and an agent that never ran has offered nothing.
import { useSyncExternalStore } from "react";
import type { AgentCommand } from "@/types";

const NONE: AgentCommand[] = [];
let byAgent = new Map<string, AgentCommand[]>();
const listeners = new Set<() => void>();

export function setAgentCommands(agentId: string, commands: AgentCommand[]): void {
  const same = JSON.stringify(byAgent.get(agentId) ?? NONE) === JSON.stringify(commands);
  if (same) return;
  byAgent = new Map(byAgent).set(agentId, commands);
  for (const listener of listeners) listener();
}

export function agentCommands(agentId: string | undefined): AgentCommand[] {
  return (agentId && byAgent.get(agentId)) || NONE;
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

/** The commands an agent offered last, or none. */
export function useAgentCommands(agentId: string | undefined): AgentCommand[] {
  return useSyncExternalStore(subscribe, () => agentCommands(agentId), () => NONE);
}
