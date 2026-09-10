import type { AgentConfig } from "@/types";
import { PROVIDERS } from "@/lib/providers";

/**
 * The models offered when retrying with `agent`, with the agent's own included.
 *
 * Always a copy. Handing back the provider's own array would put the list every agent of that
 * provider reads one `sort` or `push` away from whoever asked for it.
 */
export function retryModels(agent: AgentConfig): string[] {
  const defaults = PROVIDERS[agent.provider]?.defaultModels ?? [];
  if (agent.model && !defaults.includes(agent.model)) return [...defaults, agent.model];
  return [...defaults];
}

/** The model to preselect: the one the run used, but only when the new agent can run it. */
export function retryModelFor(agent: AgentConfig, previous: string | undefined): string | undefined {
  if (!previous) return undefined;
  return retryModels(agent).includes(previous) ? previous : undefined;
}
