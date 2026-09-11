// A new agent is born auto-approving its own tools.
//
// ainess launches these CLIs headless: nobody is sitting in front of the process to answer it. An
// agent born with `autoApprove: false` was launched with `--permission-mode acceptEdits` (see
// providers.ts), so it asked permission for everything that was not an edit and then hung there
// until somebody noticed. The user's call: "un agente headless que nadie puede contestar no
// debería quedarse trabado pidiendo permiso".
//
// What these pin down is the part that is easy to get backwards. The same expression serves
// `agents add` and `agents edit`, and the new default must only reach the first one: turning a
// permission on in an agent that already exists is a change nobody asked for. And `autoApprove` is
// the tool permission handed to the provider CLI, not `requireApproval`, which is the delegation
// gate inside ainess — they sound alike, and this change does not touch the second one.
//
// The dialog's default (AgentDialog.tsx) is the same decision written as `useState(true)`; there
// are no component tests with state in this repo, so it is not covered here.
import { describe, it, expect } from "vitest";
import { agentAutoApprove, autoApproveFlag } from "@/lib/team";
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

describe("agentAutoApprove", () => {
  it("starts a new agent auto-approving when nobody said otherwise", () => {
    // `ainess agents add --name Impl` with no --auto-approve: there is no agent behind it.
    expect(agentAutoApprove(undefined, undefined)).toBe(true);
  });

  it("does not turn it on in an agent that had it off: editing is not creating", () => {
    // `ainess agents edit Impl --model opus` names no permission, and the agent keeps its own.
    expect(agentAutoApprove(undefined, agent({ autoApprove: false }))).toBe(false);
  });

  it("keeps it on in an agent that already had it on", () => {
    expect(agentAutoApprove(undefined, agent({ autoApprove: true }))).toBe(true);
  });

  it("lets an explicit answer win over the default, in both directions", () => {
    expect(agentAutoApprove(false, undefined)).toBe(false);
    expect(agentAutoApprove(false, agent({ autoApprove: true }))).toBe(false);
    expect(agentAutoApprove(true, agent({ autoApprove: false }))).toBe(true);
  });

  it("reads a config written before the flag existed as a new agent, not as a 'no'", () => {
    // An agent stored without the key never chose anything, so it gets today's default rather
    // than being frozen on the old one.
    const legacy = { ...agent(), autoApprove: undefined } as unknown as AgentConfig;
    expect(agentAutoApprove(undefined, legacy)).toBe(true);
  });
});

describe("autoApproveFlag", () => {
  // The day the default became "on" was the day `ainess agents add` could no longer create an
  // agent with its tool permissions held: `parseArgs` rejects `--auto-approve=false`, so the only
  // way to say "off" is a second flag. The dialog can still express it; the CLI could not.
  it("says nothing when neither flag was passed", () => {
    expect(autoApproveFlag(undefined, undefined)).toBeUndefined();
  });

  it("reads --auto-approve as yes and --no-auto-approve as no", () => {
    expect(autoApproveFlag(true, undefined)).toBe(true);
    expect(autoApproveFlag(undefined, true)).toBe(false);
  });

  it("takes the narrower reading when the two contradict each other", () => {
    // Between two readings of an ambiguous command, the one that grants less.
    expect(autoApproveFlag(true, true)).toBe(false);
  });

  it("creates an agent with the permission held, which is what it is for", () => {
    expect(agentAutoApprove(autoApproveFlag(undefined, true), undefined)).toBe(false);
  });
});

describe("the delegation gate stays where it was", () => {
  it("leaves a new agent inheriting the global approval setting", () => {
    // `requireApproval` absent means "follow config.approveDelegations" (see types.ts). The tool
    // permission moving does not get to write anything here.
    const fresh: AgentConfig = { ...agent(), autoApprove: agentAutoApprove(undefined, undefined) };

    expect(fresh.autoApprove).toBe(true);
    expect(fresh.requireApproval).toBeUndefined();
    expect("requireApproval" in fresh).toBe(false);
  });
});
