// A planner waits for the round it delegated. Which runs make up that round has to survive the
// store being rebuilt from disk: the parent's `childRunIds` is written when a child starts, so a
// task delegated in one session and approved in the next has a parent whose list is empty — and an
// empty list, read on its own, says "everything finished".
import { describe, it, expect } from "vitest";
import { childRunsOf } from "@/lib/orchestrator";
import type { Run } from "@/types";

const run = (id: string, parentRunId: string | null, status: Run["status"], startedAt = 1, childRunIds: string[] = []): Run => ({
  id,
  projectId: "p1",
  agentId: "a1",
  parentRunId,
  rootRunId: parentRunId ?? id,
  prompt: "",
  status,
  startedAt,
  output: "",
  rawLines: [],
  childRunIds,
  round: 0,
});

describe("childRunsOf", () => {
  it("finds the children the parent never recorded", () => {
    const runs: Record<string, Run> = {
      parent: run("parent", null, "done"),
      c1: run("c1", "parent", "error", 2),
      c2: run("c2", "parent", "running", 3),
    };
    const children = childRunsOf(runs, "parent");
    expect(children.map(r => r.id)).toEqual(["c1", "c2"]);
    expect(children.every(r => r.status !== "running")).toBe(false);
  });

  it("counts a child once when both ends know about it, oldest first", () => {
    const runs: Record<string, Run> = {
      parent: run("parent", null, "done", 1, ["c2", "c1"]),
      c1: run("c1", "parent", "done", 2),
      c2: run("c2", "parent", "done", 3),
    };
    expect(childRunsOf(runs, "parent").map(r => r.id)).toEqual(["c1", "c2"]);
  });

  it("keeps a recorded child whose run is gone out of the list", () => {
    const runs: Record<string, Run> = { parent: run("parent", null, "done", 1, ["trimmed"]) };
    expect(childRunsOf(runs, "parent")).toEqual([]);
  });

  it("leaves other parents' runs alone", () => {
    const runs: Record<string, Run> = {
      parent: run("parent", null, "done"),
      other: run("other", null, "done"),
      mine: run("mine", "parent", "done", 2),
      theirs: run("theirs", "other", "running", 3),
    };
    expect(childRunsOf(runs, "parent").map(r => r.id)).toEqual(["mine"]);
  });
});
