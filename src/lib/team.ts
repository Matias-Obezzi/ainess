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

/**
 * The agent an edit leaves behind: what the edit says, on top of what the agent already was.
 *
 * Every editor hands the store a whole `AgentConfig` and the store puts it in place of the old one,
 * so a field the editor did not build into that object is not "left alone", it is gone. `ainess
 * agents edit` builds it out of its own flags, and it has no flag for the delegation approval
 * override, for the worktree or for the quota retry — so `ainess agents edit Impl --model x` used to
 * put an agent set to "never ask" back to following the global setting, and that agent started
 * asking for approval again on the next delegation it received.
 *
 * A key `edited` does carry wins, even when it carries it as `undefined`: that is how the agent
 * dialog says "follow the global setting" and it has to be able to erase a `true`.
 */
export function agentAfterEdit(existing: AgentConfig | undefined, edited: AgentConfig): AgentConfig {
  if (!existing) return edited;
  return { ...existing, ...edited, id: existing.id };
}

/**
 * Whether an agent is saved auto-approving its own tool calls.
 *
 * `autoApprove` is the permission handed to the provider CLI (`--permission-mode`, `--yolo`,
 * `--full-auto`…), not the delegation gate inside ainess — that one is `requireApproval`, and
 * nothing here touches it.
 *
 * A brand new agent is born with it on: ainess runs these CLIs headless, with nobody sitting in
 * front of them, so an agent that stops to ask permission for anything that is not an edit just
 * hangs there until someone notices. An agent that already exists keeps whatever it had — flipping
 * a permission on somebody else's agent is not a default, it is a change they did not ask for.
 */
export function agentAutoApprove(flag: boolean | undefined, existing: AgentConfig | undefined): boolean {
  if (flag !== undefined) return flag;
  return existing?.autoApprove ?? true;
}

/**
 * `--auto-approve` and `--no-auto-approve` read as one answer, or as none.
 *
 * The CLI needs both because a boolean option in `node:util`'s `parseArgs` has no off switch:
 * `--auto-approve=false` is rejected as an option that takes no argument, so the only way to say
 * "off" is a second flag. Without it, the day the default became on was the day the CLI stopped
 * being able to create an agent with its tool permissions held — a state the dialog can still
 * express, and scripts setting up a locked-down team need.
 *
 * Given both, off wins. They contradict each other, and between two readings of an ambiguous
 * command the one that grants less is the one to take.
 */
export function autoApproveFlag(on: boolean | undefined, off: boolean | undefined): boolean | undefined {
  if (off) return false;
  return on;
}

/** Every agent at or below `agentId`, itself included. */
export function descendantsOf(roster: AgentConfig[], agentId: string): Set<string> {
  const out = new Set<string>([agentId]);
  const queue = [agentId];
  while (queue.length > 0) {
    const current = queue.shift()!;
    for (const child of roster) {
      if (child.parentId === current && !out.has(child.id)) {
        out.add(child.id);
        queue.push(child.id);
      }
    }
  }
  return out;
}

/** Why a move was refused, so the screen that refused it can say which rule it broke. */
export type ReparentProblem = "unknown" | "self" | "cycle" | "root-planner-clash";

/**
 * Whether `agentId` may be hung under `parentId` (null meaning the top of the team).
 *
 * The same rules the agent editor has always applied, moved here so the graph can apply them too
 * rather than growing a second, slightly different copy of them.
 */
export function reparentProblem(
  roster: AgentConfig[],
  agentId: string,
  parentId: string | null,
): ReparentProblem | undefined {
  const agent = roster.find(a => a.id === agentId);
  if (!agent) return "unknown";
  if (parentId === agentId) return "self";
  if (parentId !== null) {
    if (!roster.some(a => a.id === parentId)) return "unknown";
    // Hanging an agent under its own descendant closes a ring, and the walk that builds the tree
    // would never come back out of it.
    if (descendantsOf(roster, agentId).has(parentId)) return "cycle";
  }
  if (rootPlannerClash(roster, { id: agentId, role: agent.role, parentId })) return "root-planner-clash";
  return undefined;
}
