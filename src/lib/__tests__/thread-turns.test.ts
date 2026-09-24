// The bug: a root run with no parent was always drawn as a message the user typed, with only
// `kind === "chat"` excluded. `/compact` and a planner's `answer` to its own child are also
// root runs with no parent, but their prompt was written by the app, not typed by anyone — so a
// compaction turn showed up in the thread looking exactly like the user had asked for it.
import { describe, it, expect } from "vitest";
import { isThreadTurn } from "@/lib/thread-turns";
import { shownRootRuns } from "@/lib/retry";
import type { Run } from "@/types";

function run(kind: Run["kind"]): Run {
  return {
    id: `r-${kind ?? "default"}`, projectId: "p1", agentId: "a1", parentRunId: null, rootRunId: "r1",
    prompt: "whatever the app wrote", status: "done", startedAt: 1000, endedAt: 2000,
    output: "", rawLines: [], childRunIds: [], round: 0, model: "sonnet", kind,
  };
}

describe("isThreadTurn", () => {
  it("draws a run with no kind", () => {
    expect(isThreadTurn({ kind: undefined })).toBe(true);
  });

  it("draws a task run", () => {
    expect(isThreadTurn({ kind: "task" })).toBe(true);
  });

  it("hides a chat run", () => {
    expect(isThreadTurn({ kind: "chat" })).toBe(false);
  });

  it("hides a compact run", () => {
    expect(isThreadTurn({ kind: "compact" })).toBe(false);
  });

  it("hides an answer run", () => {
    expect(isThreadTurn({ kind: "answer" })).toBe(false);
  });
});

describe("OrchestratorThread's root run filter", () => {
  it("leaves a compact run out of the thread", () => {
    const roots = [run("task"), run("compact"), run("chat"), run("answer")];
    const shown = shownRootRuns(roots.filter(r => r.parentRunId === null && isThreadTurn(r)));
    expect(shown.map(r => r.id)).toEqual(["r-task"]);
  });
});
