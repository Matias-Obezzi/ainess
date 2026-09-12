// One agent, one process. The team has one reviewer, and a review that came in while that reviewer
// was working on something else used to start a second `agy.exe` on the same conversation. Now the
// work waits: a run that exists, that its parent counts, but that has no process until the turn
// ahead of it ends.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/store";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { startRun, launchQueuedRuns, stopAgent } from "@/lib/orchestrator";
import { isLiveRun, isFinishedRun, nextQueuedRun, queuedRunsOf } from "@/lib/run-queue";
import { boardFixes } from "@/lib/task-reconcile";
import { createTask } from "@/lib/tasks";
import type { Run } from "@/types";

vi.mock("@/lib/hooks", () => ({ emitHookEvent: async () => {} }));

const spawned: string[] = [];
const killed: string[] = [];

const run = (id: string, agentId: string, status: Run["status"], startedAt = 1, parentRunId: string | null = null): Run => ({
  id,
  projectId: "p1",
  agentId,
  parentRunId,
  rootRunId: parentRunId ?? id,
  prompt: "",
  status,
  startedAt,
  output: "",
  rawLines: [],
  childRunIds: [],
  round: 0,
});

/** A planner waiting on its round, a reviewer in the middle of a task the planner gave it. */
const withBusyReviewer = () => {
  useAppStore.setState({
    runs: {
      planner: { ...run("planner", "planner", "running"), childRunIds: ["r-1"] },
      "r-1": run("r-1", "reviewer", "running", 2, "planner"),
    },
    messages: [],
    tasks: {},
    runtime: {
      p1: {
        planner: { agentId: "planner", status: "waiting", queuedInstructions: [] },
        reviewer: { agentId: "reviewer", status: "working", currentRunId: "r-1", currentTask: "fix the tests", queuedInstructions: [] },
      },
    },
    binaries: { claude: { path: "claude", version: "1" } },
    config: {
      ...useAppStore.getState().config,
      projects: [{
        id: "p1", name: "P", workspaceDir: "C:/p", createdAt: 1,
        agents: [
          { id: "planner", name: "Planner", provider: "claude", role: "planner", parentId: null, autoApprove: true },
          { id: "reviewer", name: "Reviewer", provider: "claude", role: "reviewer", parentId: "planner", autoApprove: true },
        ],
      }],
    },
  } as never);
};

const runs = () => useAppStore.getState().runs;
const reviewerRuntime = () => useAppStore.getState().runtime.p1.reviewer;
const systemMessages = () => useAppStore.getState().messages.filter(m => m.kind === "system").map(m => m.text);

beforeEach(() => {
  spawned.length = 0;
  killed.length = 0;
  setTransport({
    ...nullTransport,
    spawnRun: async (opts: { runId: string }) => { spawned.push(opts.runId); },
    killRun: async (runId: string) => { killed.push(runId); return true; },
  } as never);
});

describe("the rules", () => {
  it("tells a run that is over from one that is not", () => {
    expect(isLiveRun("queued")).toBe(true);
    expect(isLiveRun("running")).toBe(true);
    for (const status of ["done", "error", "killed"] as const) {
      expect(isLiveRun(status)).toBe(false);
      expect(isFinishedRun(status)).toBe(true);
    }
  });

  it("hands out what waited longest first, and only for the agent asked about", () => {
    const all = {
      later: run("later", "reviewer", "queued", 5),
      first: run("first", "reviewer", "queued", 3),
      going: run("going", "reviewer", "running", 1),
      theirs: run("theirs", "planner", "queued", 2),
    };
    expect(queuedRunsOf(all, "reviewer", "p1").map(r => r.id)).toEqual(["first", "later"]);
    expect(nextQueuedRun(all, "reviewer", "p1")?.id).toBe("first");
    expect(nextQueuedRun(all, "planner", "p2")).toBeUndefined();
  });
});

describe("a run for an agent that is busy", () => {
  it("is written down as queued, with no second process and the agent's turn untouched", () => {
    withBusyReviewer();
    const id = startRun({ agentId: "reviewer", projectId: "p1", prompt: "review this", parentRunId: "planner", round: 0, rootRunId: "planner", review: { ofRunId: "impl", taskId: "t1" } });

    expect(id).toBeDefined();
    expect(runs()[id!].status).toBe("queued");
    expect(spawned).toEqual([]);
    // Still on the run it was on, not on the one that just arrived.
    expect(reviewerRuntime().currentRunId).toBe("r-1");
    expect(reviewerRuntime().status).toBe("working");
    // The parent counts it: a queued child is one it is still waiting for.
    expect(runs().planner.childRunIds).toContain(id);
    expect(systemMessages().some(text => text.includes("Reviewer"))).toBe(true);
  });

  it("starts when the agent's turn ends, in the order the work arrived", async () => {
    withBusyReviewer();
    const first = startRun({ agentId: "reviewer", projectId: "p1", prompt: "review A", parentRunId: "planner", round: 0, rootRunId: "planner" })!;
    const second = startRun({ agentId: "reviewer", projectId: "p1", prompt: "review B", parentRunId: "planner", round: 0, rootRunId: "planner" })!;
    expect(runs()[second].status).toBe("queued");

    // The turn ahead of them ends.
    useAppStore.setState(state => ({
      runs: { ...state.runs, "r-1": { ...state.runs["r-1"], status: "done" } },
      runtime: { p1: { ...state.runtime.p1, reviewer: { ...state.runtime.p1.reviewer, status: "idle", currentRunId: undefined } } },
    }));
    launchQueuedRuns("reviewer", "p1");
    await new Promise(resolve => setTimeout(resolve, 0));

    expect(runs()[first].status).toBe("running");
    expect(runs()[second].status).toBe("queued");
    expect(reviewerRuntime().currentRunId).toBe(first);
    expect(reviewerRuntime().status).toBe("working");
    expect(spawned).toEqual([first]);
  });

  it("does not start while the agent still has a turn going", () => {
    withBusyReviewer();
    const id = startRun({ agentId: "reviewer", projectId: "p1", prompt: "review", parentRunId: "planner", round: 0, rootRunId: "planner" })!;
    launchQueuedRuns("reviewer", "p1");
    expect(runs()[id].status).toBe("queued");
    expect(spawned).toEqual([]);
  });

  it("is dropped, not launched, when you stop the agent", async () => {
    withBusyReviewer();
    const id = startRun({ agentId: "reviewer", projectId: "p1", prompt: "review", parentRunId: "planner", round: 0, rootRunId: "planner" })!;
    await stopAgent("reviewer", "p1");

    expect(killed).toEqual(["r-1"]);
    expect(runs()[id].status).toBe("killed");
    expect(spawned).toEqual([]);
    // Nothing left to launch once the killed run's exit comes in.
    expect(nextQueuedRun(runs(), "reviewer", "p1")).toBeUndefined();
  });
});

describe("the board", () => {
  it("leaves a card whose run is waiting its turn", () => {
    const task = createTask({ id: "t1", projectId: "p1", title: "t1", status: "working", runId: "q" });
    expect(boardFixes([task], { q: run("q", "reviewer", "queued") }, { hasReviewer: true })).toEqual([]);
  });
});
