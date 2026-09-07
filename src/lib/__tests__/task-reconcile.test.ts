// The board only moves a card when it hears the run end, so a run that ends while nobody is
// listening — the app closed, the process killed, the exit lost — leaves the card in "en curso"
// forever. These are the rules for putting it where the run says it belongs.
import { describe, it, expect } from "vitest";
import { boardFixes } from "@/lib/task-reconcile";
import { createTask } from "@/lib/tasks";
import type { Run, Task, TaskStatus } from "@/types";

const task = (id: string, status: TaskStatus, runId?: string, extra: Partial<Task> = {}): Task =>
  createTask({ id, projectId: "p1", title: id, status, runId, ...extra });

const run = (id: string, status: Run["status"], parentRunId: string | null = "root"): Run => ({
  id,
  projectId: "p1",
  agentId: "a1",
  parentRunId,
  rootRunId: parentRunId ?? id,
  prompt: "",
  status,
  startedAt: 1,
  output: "",
  rawLines: [],
  childRunIds: [],
  round: 0,
});

const runs = (...list: Run[]): Record<string, Run> => Object.fromEntries(list.map(r => [r.id, r]));

describe("boardFixes", () => {
  it("leaves a card whose run is still going", () => {
    const fixes = boardFixes([task("t1", "working", "r1")], runs(run("r1", "running")), { hasReviewer: false });
    expect(fixes).toEqual([]);
  });

  it("sends a card whose run failed back to the user", () => {
    for (const status of ["error", "killed"] as const) {
      const fixes = boardFixes([task("t1", "working", "r1")], runs(run("r1", status)), { hasReviewer: false });
      expect(fixes).toEqual([{ taskId: "t1", status: "needs-you" }]);
    }
  });

  it("closes a finished delegation into review when somebody reviews", () => {
    const done = runs(run("r1", "done"));
    expect(boardFixes([task("t1", "working", "r1")], done, { hasReviewer: true }))
      .toEqual([{ taskId: "t1", status: "in-review" }]);
    expect(boardFixes([task("t1", "working", "r1")], done, { hasReviewer: false }))
      .toEqual([{ taskId: "t1", status: "ready" }]);
  });

  it("marks the user's own request ready, review or no review", () => {
    const rootRun = runs(run("r1", "done", null));
    expect(boardFixes([task("t1", "working", "r1")], rootRun, { hasReviewer: true }))
      .toEqual([{ taskId: "t1", status: "ready" }]);
  });

  it("hands over a card whose run is not around any more", () => {
    // Trimmed from memory, or from a history that was cleared: nothing is ever going to move it.
    expect(boardFixes([task("t1", "working", "gone")], {}, { hasReviewer: false }))
      .toEqual([{ taskId: "t1", status: "needs-you" }]);
  });

  it("keeps its hands off everything else", () => {
    const board = [
      task("manual", "working"), // parked there by hand, no run behind it
      task("backlog", "backlog", "r1"),
      task("ready", "ready", "r1"),
      task("archived", "working", "r1", { archived: true }),
    ];
    expect(boardFixes(board, runs(run("r1", "done")), { hasReviewer: false })).toEqual([]);
  });
});
