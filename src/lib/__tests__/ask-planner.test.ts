// A question an implementer asks about the plan it was given goes to whoever wrote the plan.
//
// Until now every `ask` block ended at the user, whoever the agent was and whatever it was about.
// An implementer handed a plan with a hole in it could only follow it into the hole or stop the
// user, who did not write the plan — the one who did is its own planner, one run up.
//
// The half of this that matters is the falling back. A question routed to a planner that never
// answers leaves the child waiting on a round only an answer reopens, so every way the answer can
// fail to arrive — the run never started, it died, it came back empty, it came back asking
// something itself — puts the question back in front of the user.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/store";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { attachListeners, stopAgent } from "@/lib/orchestrator";
import { questionsForComposer } from "@/lib/pending-question";
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
    { id: "a1", name: "Implementador", provider: "claude", role: "implementer", parentId: "a0", autoApprove: true },
  ],
};

/** The planner's turn: over, but the task is not — it is waiting for the work it handed out. */
const parentRun: Run = {
  id: "root", projectId: "p1", agentId: "a0", parentRunId: null, rootRunId: "root",
  prompt: "armá el plan", status: "done", startedAt: 1, output: "", rawLines: [],
  childRunIds: ["child"], round: 0,
};

const ask = (extra: string) =>
  'Antes de seguir:\n\n```ask\n{"question":"El plan dice dos cosas distintas, ¿cuál vale?","options":["El paso 3","El paso 5"]' +
  extra + "}\n```";

/** The implementer's turn, about to end with whatever it wrote. */
const childRun = (output: string, over: Partial<Run> = {}): Run => ({
  id: "child", projectId: "p1", agentId: "a1", parentRunId: "root", rootRunId: "root",
  prompt: "seguí el plan", status: "running", startedAt: 2, output, rawLines: [],
  childRunIds: [], round: 1, ...over,
});

const questions = () => Object.values(useAppStore.getState().questions);
const answerRuns = () => Object.values(useAppStore.getState().runs).filter(r => r.kind === "answer");
const composerSees = () => {
  const s = useAppStore.getState();
  return questionsForComposer(s.questions, s.runs, { projectId: "p1", chatId: null, chatAgentIds: [] });
};

/** Sets the store up with the implementer's finished-looking turn, then ends it. */
function endChildTurn(output: string, over: Partial<Run> = {}, budget?: Record<string, unknown>, plannerBusy = false) {
  useAppStore.setState({
    runs: { root: plannerBusy ? { ...parentRun, status: "running" as const } : parentRun, child: childRun(output, over) },
    questions: {},
    messages: [],
    tasks: {},
    approvals: {},
    runtime: {
      p1: {
        a0: { agentId: "a0", status: "waiting", queuedInstructions: [], currentRunId: "root", sessionId: "ses-a0" },
        a1: { agentId: "a1", status: "working", queuedInstructions: [], currentRunId: "child", sessionId: "ses-a1" },
      },
    },
    binaries: { claude: { path: "claude", version: "1" } },
    config: {
      ...useAppStore.getState().config,
      projects: [budget ? { ...project, budget } : project],
    },
  } as never);
  emitExit!({ runId: "child", code: 0, killed: false } as never);
}

/** Ends the run the planner is answering in, with what it wrote. */
function endAnswerRun(output: string, code = 0) {
  const run = answerRuns()[0];
  useAppStore.setState(state => ({ runs: { ...state.runs, [run.id]: { ...state.runs[run.id], output } } }));
  emitExit!({ runId: run.id, code, killed: false } as never);
}

beforeEach(async () => {
  setTransport({
    ...nullTransport,
    spawnRun: async () => {},
    writeFileAbs: async () => {},
    onRunExit: async (h: (e: RunExitEvent) => void) => { emitExit = h; return () => {}; },
  } as never);
  await attachListeners();
});

