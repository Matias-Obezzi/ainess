// What the home screen says was done lately.
//
// The rule that matters is what is left out: a delegation is part of the task above it, and a run
// still going is already in the "working" list right above this one — in both places it reads as
// two runs.
import { describe, it, expect } from "vitest";
import { recentWork, workSince } from "@/lib/recent-work";
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

describe("recentWork", () => {
  it("puts the most recently finished first", () => {
    const runs = asMap([
      run({ id: "viejo", endedAt: 1_000 }),
      run({ id: "nuevo", endedAt: 3_000 }),
      run({ id: "medio", endedAt: 2_000 }),
    ]);
    expect(recentWork(runs, projects, 10).map(r => r.runId)).toEqual(["nuevo", "medio", "viejo"]);
  });

  it("leaves out a delegation: it is part of the task above it", () => {
    const runs = asMap([run({ id: "raiz" }), run({ id: "hijo", parentRunId: "raiz" })]);
    expect(recentWork(runs, projects, 10).map(r => r.runId)).toEqual(["raiz"]);
  });

  it("leaves out what is still going, which the working list already shows", () => {
    const runs = asMap([run({ id: "corriendo", status: "running", endedAt: undefined }), run({ id: "listo" })]);
    expect(recentWork(runs, projects, 10).map(r => r.runId)).toEqual(["listo"]);
  });

  it("keeps a run that failed: it happened", () => {
    const runs = asMap([run({ id: "roto", status: "error" })]);
    expect(recentWork(runs, projects, 10)[0].status).toBe("error");
  });

  it("drops the runs of a project that no longer exists", () => {
    const runs = asMap([run({ id: "huerfano", projectId: "borrado" }), run({ id: "vivo" })]);
    expect(recentWork(runs, projects, 10).map(r => r.runId)).toEqual(["vivo"]);
  });

  it("falls back to the start for a run that never reported an end", () => {
    const runs = asMap([run({ id: "sin-fin", endedAt: undefined, startedAt: 5_000, status: "killed" })]);
    expect(recentWork(runs, projects, 10)[0].at).toBe(5_000);
  });

  it("carries the chat it happened in, so the row can land there", () => {
    const runs = asMap([run({ id: "charla", kind: "chat", chatId: "c1" })]);
    expect(recentWork(runs, projects, 10)[0]).toMatchObject({ kind: "chat", chatId: "c1" });
  });

  it("stops at the limit", () => {
    const runs = asMap([run({ id: "a" }), run({ id: "b" }), run({ id: "c" })]);
    expect(recentWork(runs, projects, 2)).toHaveLength(2);
    expect(recentWork(runs, projects, 0)).toHaveLength(0);
  });
});

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
