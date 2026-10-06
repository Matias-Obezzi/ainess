// A project with no board records no task anywhere and never shows one.
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore, selectProjectMode } from "@/store";
import { buildSystemPrompt } from "@/lib/providers";
import type { AgentConfig, Project } from "@/types";

const planner: AgentConfig = { id: "pl", name: "Planner", provider: "claude", role: "planner", parentId: null } as AgentConfig;
const project = (board?: Project["board"]): Project =>
  ({ id: "p1", name: "web", workspaceDir: "C:/web", createdAt: 1, agents: [planner], board }) as Project;

describe("a project with no board", () => {
  beforeEach(() => {
    useAppStore.setState(state => ({ tasks: {}, config: { ...state.config, projects: [project({ provider: "none" })] } }));
  });

  it("keeps none of the cards made for it", () => {
    const task = useAppStore.getState().addTask("p1", { title: "Fase 0" });
    expect(task.title).toBe("Fase 0");
    expect(useAppStore.getState().tasks.p1 ?? []).toEqual([]);
  });

  it("opens on its conversation, even when asked for the board", () => {
    useAppStore.getState().openProject("p1", null, "tasks");
    expect(useAppStore.getState().projectMode).toBe("chat");
    useAppStore.getState().setProjectMode("tasks");
    expect(selectProjectMode(useAppStore.getState(), "p1")).toBe("chat");
  });

  it("still keeps the cards of a project that has one", () => {
    useAppStore.setState(state => ({ config: { ...state.config, projects: [project()] } }));
    useAppStore.getState().addTask("p1", { title: "Fase 0" });
    expect(useAppStore.getState().tasks.p1).toHaveLength(1);
  });

  it("tells its agents nothing about a board", () => {
    const extras = { skills: [], sharedContext: "", canNote: true, tasks: [] };
    expect(buildSystemPrompt(planner, [], extras)).toContain("```task");
    expect(buildSystemPrompt(planner, [], { ...extras, tasks: undefined, noBoard: true })).not.toContain("```task");
  });
});
