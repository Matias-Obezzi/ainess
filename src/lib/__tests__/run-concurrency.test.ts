// Nothing used to bound how many CLIs ran at once.
//
// Ten delegations were ten processes, each of them running tests and builds of its own, on whatever
// machine the app happened to be on. Attended, the approval dialog was the throttle — you see ten
// and approve them at your pace; unattended there was nothing at all. `config.maxConcurrentRuns` is
// the ceiling, it counts every project together because the machine is one, and a run over it is
// queued rather than dropped.
//
// The last test here is the one that matters most: a ceiling of 1 with a planner that delegates.
// That is the shape a concurrency cap deadlocks in — the planner holding the only slot while the
// child it waits for is queued behind that same slot. It cannot happen in this orchestrator, and
// this is what says so.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/store";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { attachListeners, startRun } from "@/lib/orchestrator";
import type { Run, RunExitEvent } from "@/types";

vi.mock("@/lib/hooks", () => ({ emitHookEvent: async () => {} }));

let emitExit: ((e: RunExitEvent) => void) | undefined;

const project = {
  id: "p1",
  name: "P",
  workspaceDir: "C:/p",
  createdAt: 1,
  agents: [
    { id: "a0", name: "Planificador", provider: "claude", role: "planner", parentId: null, autoApprove: true },
    { id: "a1", name: "Uno", provider: "claude", role: "implementer", parentId: "a0", autoApprove: true },
    { id: "a2", name: "Dos", provider: "claude", role: "implementer", parentId: "a0", autoApprove: true },
    { id: "a3", name: "Tres", provider: "claude", role: "implementer", parentId: "a0", autoApprove: true },
  ],
};

/** A clean store with the team above, nothing running, and the ceiling this test wants. */
function reset(maxConcurrentRuns: number) {
  useAppStore.setState({
    runs: {},
    messages: [],
    questions: {},
    tasks: {},
    approvals: {},
    activeTaskRunId: {},
    runtime: {
      p1: Object.fromEntries(
        project.agents.map(a => [a.id, { agentId: a.id, status: "idle", queuedInstructions: [] }]),
      ),
    },
    binaries: { claude: { path: "claude", version: "1" } },
    config: { ...useAppStore.getState().config, maxConcurrentRuns, projects: [project] },
  } as never);
}

const runsOf = (status: Run["status"]) =>
  Object.values(useAppStore.getState().runs).filter(r => r.status === status);

/** A turn of `agentId` the user asked for: no parent, so it is a task of its own. */
const ask = (agentId: string) => startRun({ agentId, projectId: "p1", prompt: `trabajo para ${agentId}`, parentRunId: null, round: 0 });

/** Ends a run with what it wrote, the way a CLI exiting does. */
function end(runId: string, output: string) {
  useAppStore.setState(state => ({ runs: { ...state.runs, [runId]: { ...state.runs[runId], output } } }));
  emitExit!({ runId, code: 0, killed: false } as never);
}

const delegateTo = (name: string, task: string) =>
  '```delegate\n' + JSON.stringify([{ agent: name, task }]) + '\n```';

beforeEach(async () => {
  setTransport({
    ...nullTransport,
    spawnRun: async () => {},
    writeFileAbs: async () => {},
    onRunExit: async (h: (e: RunExitEvent) => void) => { emitExit = h; return () => {}; },
  } as never);
  await attachListeners();
});

describe("the ceiling on how many runs go at once", () => {
  it("starts as many as the ceiling allows and makes the next one wait", () => {
    reset(2);

    ask("a1");
    ask("a2");
    const third = ask("a3");

    expect(runsOf("running")).toHaveLength(2);
    expect(runsOf("queued").map(r => r.id)).toEqual([third]);
    // Waiting is not the same as being told to go away: the agent is still idle, nothing of its
    // own is in flight, and the run is written down with everything it needs to start.
    expect(useAppStore.getState().runtime.p1.a3.status).toBe("idle");
  });

  it("says why it is waiting, which is not the reason an agent's own queue gives", () => {
    reset(1);
    ask("a1");
    const second = ask("a2")!;

    const said = useAppStore.getState().messages.find(m => m.runId === second)!;
    // The number in the message is the ceiling, so it reads as a setting and not as a failure.
    expect(said.text).toContain("1");
  });

  it("lets the one that was waiting go the moment a slot frees, on its own", () => {
    reset(2);

    const first = ask("a1")!;
    ask("a2");
    const third = ask("a3")!;

    end(first, "listo");

    expect(useAppStore.getState().runs[third].status).toBe("running");
    expect(runsOf("queued")).toHaveLength(0);
  });

  it("hands the slots out oldest first", () => {
    reset(1);

    const first = ask("a1")!;
    const second = ask("a2")!;
    const third = ask("a3")!;

    end(first, "listo");
    expect(useAppStore.getState().runs[second].status).toBe("running");
    expect(useAppStore.getState().runs[third].status).toBe("queued");

    end(second, "listo");
    expect(useAppStore.getState().runs[third].status).toBe("running");
  });

  it("queues nothing at 0: that is the app as it was before the ceiling existed", () => {
    reset(0);

    ask("a1");
    ask("a2");
    ask("a3");

    expect(runsOf("running")).toHaveLength(3);
    expect(runsOf("queued")).toHaveLength(0);
  });

  it("releases the queue when the ceiling is raised, without waiting for a run to end", () => {
    reset(1);
    ask("a1");
    const second = ask("a2")!;
    expect(useAppStore.getState().runs[second].status).toBe("queued");

    useAppStore.getState().setMaxConcurrentRuns(4);

    expect(useAppStore.getState().runs[second].status).toBe("running");
  });

  // The deadlock this cap could have had. A planner waiting for its own delegations holds no slot:
  // delegations are started from the end of its turn, when its process is already gone, and it
  // comes back as a new run once the children are done. So even with one slot in the whole app the
  // chain moves — planner, child, planner again — instead of the planner sitting on the slot its
  // child needs.
  it("does not deadlock at 1: a planner, its child, and the planner again all get through", () => {
    reset(1);

    const planner = ask("a0")!;
    end(planner, `Voy a repartir esto.\n\n${delegateTo("Uno", "hacé la parte 1")}`);

    // The planner's turn is over, so its slot went to the child rather than being held.
    const child = Object.values(useAppStore.getState().runs).find(r => r.agentId === "a1")!;
    expect(child.status).toBe("running");
    expect(useAppStore.getState().runs[planner].status).toBe("done");
    expect(useAppStore.getState().runtime.p1.a0.status).toBe("waiting");

    end(child.id, "hecho");

    // And the continuation gets the slot back the moment the child is done.
    const back = Object.values(useAppStore.getState().runs)
      .find(r => r.agentId === "a0" && r.id !== planner)!;
    expect(back.status).toBe("running");
    expect(back.prompt).toContain("hecho");

    end(back.id, "quedó listo todo");

    // Nothing left waiting anywhere, and the task closed.
    expect(runsOf("queued")).toHaveLength(0);
    expect(runsOf("running")).toHaveLength(0);
    expect(useAppStore.getState().messages.some(m => m.kind === "result" && m.toAgentId === "user")).toBe(true);
  });
});
