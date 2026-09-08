import type { Approval, Project, AgentConfig } from "@/types";

/**
 * The approvals the user can actually act on.
 *
 * `removeProject` already drops the approvals of a deleted project, but the store is not the only
 * writer: the CLI and the phone can add one for a project this process no longer has, and an
 * approval with no project behind it has no screen to be answered from — it would sit in the
 * sidebar badge and in the bell forever. Filtering here keeps every consumer honest.
 *
 * @param projectId only that project's approvals; omit (or null) for every live project.
 */
export function pendingApprovals(
  approvals: Record<string, Approval>,
  projects: Project[],
  projectId?: string | null,
): Approval[] {
  const live = new Set(projects.map(p => p.id));
  return Object.values(approvals)
    .filter(a => a.status === "pending" && live.has(a.projectId) && (projectId == null || a.projectId === projectId))
    .sort((a, b) => a.createdAt - b.createdAt);
}

/**
 * Resolves whether a delegated task requires approval based on the agent's specific override
 * and the global fallback configuration.
 */
export function delegationNeedsApproval(agent: Pick<AgentConfig, "requireApproval">, approveDelegations: boolean): boolean {
  return agent.requireApproval ?? approveDelegations;
}
