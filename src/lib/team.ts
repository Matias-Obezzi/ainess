// Rules about the shape of a team, checked where a team is edited (see AgentDialog, which every
// one of those screens opens).
import type { AgentConfig } from "@/types";

/**
 * The other planner at the root, if this agent were saved with no parent.
 *
 * A project answers to one orchestrator. Two of them side by side is not a richer team: they both
 * read the whole board and can pick up the same card, only the first is ever the default the
 * composer, the CLI and the phone write to, and the project's "task in progress" is a single
 * pointer that the second one overwrites. A second orchestrator belongs under the first, where it
 * is delegated to like anybody else.
 */
export function rootPlannerClash(
  roster: AgentConfig[],
  candidate: { id: string; role: AgentConfig["role"]; parentId: string | null },
): AgentConfig | undefined {
  if (candidate.role !== "planner" || candidate.parentId !== null) return undefined;
  return roster.find(a => a.id !== candidate.id && a.role === "planner" && a.parentId === null);
}
