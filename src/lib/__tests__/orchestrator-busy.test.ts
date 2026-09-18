// A `currentRunId` is not proof that the agent is working.
//
// The bug: after restarting the PC or the app, every agent was stuck. Startup puts each agent back
// on the run it was cut off in — `stopped`, with `currentRunId` pointing at a run that is already
// `killed` — so the hierarchy can show what it was doing. `startRun` read that id alone and called
// the agent busy, so every new run was born `queued`, waiting for a turn that had ended before the
// app started. `launchQueuedRuns` used the same check, so nothing ever freed it.
import { describe, it, expect } from "vitest";
import { isAgentBusy } from "@/lib/orchestrator";
import type { AppState } from "@/store";
import type { AgentRuntime, AgentStatus, Run, RunStatus } from "@/types";

const run = (id: string, status: RunStatus): Run => ({
  id,
  projectId: "p1",
  agentId: "a1",
  parentRunId: null,
  rootRunId: id,
  prompt: "",
  status,
  startedAt: 1,
  output: "",
  rawLines: [],
  childRunIds: [],
  round: 0,
});

const runtime = (status: AgentStatus, currentRunId?: string): AgentRuntime => ({
  agentId: "a1",
  status,
  currentRunId,
  queuedInstructions: [],
});

/** Only the two fields `isAgentBusy` reads; the rest of the store is beside the point here. */
const state = (rt: AgentRuntime, runs: Run[]): AppState =>
  ({
    runtime: { p1: { a1: rt } },
    runs: Object.fromEntries(runs.map(r => [r.id, r])),
  }) as unknown as AppState;

describe("isAgentBusy", () => {
  it("frees the agent a restart left stopped on a killed run", () => {
    const s = state(runtime("stopped", "r1"), [run("r1", "killed")]);
    expect(isAgentBusy(s, "p1", "a1")).toBe(false);
  });

  it("frees an agent still marked working whose run is done", () => {
    const s = state(runtime("working", "r1"), [run("r1", "done")]);
    expect(isAgentBusy(s, "p1", "a1")).toBe(false);
  });

  it("frees an agent still marked working whose run ended in error", () => {
    const s = state(runtime("working", "r1"), [run("r1", "error")]);
    expect(isAgentBusy(s, "p1", "a1")).toBe(false);
  });

  it("holds the agent that really is in a turn", () => {
    const s = state(runtime("working", "r1"), [run("r1", "running")]);
    expect(isAgentBusy(s, "p1", "a1")).toBe(true);
  });

  it("is free with no run at all", () => {
    const s = state(runtime("idle"), []);
    expect(isAgentBusy(s, "p1", "a1")).toBe(false);
  });

  it("is free when the run is unknown and the agent is stopped", () => {
    // The project has not been read off disk yet, so the id proves nothing: the runtime status is
    // the only evidence left.
    const s = state(runtime("stopped", "gone"), []);
    expect(isAgentBusy(s, "p1", "a1")).toBe(false);
  });

  it("is busy when the run is unknown and the agent says it is working", () => {
    const s = state(runtime("working", "gone"), []);
    expect(isAgentBusy(s, "p1", "a1")).toBe(true);
  });

  it("is free for an agent the project has no runtime for", () => {
    const s = state(runtime("working", "r1"), [run("r1", "running")]);
    expect(isAgentBusy(s, "p1", "otro")).toBe(false);
  });
});
