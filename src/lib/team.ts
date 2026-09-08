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
/**
 * What an instruct hook carries in place of an agent id when it means "whoever is on top".
 *
 * Not an id, on purpose: a hook written today should still reach the right agent after the team is
 * rearranged, and one hook should be able to serve every project without naming anybody. Agent ids
 * are uuids, so this can never be mistaken for one.
 */
export const BOSS_TARGET = "@boss";

/**
 * The one at the top of a project: its root planner, or — for a team with no planner at all — the
 * first agent nobody is above. The same agent the composer, the CLI and the phone write to by
 * default, which is what makes it "the boss" rather than an arbitrary pick.
 */
export function bossOf(roster: AgentConfig[]): AgentConfig | undefined {
  const roots = roster.filter(a => a.parentId === null);
  return roots.find(a => a.role === "planner") ?? roots[0];
}

export function rootPlannerClash(
  roster: AgentConfig[],
  candidate: { id: string; role: AgentConfig["role"]; parentId: string | null },
): AgentConfig | undefined {
  if (candidate.role !== "planner" || candidate.parentId !== null) return undefined;
  return roster.find(a => a.id !== candidate.id && a.role === "planner" && a.parentId === null);
}
