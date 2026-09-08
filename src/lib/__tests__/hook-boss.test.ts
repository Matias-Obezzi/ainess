// A hook that writes to "the boss" rather than to a named agent.
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { instructTargets } from "@/lib/hooks";
import { BOSS_TARGET, bossOf } from "@/lib/team";
import type { AgentConfig, Hook, Project } from "@/types";

const agent = (over: Partial<AgentConfig>): AgentConfig => ({
  id: "a", name: "A", provider: "claude", role: "implementer", parentId: null, autoApprove: false, ...over,
});

const project = (id: string, agents: AgentConfig[]): Project => ({
  id, name: id, workspaceDir: `C:/${id}`, createdAt: 1, agents,
});

const hook = (over: Partial<Hook> = {}): Hook => ({
  id: "h1", name: "h", event: "schedule", enabled: true,
  action: { type: "instruct", agentId: BOSS_TARGET, template: "revisá el tablero" },
  ...over,
});

const bossA = agent({ id: "a1", name: "Jefe A", role: "planner" });
const workerA = agent({ id: "a2", name: "Obrero A", parentId: "a1" });
const bossB = agent({ id: "b1", name: "Jefe B", role: "planner" });

const projects = [project("pA", [workerA, bossA]), project("pB", [bossB])];

beforeEach(() => {
  useAppStore.setState(state => ({ config: { ...state.config, projects } }));
});

describe("bossOf", () => {
  it("is the planner at the root, wherever it sits in the list", () => {
    expect(bossOf([workerA, bossA])?.id).toBe("a1");
  });

  it("falls back to the first agent with nobody above it", () => {
    const lone = agent({ id: "x1", name: "Solo" });
    expect(bossOf([agent({ id: "x2", parentId: "x1" }), lone])?.id).toBe("x1");
  });

  it("is nobody when the team is empty", () => {
    expect(bossOf([])).toBeUndefined();
  });
});

describe("instructTargets", () => {
  it("reaches the boss of every project when nothing narrows it down", () => {
    expect(instructTargets(hook(), {})).toEqual([
      { agentId: "a1", projectId: "pA" },
      { agentId: "b1", projectId: "pB" },
    ]);
  });

  it("reaches only the filtered project's boss", () => {
    expect(instructTargets(hook({ filter: { projectId: "pB" } }), {})).toEqual([
      { agentId: "b1", projectId: "pB" },
    ]);
  });

  it("stays in the project where an agent's event happened", () => {
    const ctx = { project: projects[0], agent: workerA };
    expect(instructTargets(hook({ event: "task.finished" }), ctx)).toEqual([
      { agentId: "a1", projectId: "pA" },
    ]);
  });

  it("skips a project with no team rather than failing the whole hook", () => {
    useAppStore.setState(state => ({
      config: { ...state.config, projects: [...projects, project("pC", [])] },
    }));
    expect(instructTargets(hook(), {}).map(t => t.projectId)).toEqual(["pA", "pB"]);
  });

  it("leaves a named agent exactly where it was pointed", () => {
    const named = hook({ action: { type: "instruct", agentId: "a2", template: "x" } });
    expect(instructTargets(named, { project: projects[0] })).toEqual([
      { agentId: "a2", projectId: "pA" },
    ]);
    // No project in the context means there is no project to run it in.
    expect(instructTargets(named, {})).toEqual([]);
  });
});
