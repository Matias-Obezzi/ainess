// What a planner hears from the agents it delegated to, and when.
//
// A child that asked something used to count as finished: its planner carried on with the question
// for a result, and carried on again when the answer's run ended. A block the planner could not
// parse went nowhere without a word. A child's whole turn went back to the planner however long it
// was, and the planner's tool list restricted nothing. Each of these is pinned here.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/store";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { attachListeners, childReport } from "@/lib/orchestrator";
import { delegationError, parseDelegations, plannerMayUse } from "@/lib/providers";
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
  ],
};

const run = (over: Partial<Run> & Pick<Run, "id" | "agentId">): Run => ({
  projectId: "p1", parentRunId: "root", rootRunId: "root", prompt: "hacé tu parte", status: "running",
  startedAt: 2, output: "", rawLines: [], childRunIds: [], round: 1, ...over,
});

const ask = 'Antes de seguir:\n\n```ask\n{"question":"¿Uso la B o la C?","options":["La B","La C"]}\n```';

/** A planner turn that delegated to both members, with whatever state each child is in. */
function setUp(runs: Run[]) {
  const byId = Object.fromEntries(runs.map(r => [r.id, r]));
  useAppStore.setState({
    runs: byId,
    questions: {},
    messages: [],
    tasks: {},
    approvals: {},
    activeTaskRunId: { p1: "root" },
    runtime: {
      p1: {
        a0: { agentId: "a0", status: "waiting", queuedInstructions: [], sessionId: "ses-a0" },
        a1: { agentId: "a1", status: "working", queuedInstructions: [], currentRunId: "c1", sessionId: "ses-a1" },
        a2: { agentId: "a2", status: "working", queuedInstructions: [], currentRunId: "c2", sessionId: "ses-a2" },
      },
    },
    binaries: { claude: { path: "claude", version: "1" } },
    config: { ...useAppStore.getState().config, maxRounds: 6, projects: [project] },
  } as never);
}

const root = (over: Partial<Run> = {}): Run =>
  run({ id: "root", agentId: "a0", parentRunId: null, prompt: "armá el plan", status: "done", startedAt: 1, childRunIds: ["c1", "c2"], round: 0, ...over });

/** Ends a run with the output it is given. */
function end(runId: string, output: string) {
  useAppStore.setState(state => ({ runs: { ...state.runs, [runId]: { ...state.runs[runId], output } } }));
  emitExit!({ runId, code: 0, killed: false } as never);
}

/** The planner's runs after the one that delegated: its continuations. */
const continuations = () =>
  Object.values(useAppStore.getState().runs).filter(r => r.agentId === "a0" && r.round > 0);

beforeEach(async () => {
  setTransport({
    ...nullTransport,
    spawnRun: async () => {},
    writeFileAbs: async () => {},
    onRunExit: async (h: (e: RunExitEvent) => void) => { emitExit = h; return () => {}; },
  } as never);
  await attachListeners();
});

describe("a child that asks", () => {
  it("is not a finished child: its planner waits for the answer's run, and is continued once", async () => {
    setUp([root(), run({ id: "c1", agentId: "a1" }), run({ id: "c2", agentId: "a2", status: "done", output: "listo" })]);

    end("c1", ask);
    expect(continuations()).toHaveLength(0);

    const [q] = Object.values(useAppStore.getState().questions);
    useAppStore.getState().answerQuestions([{ questionId: q.id, answer: ["La B"] }]);
    await new Promise(r => setTimeout(r, 0));
    const resumed = Object.values(useAppStore.getState().runs).find(r => r.agentId === "a1" && r.id !== "c1");
    expect(resumed?.parentRunId).toBe("root");

    end(resumed!.id, "Hecho con la B.");
    expect(continuations()).toHaveLength(1);
    expect(continuations()[0].prompt).toContain("Hecho con la B.");
  });

  it("does not close the task when it is the planner itself asking you", () => {
    setUp([root({ status: "running", childRunIds: [] })]);
    end("root", ask);

    const state = useAppStore.getState();
    expect(state.activeTaskRunId.p1).toBe("root");
    expect(state.messages.some(m => m.kind === "result")).toBe(false);
  });
});

