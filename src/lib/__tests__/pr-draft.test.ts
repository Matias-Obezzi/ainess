import { describe, it, expect } from "vitest";
import { prDraft } from "../pr-draft";
import type { Run, Task } from "@/types";

function task(overrides: Partial<Task> = {}): Task {
  return {
    id: "t1",
    projectId: "p1",
    title: "Fix the flaky upload test",
    status: "ready",
    dependsOn: [],
    createdAt: 0,
    updatedAt: 0,
    order: 0,
    archived: false,
    ...overrides,
  };
}

function run(overrides: Partial<Run> = {}): Run {
  return {
    id: "r1",
    projectId: "p1",
    agentId: "a1",
    parentRunId: null,
    rootRunId: "r1",
    prompt: "Fix the flaky upload test\n\nMore detail here.",
    status: "done",
    startedAt: 0,
    output: "",
    rawLines: [],
    childRunIds: [],
    round: 0,
    ...overrides,
  };
}

describe("prDraft", () => {
  it("uses the task's title", () => {
    const draft = prDraft({ task: task({ title: "Add retry button" }) });
    expect(draft.title).toBe("Add retry button");
  });

  it("falls back to the first line of the run's prompt when there is no task", () => {
    const draft = prDraft({ run: run({ prompt: "Add retry button\n\nDetails follow." }) });
    expect(draft.title).toBe("Add retry button");
  });

  it("truncates a long title", () => {
    const long = "x".repeat(120);
    const draft = prDraft({ task: task({ title: long }) });
    expect(draft.title.length).toBeLessThan(long.length);
    expect(draft.title.endsWith("…")).toBe(true);
  });

  it("includes files and verified steps when the run reports a result block", () => {
    const output = [
      "All done.",
      "```result",
      JSON.stringify({ files: ["src/lib/a.ts"], verified: ["npm test"], blocked: [] }),
      "```",
    ].join("\n");
    const draft = prDraft({ task: task(), run: run({ output }) });
    expect(draft.body).toContain("## Files");
    expect(draft.body).toContain("src/lib/a.ts");
    expect(draft.body).toContain("## Verified");
    expect(draft.body).toContain("npm test");
  });

  it("includes what is blocked, with its own heading", () => {
    const output = [
      "```result",
      JSON.stringify({ files: [], verified: [], blocked: ["needs a design decision"] }),
      "```",
    ].join("\n");
    const draft = prDraft({ task: task(), run: run({ output }) });
    expect(draft.body).toContain("## Blocked");
    expect(draft.body).toContain("needs a design decision");
  });

  it("does not invent empty sections when there is no result block", () => {
    const draft = prDraft({ task: task({ detail: "Some detail." }), run: run({ output: "just prose" }) });
    expect(draft.body).not.toContain("## Files");
    expect(draft.body).not.toContain("## Verified");
    expect(draft.body).not.toContain("## Blocked");
    expect(draft.body).toContain("Some detail.");
  });

  it("returns empty strings without a task or a run", () => {
    expect(prDraft({})).toEqual({ title: "", body: "" });
  });
});
