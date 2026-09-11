// How much the home screen says was done lately.
//
// The rule that matters is what is left out: a delegation is part of the task above it and would
// count the same work twice, and a run still going has not cost its afternoon yet.
import { describe, it, expect } from "vitest";
import { workSince } from "@/lib/recent-work";
import type { Project, Run } from "@/types";

const projects: Project[] = [
  { id: "p1", name: "Uno", workspaceDir: "C:/uno", createdAt: 1, agents: [] },
  { id: "p2", name: "Dos", workspaceDir: "C:/dos", createdAt: 1, agents: [] },
];

const run = (over: Partial<Run> & { id: string }): Run => ({
  projectId: "p1", agentId: "a1", parentRunId: null, rootRunId: over.id, prompt: "hacé algo",
  status: "done", startedAt: 1000, endedAt: 2000, output: "", rawLines: [], childRunIds: [], round: 0,
  ...over,
});

const asMap = (list: Run[]): Record<string, Run> => Object.fromEntries(list.map(r => [r.id, r]));

describe("workSince", () => {
  it("counts what finished inside the window, across projects", () => {
    const runs = asMap([
      run({ id: "a", endedAt: 5_000 }),
      run({ id: "b", endedAt: 6_000, projectId: "p2" }),
      run({ id: "viejo", endedAt: 100 }),
    ]);
    expect(workSince(runs, projects, 1_000)).toEqual({ tasks: 2, failed: 0, projects: 2 });
  });

  it("counts the failures inside the total rather than dropping them", () => {
    // "Eleven tasks this week" reads as eleven that worked.
    const runs = asMap([
      run({ id: "ok", endedAt: 5_000 }),
      run({ id: "roto", endedAt: 5_000, status: "error" }),
      run({ id: "cortado", endedAt: 5_000, status: "killed" }),
    ]);
    expect(workSince(runs, projects, 1_000)).toEqual({ tasks: 3, failed: 2, projects: 1 });
  });

  it("is all zeros for a window nothing happened in", () => {
    expect(workSince(asMap([run({ id: "a", endedAt: 100 })]), projects, 1_000))
      .toEqual({ tasks: 0, failed: 0, projects: 0 });
  });
});
