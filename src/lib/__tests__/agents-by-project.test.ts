// Every agent of every project, kept under the project it belongs to: two projects can each have
// an "Orchestrator" and a flat list said nothing about which was which.
import { describe, it, expect } from "vitest";
import { useAppStore, selectAgentsByProject } from "@/store";

const agent = (id: string, name: string) => ({ id, name, provider: "claude", role: "planner", parentId: null, autoApprove: false });

const withProjects = (projects: unknown[]) => {
  useAppStore.setState(state => ({ config: { ...state.config, projects } } as never));
  return selectAgentsByProject(useAppStore.getState());
};

describe("selectAgentsByProject", () => {
  it("keeps each project's agents under it, in order", () => {
    const groups = withProjects([
      { id: "p1", name: "shop", agents: [agent("a1", "Orchestrator")] },
      { id: "p2", name: "landing", agents: [agent("a2", "Orchestrator")] },
    ]);
    expect(groups.map(g => [g.project.name, g.agents.map(a => a.id)])).toEqual([
      ["shop", ["a1"]],
      ["landing", ["a2"]],
    ]);
  });

  it("leaves out a project with nobody in it, which would be an empty heading", () => {
    const groups = withProjects([
      { id: "p1", name: "shop", agents: [agent("a1", "Orchestrator")] },
      { id: "p2", name: "vacío", agents: [] },
      { id: "p3", name: "sin campo" },
    ]);
    expect(groups.map(g => g.project.name)).toEqual(["shop"]);
  });

  it("answers the same array while the projects do not change", () => {
    const first = withProjects([{ id: "p1", name: "shop", agents: [agent("a1", "Orchestrator")] }]);
    // A new array every read would re-render every select that watches it.
    expect(selectAgentsByProject(useAppStore.getState())).toBe(first);
  });
});
