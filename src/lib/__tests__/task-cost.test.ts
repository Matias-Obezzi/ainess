// What a card cost: its own run plus its family's, counted once each.
//
// The thing worth pinning is that nothing is invented. A CLI that reports no dollars still ran, so
// the card says "one run, zero dollars" instead of guessing a price or hiding the run.
import { describe, it, expect } from "vitest";
import { taskCost } from "@/lib/tasks";
import type { Run, Task } from "@/types";

const task = (id: string, over: Partial<Task> = {}): Task => ({
  id,
  projectId: "p1",
  title: id,
  status: "backlog",
  dependsOn: [],
  order: 0,
  archived: false,
  createdAt: 0,
  updatedAt: 0,
  ...over,
});

const run = (id: string, over: Partial<Run> = {}): Run => ({
  id,
  projectId: "p1",
  agentId: "a1",
  parentRunId: null,
  rootRunId: id,
  prompt: "",
  status: "done",
  startedAt: 1_000,
  endedAt: 2_000,
  output: "",
  rawLines: [],
  childRunIds: [],
  round: 0,
  ...over,
});

const byId = (list: Run[]): Record<string, Run> => Object.fromEntries(list.map(r => [r.id, r]));

describe("taskCost", () => {
  it("adds up the whole family", () => {
    const tasks = [task("parent", { runId: "r1" }), task("child", { dependsOn: ["parent"], runId: "r2" })];
    const runs = byId([
      run("r1", { usage: { costUsd: 0.25, inputTokens: 100, outputTokens: 50 } }),
      run("r2", { startedAt: 0, endedAt: 3_000, usage: { costUsd: 0.75, inputTokens: 200 } }),
    ]);

    expect(taskCost(tasks, runs, "parent")).toEqual({ usd: 1, tokens: 350, ms: 4_000, runs: 2 });
  });

  it("counts a run reached by two paths only once", () => {
    // The child of a delegation has its own card *and* hangs off the parent's run.
    const tasks = [task("parent", { runId: "r1" }), task("child", { dependsOn: ["parent"], runId: "r2" })];
    const runs = byId([
      run("r1", { childRunIds: ["r2"], usage: { costUsd: 0.25 } }),
      run("r2", { usage: { costUsd: 0.75 } }),
    ]);

    expect(taskCost(tasks, runs, "parent")).toEqual({ usd: 1, tokens: 0, ms: 2_000, runs: 2 });
  });

  it("gives zero for a card that never ran", () => {
    expect(taskCost([task("lonely")], {}, "lonely")).toEqual({ usd: 0, tokens: 0, ms: 0, runs: 0 });
  });

  it("counts a run whose CLI reported nothing, at zero dollars", () => {
    const runs = byId([run("r1")]);
    expect(taskCost([task("t", { runId: "r1" })], runs, "t")).toEqual({ usd: 0, tokens: 0, ms: 1_000, runs: 1 });
  });

  it("ignores a runId with no run behind it", () => {
    expect(taskCost([task("t", { runId: "gone" })], {}, "t")).toEqual({ usd: 0, tokens: 0, ms: 0, runs: 0 });
  });
});
