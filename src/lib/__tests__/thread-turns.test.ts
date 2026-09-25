// The bug: a root run with no parent was always drawn as a message the user typed, with only
// `kind === "chat"` excluded. `/compact` and a planner's `answer` to its own child are also
// root runs with no parent, but their prompt was written by the app, not typed by anyone — so a
// compaction turn showed up in the thread looking exactly like the user had asked for it.
//
// The fix that followed split the question in two: a compaction is drawn again (an automatic one
// restarts the agent's session on its own, and hiding it left no sign of that), but as a
// maintenance note — its prompt is still not the user's words, and nowhere that shows or re-offers
// a prompt as typed text may pick it up.
import { describe, it, expect } from "vitest";
import { isThreadTurn, isTypedPrompt } from "@/lib/thread-turns";
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

  it("draws a compact run, as the maintenance note it is", () => {
    expect(isThreadTurn({ kind: "compact" })).toBe(true);
  });

  it("hides a chat run", () => {
    expect(isThreadTurn({ kind: "chat" })).toBe(false);
  });

  it("hides an answer run", () => {
    expect(isThreadTurn({ kind: "answer" })).toBe(false);
  });
});

describe("isTypedPrompt", () => {
  it("is true for a run with no kind", () => {
    expect(isTypedPrompt({ kind: undefined })).toBe(true);
  });

  it("is true for a task run", () => {
    expect(isTypedPrompt({ kind: "task" })).toBe(true);
  });

  it("is false for a compact run: the app wrote that prompt", () => {
    expect(isTypedPrompt({ kind: "compact" })).toBe(false);
  });

  it("is false for a chat run", () => {
    expect(isTypedPrompt({ kind: "chat" })).toBe(false);
  });

  it("is false for an answer run", () => {
    expect(isTypedPrompt({ kind: "answer" })).toBe(false);
  });
});

describe("OrchestratorThread's root run filter", () => {
  it("keeps the compaction in the thread and leaves the agent-to-agent turns out", () => {
    const roots = [run("task"), run("compact"), run("chat"), run("answer")];
    const shown = shownRootRuns(roots.filter(r => r.parentRunId === null && isThreadTurn(r)));
    expect(shown.map(r => r.id)).toEqual(["r-task", "r-compact"]);
  });
});

describe("the composer's history of what was typed", () => {
  it("does not offer a compaction prompt back to the user", () => {
    const roots = [run("task"), run("compact")];
    const past = roots
      .filter(r => !r.parentRunId && r.round === 0 && isTypedPrompt(r))
      .map(r => r.id);
    expect(past).toEqual(["r-task"]);
  });
});
