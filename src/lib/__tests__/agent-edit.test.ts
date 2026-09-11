// Editing an agent must not move a setting the edit never mentioned.
//
// The report was "a delegation asks for approval even though approval is turned off". The gate
// itself is fine (see approval-gate.test.ts): with the global setting off and no per-agent
// override, nothing is asked. What was not fine is how an agent gets written back. Every editor
// hands the store a whole `AgentConfig` and the store replaces the old one with it, and `ainess
// agents edit` builds that object out of its own flags — it has no flag for `requireApproval`, for
// `worktree` or for `retryOnQuota`. So `ainess agents edit Impl --model x` wiped the "never ask"
// the user had set, the agent went back to following the global setting, and with that setting on
// it asked again. These tests pin the two halves of the contract: what the edit does not name is
// kept, and what it does name wins — including when what it names is "follow the global setting",
// which is carried as `undefined` and has to be able to erase a `true`.
import { describe, it, expect } from "vitest";
import { agentAfterEdit } from "@/lib/team";
import { delegationNeedsApproval } from "@/lib/approvals";
import type { AgentConfig } from "@/types";

const agent = (over: Partial<AgentConfig> = {}): AgentConfig => ({
  id: "a1",
  name: "Implementer 1",
  provider: "claude",
  role: "implementer",
  parentId: "boss",
  autoApprove: true,
  ...over,
});

describe("agentAfterEdit", () => {
  it("keeps an agent's 'never ask' when the edit only changes the model", () => {
    const before = agent({ requireApproval: false });
    const after = agentAfterEdit(before, agent({ model: "opus" }));

    expect(after.requireApproval).toBe(false);
    // And the whole point of it: the global setting cannot drag it back into asking.
    expect(delegationNeedsApproval(after, true)).toBe(false);
  });

  it("keeps an agent's 'always ask' when the edit only changes the model", () => {
    const after = agentAfterEdit(agent({ requireApproval: true }), agent({ model: "opus" }));

    expect(after.requireApproval).toBe(true);
    expect(delegationNeedsApproval(after, false)).toBe(true);
  });

  it("lets an edit put the agent back to following the global setting", () => {
    // The agent dialog says "inherit" by writing the key as `undefined`, so a stored `true` has to
    // go. This is the one case where a spread that ignored undefined would give the wrong answer.
    const after = agentAfterEdit(agent({ requireApproval: true }), agent({ requireApproval: undefined }));

    expect(after.requireApproval).toBeUndefined();
    expect(delegationNeedsApproval(after, false)).toBe(false);
    expect(delegationNeedsApproval(after, true)).toBe(true);
  });

  it("keeps the worktree and the quota retry, which no CLI flag names either", () => {
    const before = agent({ worktree: true, retryOnQuota: true });
    const after = agentAfterEdit(before, agent({ name: "Otro" }));

    expect(after.worktree).toBe(true);
    expect(after.retryOnQuota).toBe(true);
    expect(after.name).toBe("Otro");
  });

  it("does not let the delegation gate and the tool permissions bleed into each other", () => {
    // Two settings that sound alike: `requireApproval` holds a delegation inside ainess, while
    // `autoApprove` is the flag handed to the CLI so it stops asking about its own tools. An edit
    // that changes one leaves the other exactly where it was.
    const before = agent({ autoApprove: true, requireApproval: false });

    expect(agentAfterEdit(before, agent({ autoApprove: false })).requireApproval).toBe(false);
    expect(agentAfterEdit(before, agent({ requireApproval: true })).autoApprove).toBe(true);
  });

  it("takes a brand new agent as it comes, with nothing behind it to keep", () => {
    const fresh = agent({ id: "new", requireApproval: true });

    expect(agentAfterEdit(undefined, fresh)).toBe(fresh);
  });

  it("never moves the agent to a different id", () => {
    const after = agentAfterEdit(agent({ id: "a1" }), agent({ id: "somebody-else" }));

    expect(after.id).toBe("a1");
  });
});
