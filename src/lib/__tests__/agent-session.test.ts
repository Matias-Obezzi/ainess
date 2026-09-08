// A session belongs to the CLI that opened it, in the folder it ran in. Changing either under an
// agent used to leave the old id in place, and the next run handed Antigravity a Claude session.
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";

const project = {
  id: "p1",
  name: "shop",
  workspaceDir: "C:/repos/shop",
  createdAt: 0,
  agents: [{ id: "a1", name: "Uno", provider: "claude", role: "implementer", parentId: null, autoApprove: false }],
};

beforeEach(() => {
  useAppStore.setState(state => ({
    config: { ...state.config, projects: [project] },
    runtime: { p1: { a1: { agentId: "a1", status: "idle", queuedInstructions: [], sessionId: "ses-claude" } } },
  } as never));
});

const session = () => useAppStore.getState().runtime.p1.a1.sessionId;

describe("updateAgent", () => {
  it("forgets the session when the provider changes", () => {
    useAppStore.getState().updateAgent("p1", "a1", { provider: "antigravity" });
    expect(session()).toBeUndefined();
    expect(useAppStore.getState().config.projects[0].agents[0].provider).toBe("antigravity");
  });

  it("forgets it when the agent moves to its own worktree", () => {
    useAppStore.getState().updateAgent("p1", "a1", { worktree: true });
    expect(session()).toBeUndefined();
  });

  it("keeps it for a change that does not move the conversation", () => {
    useAppStore.getState().updateAgent("p1", "a1", { name: "Otro nombre", model: "opus" });
    expect(session()).toBe("ses-claude");
  });

  it("keeps it when the provider is set to the one it already was", () => {
    useAppStore.getState().updateAgent("p1", "a1", { provider: "claude" });
    expect(session()).toBe("ses-claude");
  });
});