describe("a child that asks its planner", () => {
  it("does not put the question in front of the user, and starts a run on the planner", () => {
    endChildTurn(ask(',"to":"planner"'));

    const [q] = questions();
    expect(q.toAgentId).toBe("a0");
    expect(q.status).toBe("pending");
    expect(composerSees()).toBeNull();

    const [answer] = answerRuns();
    expect(answer.agentId).toBe("a0");
    expect(answer.answersQuestionId).toBe(q.id);
    // The planner's own question is in the prompt, with the options it offered.
    expect(answer.prompt).toContain("El plan dice dos cosas distintas");
    expect(answer.prompt).toContain("El paso 5");
  });

  it("resumes the child with the answer once that run ends well", () => {
    endChildTurn(ask(',"to":"planner"'));
    endAnswerRun("Vale el paso 5; el 3 quedó de una versión anterior del plan.");

    const [q] = questions();
    expect(q.status).toBe("answered");
    expect(q.answer?.[0]).toContain("el paso 5");
    // The child is running again, in the round it was already in.
    const resumed = Object.values(useAppStore.getState().runs)
      .find(r => r.agentId === "a1" && r.id !== "child");
    expect(resumed?.round).toBe(1);
    // Nothing of a real turn: the planner's answer is not a result for the user.
    expect(useAppStore.getState().messages.some(m => m.kind === "result" && m.toAgentId === "user")).toBe(false);
  });

  it("asks the user instead when the planner's run dies", () => {
    endChildTurn(ask(',"to":"planner"'));
    endAnswerRun("", 1);

    const [q] = questions();
    expect(q.toAgentId).toBeUndefined();
    expect(q.status).toBe("pending");
    expect(composerSees()?.group[0].id).toBe(q.id);
  });

  it("asks the user instead when the planner answers with nothing", () => {
    endChildTurn(ask(',"to":"planner"'));
    endAnswerRun("   ");

    expect(questions()[0].toAgentId).toBeUndefined();
    expect(composerSees()).not.toBeNull();
  });

  it("asks the user instead when the planner's run never started", () => {
    // Out of budget, which is one of the ways `startRun` comes back with nothing.
    endChildTurn(ask(',"to":"planner"'), { usage: { costUsd: 5 }, startedAt: Date.now() }, { dailyUsd: 1, onReached: "block" });

    expect(answerRuns()).toHaveLength(0);
    expect(questions()[0].toAgentId).toBeUndefined();
    expect(composerSees()).not.toBeNull();
  });

  it("does not let the planner pass the question on: an `ask` in its answer goes to the user", () => {
    endChildTurn(ask(',"to":"planner"'));
    endAnswerRun('Yo tampoco lo sé.\n\n```ask\n{"question":"¿Cuál de los dos pasos vale?","options":["El 3","El 5"],"to":"planner"}\n```');

    const open = questions().filter(q => q.status === "pending");
    // One question, the child's, and it is the user's now — no second hop, no chain.
    expect(open).toHaveLength(1);
    expect(open[0].toAgentId).toBeUndefined();
    expect(composerSees()?.group[0].id).toBe(open[0].id);
  });

  it("asks the user instead when the planner is stopped with the answer still queued", async () => {
    // The planner was in a turn of its own, so the answer run is `queued` behind it. Stopping the
    // planner drops that run without it ever ending, which is another way nobody writes the answer.
    endChildTurn(ask(',"to":"planner"'), {}, undefined, true);
    expect(answerRuns()[0].status).toBe("queued");

    await stopAgent("a0", "p1");

    expect(questions()[0].toAgentId).toBeUndefined();
    expect(composerSees()).not.toBeNull();
  });

  it("goes to the user when the block did not ask for the planner", () => {
    endChildTurn(ask(""));

    expect(questions()[0].toAgentId).toBeUndefined();
    expect(answerRuns()).toHaveLength(0);
    expect(composerSees()).not.toBeNull();
  });

  it("goes to the user when the agent has no planner behind this run", () => {
    // Same block, same agent, but a turn the user started: there is no parent to ask.
    useAppStore.setState({ runs: {} } as never);
    endChildTurn(ask(',"to":"planner"'), { parentRunId: null, rootRunId: "child" });

    expect(questions()[0].toAgentId).toBeUndefined();
    expect(answerRuns()).toHaveLength(0);
    expect(composerSees()).not.toBeNull();
  });
});
