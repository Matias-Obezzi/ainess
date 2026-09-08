// Each project remembers its own view and its own model. Both used to be one value shared by the
// whole app, so opening B in the hierarchy and coming back to A showed A's hierarchy too, and a
// model picked in one conversation was gone the moment you looked at the board.
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import type { AgentConfig, Project } from "@/types";

const boss = (id: string): AgentConfig => ({
  id, name: `Jefe ${id}`, provider: "claude", role: "planner", parentId: null, autoApprove: false,
});

const project = (id: string): Project => ({
  id, name: id, workspaceDir: `C:/${id}`, createdAt: 1, agents: [boss(`${id}-1`)],
});

const S = () => useAppStore.getState();

beforeEach(() => {
  useAppStore.setState(state => ({
    config: { ...state.config, projects: [project("A"), project("B")], chats: [] },
    projectModes: {},
    composerModels: {},
    currentProjectId: null,
    currentChatId: null,
  }));
});

describe("the view of each project", () => {
  it("walks the user's own script", () => {
    // Viewing A as a conversation.
    S().openProject("A");
    S().setProjectMode("chat");
    expect(S().projectMode).toBe("chat");

    // Off to B, and into its hierarchy.
    S().openProject("B");
    S().setProjectMode("graph");
    expect(S().projectMode).toBe("graph");

    // Back to A: the conversation, not B's hierarchy.
    S().openProject("A");
    expect(S().projectMode).toBe("chat");

    // Now the board in A.
    S().setProjectMode("tasks");

    // B is still where it was left.
    S().openProject("B");
    expect(S().projectMode).toBe("graph");
    S().setProjectMode("chat");

    // And A is on the board.
    S().openProject("A");
    expect(S().projectMode).toBe("tasks");
    S().openProject("B");
    expect(S().projectMode).toBe("chat");
  });

  it("opens a project nobody has visited on the board", () => {
    S().openProject("A");
    expect(S().projectMode).toBe("tasks");
  });

  it("lands on the conversation when a chat is what was asked for", () => {
    useAppStore.setState(state => ({
      config: {
        ...state.config,
        chats: [{ id: "c1", projectId: "A", name: "Charla", mode: "shared", participants: [], createdAt: 1 }],
      },
    }));
    S().openProject("A");
    S().setProjectMode("graph");
    S().openProject("A", "c1");
    expect(S().projectMode).toBe("chat");
    expect(S().currentChatId).toBe("c1");
  });

  it("forgets a project that is deleted rather than keeping its view forever", () => {
    S().openProject("A");
    S().setProjectMode("graph");
    expect(S().projectModes.A).toBe("graph");
    S().removeProject("A");
    expect(S().projectModes.A).toBeUndefined();
  });
});

describe("the model of each conversation", () => {
  it("is kept per conversation and cleared by the default", () => {
    S().setComposerModel("project:A", "opus");
    S().setComposerModel("project:B", "haiku");
    expect(S().composerModels).toEqual({ "project:A": "opus", "project:B": "haiku" });

    // Back to the agent's own model: remembering "nothing" is remembering nothing.
    S().setComposerModel("project:A", "");
    expect(S().composerModels).toEqual({ "project:B": "haiku" });
  });

  it("ignores a call with no conversation to hang it on", () => {
    S().setComposerModel("", "opus");
    expect(S().composerModels).toEqual({});
  });
});
