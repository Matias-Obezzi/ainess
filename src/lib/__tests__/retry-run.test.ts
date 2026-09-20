import { describe, it, expect } from "vitest";
import { retryModelFor, retryModels, shownRootRuns } from "../retry";
import type { AgentConfig, Run } from "@/types";

function agent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: "a1",
    name: "Agent",
    provider: "claude",
    role: "implementer",
    parentId: null,
    autoApprove: false,
    ...overrides,
  };
}

describe("retryModels", () => {
  it("offers the provider's default models", () => {
    const models = retryModels(agent({ provider: "claude" }));
    expect(models).toEqual(expect.arrayContaining(["sonnet", "opus", "haiku"]));
  });

  it("includes the agent's own model even when the provider list doesn't have it", () => {
    const models = retryModels(agent({ provider: "claude", model: "my-custom-model" }));
    expect(models).toContain("my-custom-model");
  });

  it("does not repeat the agent's model when it is already in the provider list", () => {
    const models = retryModels(agent({ provider: "claude", model: "sonnet" }));
    expect(models.filter(m => m === "sonnet")).toHaveLength(1);
  });

  // The list belongs to the provider and every agent of that provider reads it. Handing back the
  // original would put it one `sort` away from whoever asked for the models of one retry.
  it("hands back a copy, so a caller cannot rewrite the provider's own list", () => {
    const a = agent();
    const first = retryModels(a);
    first.push("something-invented");
    first.sort();
    expect(retryModels(a)).not.toContain("something-invented");
    expect(retryModels(a)).toEqual(retryModels(agent()));
  });

  it("works for an agent with no model of its own", () => {
    const models = retryModels(agent({ provider: "claude", model: undefined }));
    expect(models).toEqual(expect.arrayContaining(["sonnet", "opus", "haiku"]));
  });
});

describe("retryModelFor", () => {
  it("keeps the previous model when the new agent supports it", () => {
    expect(retryModelFor(agent({ provider: "claude" }), "sonnet")).toBe("sonnet");
  });

  it("keeps the previous model when it is the new agent's own model, absent from the provider list", () => {
    expect(retryModelFor(agent({ provider: "claude", model: "my-custom-model" }), "my-custom-model")).toBe("my-custom-model");
  });

  it("returns undefined when the new agent cannot run the previous model", () => {
    expect(retryModelFor(agent({ provider: "claude" }), "gemini-3.1-pro-high")).toBeUndefined();
  });

  it("returns undefined when there was no previous model", () => {
    expect(retryModelFor(agent({ provider: "claude" }), undefined)).toBeUndefined();
  });

  it("does not break for an agent with no model and no previous model", () => {
    expect(retryModelFor(agent({ provider: "claude", model: undefined }), undefined)).toBeUndefined();
  });
});

/**
 * What the thread draws once a retry can take the place of the run it retries.
 *
 * The bug this comes from: retrying went through `submitPrompt`, so the user saw their own request
 * written a second time and a second bubble under it, at the bottom of the thread, while the run
 * that had failed stayed where it was. What was asked for is the opposite — the failed run
 * disappears and the new attempt appears in its place.
 */
function run(id: string, startedAt: number, replacesRunId?: string): Run {
  return {
    id,
    projectId: "p1",
    agentId: "a1",
    parentRunId: null,
    rootRunId: id,
    prompt: "arreglá el parser",
    status: "done",
    startedAt,
    output: "",
    rawLines: [],
    childRunIds: [],
    round: 0,
    replacesRunId,
  };
}

const ids = (runs: Run[]) => runs.map(r => r.id);

describe("shownRootRuns", () => {
  it("leaves an ordinary thread exactly as it was, oldest first", () => {
    expect(ids(shownRootRuns([run("c", 3), run("a", 1), run("b", 2)]))).toEqual(["a", "b", "c"]);
  });

  it("stops drawing the run a retry replaced", () => {
    const shown = shownRootRuns([run("a", 1), run("b", 2), run("b2", 9, "b")]);
    expect(ids(shown)).not.toContain("b");
  });

  it("puts the retry where the run it replaced was, not at the end", () => {
    // The retry is the newest run of the three by `startedAt`, and still belongs in the middle.
    const shown = shownRootRuns([run("a", 1), run("b", 2), run("c", 3), run("b2", 9, "b")]);
    expect(ids(shown)).toEqual(["a", "b2", "c"]);
  });

  it("keeps the place through a chain of retries", () => {
    const shown = shownRootRuns([
      run("a", 1), run("b", 2), run("c", 3),
      run("b2", 9, "b"), run("b3", 10, "b2"),
    ]);
    expect(ids(shown)).toEqual(["a", "b3", "c"]);
  });

  // The clock on the bubble and the elapsed time are read off `startedAt`, so it has to keep saying
  // when *this* attempt began — only the order is borrowed from the first one.
  it("does not touch the runs it hands back", () => {
    const retry = run("b2", 9, "b");
    const [shown] = shownRootRuns([run("b", 2), retry]);
    expect(shown.startedAt).toBe(9);
    expect(shown).toBe(retry);
  });

  it("falls back to its own time when the run it replaced is not here any more", () => {
    // Trimmed off the history file: there is nothing to sit in the place of, so it sits in its own.
    const shown = shownRootRuns([run("a", 1), run("c", 3), run("b2", 9, "gone")]);
    expect(ids(shown)).toEqual(["a", "c", "b2"]);
  });

  it("ends the walk on a chain that points at itself", () => {
    // Only a corrupt history file can produce this; hanging the whole thread on it is not an option.
    const shown = shownRootRuns([run("a", 1), run("b", 2, "b")]);
    expect(ids(shown)).toEqual(["a", "b"]);
  });

  it("is empty for an empty thread", () => {
    expect(shownRootRuns([])).toEqual([]);
  });
});
