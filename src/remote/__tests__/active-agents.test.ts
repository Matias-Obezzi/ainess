import { describe, it, expect } from "vitest";
import { activeAgentsAcross } from "@/remote/active-agents";
import type { AgentConfig, AgentRuntime, Project, Run } from "@/types";

function makeAgent(id: string, name: string): AgentConfig {
  return {
    id,
    name,
    provider: "claude",
    role: "implementer",
    parentId: null,
    autoApprove: false,
  };
}

function makeProject(id: string, name: string, agents: AgentConfig[], color?: string): Project {
  return {
    id,
    name,
    workspaceDir: `/tmp/${id}`,
    createdAt: Date.now(),
    agents,
    color,
  };
}

function makeRuntime(agentId: string, status: AgentRuntime["status"], currentTask?: string, currentRunId?: string): AgentRuntime {
  return {
    agentId,
    status,
    currentTask,
    currentRunId,
    queuedInstructions: [],
  };
}

describe("activeAgentsAcross", () => {
  it("picks working and waiting agents and skips idle or other statuses", () => {
    const a1 = makeAgent("a1", "Alice");
    const a2 = makeAgent("a2", "Bob");
    const a3 = makeAgent("a3", "Charlie");
    const a4 = makeAgent("a4", "David");
    const p1 = makeProject("p1", "Project 1", [a1, a2, a3, a4]);

    const runtime = {
      p1: {
        a1: makeRuntime("a1", "working", "Refactoring"),
        a2: makeRuntime("a2", "idle"),
        a3: makeRuntime("a3", "waiting", "Approval needed"),
        a4: makeRuntime("a4", "stopped"),
      },
    };

    const rows = activeAgentsAcross(runtime, [p1], {});
    expect(rows).toHaveLength(2);
    expect(rows.map(r => r.agentId)).toEqual(["a3", "a1"]);
    expect(rows.find(r => r.agentId === "a2")).toBeUndefined();
    expect(rows.find(r => r.agentId === "a4")).toBeUndefined();
  });

  it("places waiting agents first, then working, each group in project order", () => {
    const a1 = makeAgent("a1", "Agent P1-1");
    const a2 = makeAgent("a2", "Agent P1-2");
    const b1 = makeAgent("b1", "Agent P2-1");
    const b2 = makeAgent("b2", "Agent P2-2");

    const p1 = makeProject("p1", "Project Alpha", [a1, a2]);
    const p2 = makeProject("p2", "Project Beta", [b1, b2]);

    const runtime = {
      p1: {
        a1: makeRuntime("a1", "working"),
        a2: makeRuntime("a2", "waiting"),
      },
      p2: {
        b1: makeRuntime("b1", "waiting"),
        b2: makeRuntime("b2", "working"),
      },
    };

    const rows = activeAgentsAcross(runtime, [p1, p2], {});

    // Waiting from p1, then waiting from p2, then working from p1, then working from p2
    expect(rows.map(r => `${r.projectId}:${r.agentId}:${r.status}`)).toEqual([
      "p1:a2:waiting",
      "p2:b1:waiting",
      "p1:a1:working",
      "p2:b2:working",
    ]);
  });

  it("follows detail fallback order: currentTask -> run prompt -> undefined", () => {
    const a1 = makeAgent("a1", "Agent 1");
    const a2 = makeAgent("a2", "Agent 2");
    const a3 = makeAgent("a3", "Agent 3");
    const p = makeProject("p1", "Project", [a1, a2, a3]);

    const runs: Record<string, Run> = {
      run1: {
        id: "run1",
        projectId: "p1",
        agentId: "a1",
        parentRunId: null,
        rootRunId: "run1",
        prompt: "Run 1 prompt text",
        status: "running",
        startedAt: 100,
        output: "",
        rawLines: [],
        childRunIds: [],
        round: 0,
      },
      run2: {
        id: "run2",
        projectId: "p1",
        agentId: "a2",
        parentRunId: null,
        rootRunId: "run2",
        prompt: "Run 2 prompt text",
        status: "running",
        startedAt: 200,
        output: "",
        rawLines: [],
        childRunIds: [],
        round: 0,
      },
    };

    const runtime = {
      p1: {
        // Both currentTask and currentRunId exist -> currentTask wins
        a1: makeRuntime("a1", "working", "Explicit task description", "run1"),
        // Only currentRunId exists -> run prompt used
        a2: makeRuntime("a2", "working", undefined, "run2"),
        // Neither exists -> undefined
        a3: makeRuntime("a3", "working", undefined, undefined),
      },
    };

    const rows = activeAgentsAcross(runtime, [p], runs);
    expect(rows[0].detail).toBe("Explicit task description");
    expect(rows[1].detail).toBe("Run 2 prompt text");
    expect(rows[2].detail).toBeUndefined();
  });

  it("skips agents whose project is missing from the projects list", () => {
    const a1 = makeAgent("a1", "Agent 1");
    const p1 = makeProject("p1", "Project 1", [a1]);

    const runtime = {
      p1: {
        a1: makeRuntime("a1", "working"),
      },
      unknownProject: {
        rogueAgent: makeRuntime("rogueAgent", "working"),
      },
    };

    const rows = activeAgentsAcross(runtime, [p1], {});
    expect(rows).toHaveLength(1);
    expect(rows[0].agentId).toBe("a1");
  });

  it("skips agents whose config is missing in project.agents", () => {
    const a1 = makeAgent("a1", "Agent 1");
    const p1 = makeProject("p1", "Project 1", [a1]);

    const runtime = {
      p1: {
        a1: makeRuntime("a1", "working"),
        ghostAgent: makeRuntime("ghostAgent", "working"),
      },
    };

    const rows = activeAgentsAcross(runtime, [p1], {});
    expect(rows).toHaveLength(1);
    expect(rows[0].agentId).toBe("a1");
  });

  it("handles empty or null parameters without errors", () => {
    expect(activeAgentsAcross(null, null, null)).toEqual([]);
    expect(activeAgentsAcross({}, [], {})).toEqual([]);
  });
});