describe("a planner continued", () => {
  it("gets the end of a long answer, not all of it", () => {
    const long = "x".repeat(50_000) + "\n\nResumen: todo listo.";
    // Ids of its own: a parent is continued once, and the test above already continued "root".
    const ids = { parentRunId: "root-long", rootRunId: "root-long" };
    setUp([
      root({ id: "root-long", rootRunId: "root-long", childRunIds: ["l1", "l2"] }),
      run({ id: "l1", agentId: "a1", ...ids }),
      run({ id: "l2", agentId: "a2", status: "done", output: "listo", ...ids }),
    ]);
    end("l1", long);

    const [next] = continuations();
    expect(next.prompt).toContain("Resumen: todo listo.");
    expect(next.prompt.length).toBeLessThan(10_000);
  });
});

describe("a delegate block the planner cannot have meant", () => {
  it("sends the planner back to write it again, with the reason", () => {
    setUp([root({ status: "running", childRunIds: [] })]);
    end("root", 'Va:\n\n```delegate\n[{"agent": "Uno", "task": "hacé algo",}]\n```');

    const [retry] = continuations();
    expect(retry).toBeDefined();
    expect(retry.prompt).toContain("delegate");
    expect(retry.round).toBe(1);
  });
});

describe("delegationError", () => {
  it("is null when there is no block, or when it delegated something", () => {
    expect(delegationError("nada que delegar")).toBeNull();
    expect(delegationError('```delegate\n[{"agent":"Uno","task":"a"}]\n```')).toBeNull();
  });

  it("says what was wrong", () => {
    expect(delegationError('```delegate\n[{"agent":"Uno",}]\n```')).toMatch(/JSON|token|Unexpected|Expected/i);
    expect(delegationError('```delegate\n[{"agente":"Uno","tarea":"a"}]\n```')).toBeTruthy();
    expect(delegationError('```delegate\n[{"agent":"Uno","task":"a"}]```Listo')).toBeTruthy();
  });

  it("is not needed for one task written without the list around it", () => {
    expect(parseDelegations('```delegate\n{"agent":"Uno","task":"a"}\n```')).toEqual([{ agent: "Uno", task: "a" }]);
  });
});

describe("plannerMayUse", () => {
  it("lets it run git, alone or chained", () => {
    expect(plannerMayUse({ kind: "execute", rawInput: { command: "git status" } })).toBe(true);
    expect(plannerMayUse({ kind: "execute", rawInput: { command: "git add -A && git commit -m x" } })).toBe(true);
    expect(plannerMayUse({ kind: "execute", rawInput: { command: "git log --oneline | head -5" } })).toBe(true);
  });

  it("does not let it read the repo through the shell, or do anything else there", () => {
    expect(plannerMayUse({ kind: "execute", rawInput: { command: "cat src/lib/orchestrator.ts" } })).toBe(false);
    expect(plannerMayUse({ kind: "execute", rawInput: { command: "git status && npm test" } })).toBe(false);
    expect(plannerMayUse({ kind: "execute", rawInput: {} })).toBe(false);
  });

  it("writes only its own plans", () => {
    expect(plannerMayUse({ kind: "edit", rawInput: { file_path: "C:\\p\\.ainess\\plan.md" } })).toBe(true);
    expect(plannerMayUse({ kind: "edit", rawInput: { file_path: "/p/.ainess/board.json" } })).toBe(true);
    expect(plannerMayUse({ kind: "edit", rawInput: { file_path: "/p/src/main.ts" } })).toBe(false);
  });

  it("keeps everything that does not change anything", () => {
    expect(plannerMayUse({ kind: "fetch", rawInput: { url: "https://example.com" } })).toBe(true);
    expect(plannerMayUse({ kind: "other", rawInput: {} })).toBe(true);
  });
});

describe("childReport", () => {
  it("passes a short answer through untouched", () => {
    expect(childReport("  hecho  ")).toEqual({ text: "hecho", cut: false });
  });

  it("keeps the end of a long one, where the summary is", () => {
    const { text, cut } = childReport("a".repeat(20_000) + "FIN");
    expect(cut).toBe(true);
    expect(text.endsWith("FIN")).toBe(true);
    expect(text.length).toBeLessThan(7_000);
  });
});
