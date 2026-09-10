// What each agent was in the middle of when the app went away.
//
// The bug: updating the app while a project was working brought it back looking like a project
// where nothing had ever happened. The runs were restored and the thread showed them, but the
// hierarchy reads `runtime`, and a restart builds that from the team alone — every agent idle, with
// nothing to say. What is pinned here is that the task comes back with the agent, and that it never
// arrives on top of an agent this process has already put to work.
import { describe, it, expect } from "vitest";
import { runtimeAfterInterruption } from "@/lib/interrupted-runtime";
import type { AgentRuntime, Run } from "@/types";

const idle = (agentId: string): AgentRuntime => ({ agentId, status: "idle", queuedInstructions: [] });

const run = (over: Partial<Run> & { agentId: string }): Run => ({
  id: "r1",
  projectId: "p1",
  parentRunId: null,
  rootRunId: "r1",
  prompt: "hacé algo",
  status: "killed",
  startedAt: 100,
  output: "",
  rawLines: [],
  childRunIds: [],
  round: 0,
  ...over,
});

describe("runtimeAfterInterruption", () => {
  it("brings the agent back stopped, on the task it was cut off in", () => {
    const next = runtimeAfterInterruption({ a1: idle("a1") }, [run({ agentId: "a1", prompt: "migrar la base" })]);
    expect(next.a1).toMatchObject({ status: "stopped", currentTask: "migrar la base", currentRunId: "r1" });
  });

  it("says stopped rather than error: nothing failed, the app went away", () => {
    const next = runtimeAfterInterruption({ a1: idle("a1") }, [run({ agentId: "a1" })]);
    expect(next.a1.status).toBe("stopped");
  });

  it("shows the last run an agent was on when there were several", () => {
    const next = runtimeAfterInterruption({ a1: idle("a1") }, [
      run({ id: "old", agentId: "a1", prompt: "lo viejo", startedAt: 100 }),
      run({ id: "new", agentId: "a1", prompt: "lo último", startedAt: 200 }),
    ]);
    expect(next.a1).toMatchObject({ currentTask: "lo último", currentRunId: "new" });
  });

  it("does not care what order they came in", () => {
    const next = runtimeAfterInterruption({ a1: idle("a1") }, [
      run({ id: "new", agentId: "a1", prompt: "lo último", startedAt: 200 }),
      run({ id: "old", agentId: "a1", prompt: "lo viejo", startedAt: 100 }),
    ]);
    expect(next.a1.currentRunId).toBe("new");
  });

  it("restores a whole delegation, not just the one that was asked", () => {
    const before = { planner: idle("planner"), impl: idle("impl") };
    const next = runtimeAfterInterruption(before, [
      run({ id: "p", agentId: "planner", prompt: "coordinar" }),
      run({ id: "i", agentId: "impl", prompt: "implementar" }),
    ]);
    expect(next.planner.currentTask).toBe("coordinar");
    expect(next.impl.currentTask).toBe("implementar");
  });

  it("leaves an agent this process already put to work alone", () => {
    // The merge is async: a bridge message or a schedule hook can start a run while it is in
    // flight, and a dead run's task on top of a live one describes the wrong thing entirely.
    const working: AgentRuntime = { agentId: "a1", status: "working", currentRunId: "live", currentTask: "lo de ahora", queuedInstructions: [] };
    const next = runtimeAfterInterruption({ a1: working }, [run({ agentId: "a1", prompt: "lo viejo" })]);
    expect(next.a1).toBe(working);
  });

  it("skips an agent that was deleted since", () => {
    const next = runtimeAfterInterruption({}, [run({ agentId: "gone" })]);
    expect(next).toEqual({});
  });

  it("hands back the same object when there is nothing to restore", () => {
    const before = { a1: idle("a1") };
    expect(runtimeAfterInterruption(before, [])).toBe(before);
  });
});
