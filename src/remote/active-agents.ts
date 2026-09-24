// Finds all agents across projects that need the user's attention (waiting) or are currently
// busy (working). Used by the phone home view to give an instant birds-eye view across projects.

import type { AgentRuntime, Project, ProviderId, Run } from "@/types";

export interface ActiveAgentRow {
  projectId: string;
  projectName: string;
  projectColor?: string;
  agentId: string;
  agentName: string;
  provider: ProviderId;
  status: "working" | "waiting";
  detail?: string;
}

/**
 * Pure helper collecting agents in "waiting" or "working" status across all known projects.
 * - Waiting rows appear first, then working rows.
 * - Each group preserves project order.
 * - Agents whose project or config is missing are skipped.
 * - detail falls back from currentTask to the current run's prompt.
 */
export function activeAgentsAcross(
  runtime: Record<string, Record<string, AgentRuntime | undefined> | undefined> | undefined | null,
  projects: readonly Project[] | null | undefined,
  runs: Record<string, Run | undefined> | undefined | null,
): ActiveAgentRow[] {
  if (!projects || !runtime) return [];

  const waiting: ActiveAgentRow[] = [];
  const working: ActiveAgentRow[] = [];

  for (const project of projects) {
    if (!project || !project.id || !project.name) continue;
    const projectRuntime = runtime[project.id];
    if (!projectRuntime) continue;

    const agents = project.agents ?? [];
    for (const agent of agents) {
      if (!agent || !agent.id) continue;
      const rt = projectRuntime[agent.id];
      if (!rt) continue;
      if (rt.status !== "working" && rt.status !== "waiting") continue;

      const runPrompt = rt.currentRunId && runs ? runs[rt.currentRunId]?.prompt : undefined;
      const detail = rt.currentTask || runPrompt || undefined;

      const row: ActiveAgentRow = {
        projectId: project.id,
        projectName: project.name,
        projectColor: project.color,
        agentId: agent.id,
        agentName: agent.name,
        provider: agent.provider,
        status: rt.status,
        detail,
      };

      if (rt.status === "waiting") {
        waiting.push(row);
      } else {
        working.push(row);
      }
    }
  }

  return [...waiting, ...working];
}
