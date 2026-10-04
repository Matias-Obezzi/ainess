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
import { attachListeners, childReport, retryRun, stopStalledRun } from "@/lib/orchestrator";
import { delegationError, outsideCode, parseDelegations, parseQuestions, plannerMayUse } from "@/lib/providers";
import { createTask } from "@/lib/tasks";
import { translateNow } from "@/i18n/useT";
import type { Run, RunExitEvent } from "@/types";

vi.mock("@/lib/hooks", () => ({ emitHookEvent: async () => {} }));

let emitExit: ((e: RunExitEvent) => void) | undefined;
/** What the project's verification command exits with. */
let checkCode = 0;

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
function setUp(runs: Run[], proj: object = project, cards: ReturnType<typeof createTask>[] = []) {
  const byId = Object.fromEntries(runs.map(r => [r.id, r]));
  useAppStore.setState({
    runs: byId,
    questions: {},
    messages: [],
    tasks: { p1: cards },
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
    config: { ...useAppStore.getState().config, maxRounds: 6, projects: [proj] },
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
    exec: async () => ({ code: checkCode, stdout: checkCode === 0 ? "ok" : "2 failing", stderr: "" }),
    // The first one is the orchestrator's. A delegated run started here opens an ACP client that listens
    // for exits too, and keeping only the latest handler routed every later exit to it instead — the
    // very bug the Tauri transport had (see `subscribe` in lib/tauri.ts and tauri-fanout.test.ts).
    onRunExit: async (h: (e: RunExitEvent) => void) => { emitExit ??= h; return () => {}; },
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

describe("work that was already checked", () => {
  // A project that says what "done" means, and has a reviewer besides.
  const checked = {
    ...project,
    verify: [{ id: "v1", label: "test", program: "npm", args: ["test"] }],
    agents: [...project.agents, { id: "rev", name: "Revisor", provider: "claude", role: "reviewer", parentId: "a0", autoApprove: true }],
  };
  const card = (runId: string) => createTask({ id: `t-${runId}`, projectId: "p1", title: "la parte", status: "working", runId });
  const reviewRuns = () => Object.values(useAppStore.getState().runs).filter(r => r.agentId === "rev");
  const settle = () => new Promise(r => setTimeout(r, 20));

  it("is not reviewed again once the project's commands passed, and the planner is told so", async () => {
    checkCode = 0;
    const ids = { parentRunId: "root-ok", rootRunId: "root-ok" };
    setUp([
      root({ id: "root-ok", rootRunId: "root-ok", childRunIds: ["k1"] }),
      run({ id: "k1", agentId: "a1", ...ids }),
    ], checked, [card("k1")]);

    end("k1", "Listo, cambié el botón.");
    await settle();

    expect(reviewRuns()).toHaveLength(0);
    expect(useAppStore.getState().tasks.p1[0].status).toBe("ready");
    const [next] = continuations().filter(r => r.rootRunId === "root-ok");
    expect(next.prompt).toContain(translateNow("prompt.results.verifiedByChecks"));
  });

  it("is still reviewed when the project has no commands of its own", async () => {
    const ids = { parentRunId: "root-rev", rootRunId: "root-rev" };
    setUp([
      root({ id: "root-rev", rootRunId: "root-rev", childRunIds: ["n1"] }),
      run({ id: "n1", agentId: "a1", ...ids }),
    ], { ...checked, verify: [] }, [card("n1")]);

    end("n1", "Listo.");
    await settle();
    expect(reviewRuns()).toHaveLength(1);
  });

  it("tells the planner a reviewer approved it", async () => {
    const ids = { parentRunId: "root-ap", rootRunId: "root-ap" };
    setUp([
      root({ id: "root-ap", rootRunId: "root-ap", childRunIds: ["m1", "m2"] }),
      run({ id: "m1", agentId: "a1", status: "done", output: "Listo.", ...ids }),
      run({ id: "m2", agentId: "rev", review: { ofRunId: "m1", taskId: "t-m1" }, ...ids }),
    ], { ...checked, verify: [] });

    end("m2", "Está bien.\n\nVEREDICTO: APROBADO");
    await settle();
    const [next] = continuations().filter(r => r.rootRunId === "root-ap");
    expect(next.prompt).toContain(translateNow("prompt.results.approvedByReview"));
  });

  it("goes back to the planner with what failed, when the commands did not pass", async () => {
    checkCode = 1;
    const ids = { parentRunId: "root-ko", rootRunId: "root-ko" };
    setUp([
      root({ id: "root-ko", rootRunId: "root-ko", childRunIds: ["f1"] }),
      run({ id: "f1", agentId: "a1", ...ids }),
    ], checked, [card("f1")]);

    end("f1", "Listo.");
    await settle();
    checkCode = 0;

    expect(reviewRuns()).toHaveLength(0);
    const [next] = continuations().filter(r => r.rootRunId === "root-ko");
    expect(next.prompt).toContain("2 failing");
    expect(next.prompt).not.toContain(translateNow("prompt.results.verifiedByChecks"));
  });
});

describe("a member's work retried", () => {
  it("reports to the planner that delegated it, and only what is new", async () => {
    const ids = { parentRunId: "root-re", rootRunId: "root-re" };
    setUp([
      root({ id: "root-re", rootRunId: "root-re", childRunIds: ["r1"] }),
      run({ id: "r1", agentId: "a1", ...ids }),
    ]);
    useAppStore.setState(state => ({ runs: { ...state.runs, r1: { ...state.runs.r1, output: "se cortó la red" } } }));
    emitExit!({ runId: "r1", code: 1, killed: false } as never);
    await new Promise(r => setTimeout(r, 10));
    const before = continuations().filter(r => r.rootRunId === "root-re");
    expect(before).toHaveLength(1);
    // The planner's continuation is over; the user retries the member's work by hand.
    end(before[0].id, "Espero el reintento.");

    retryRun("r1", { agentId: "a1" });
    const retried = Object.values(useAppStore.getState().runs).find(r => r.agentId === "a1" && r.id !== "r1");
    expect(retried?.parentRunId).toBe("root-re");
    end(retried!.id, "Ahora sí, listo.");
    await new Promise(r => setTimeout(r, 10));

    const after = continuations().filter(r => r.rootRunId === "root-re" && r.id !== before[0].id);
    expect(after).toHaveLength(1);
    expect(after[0].prompt).toContain("Ahora sí, listo.");
    expect(after[0].prompt).not.toContain("se cortó la red");
  });
});

describe("a member that went quiet", () => {
  it("is stopped as an error that says so, and the planner goes on", () => {
    const ids = { parentRunId: "root-st", rootRunId: "root-st" };
    setUp([
      root({ id: "root-st", rootRunId: "root-st", childRunIds: ["q1"] }),
      run({ id: "q1", agentId: "a1", ...ids }),
    ]);
    stopStalledRun("q1", 30);
    emitExit!({ runId: "q1", code: null, killed: true } as never);

    const stopped = useAppStore.getState().runs.q1;
    expect(stopped.status).toBe("error");
    expect(stopped.output).toContain("30");
    expect(continuations().filter(r => r.rootRunId === "root-st")).toHaveLength(1);
  });
});

describe("notes in a long answer", () => {
  it("reach the planner even when the cut takes the part they were in", () => {
    const ids = { parentRunId: "root-nt", rootRunId: "root-nt" };
    setUp([
      root({ id: "root-nt", rootRunId: "root-nt", childRunIds: ["t1"] }),
      run({ id: "t1", agentId: "a1", ...ids }),
    ]);
    end("t1", "```note\nla API de pagos devuelve 500 en staging\n```\n\n" + "x".repeat(20_000) + "\n\nListo.");
    const [next] = continuations().filter(r => r.rootRunId === "root-nt");
    expect(next.prompt).toContain("la API de pagos devuelve 500 en staging");
  });
});

describe("outsideCode", () => {
  it("does not run an example written inside a code block", () => {
    const text = "El formato es así:\n\n```md\n```delegate\n[{\"agent\":\"Uno\",\"task\":\"x\"}]\n```\n```\n\nNada más.";
    expect(parseDelegations(text)).toEqual([]);
    expect(delegationError(text)).toBeNull();
  });

  it("runs the real block next to an example", () => {
    const text = "````md\n```ask\n{\"question\":\"¿A o B?\",\"options\":[\"A\",\"B\"]}\n```\n````\n\n```delegate\n[{\"agent\":\"Uno\",\"task\":\"hacelo\"}]\n```";
    expect(parseQuestions(text)).toEqual([]);
    expect(parseDelegations(text)).toEqual([{ agent: "Uno", task: "hacelo" }]);
  });

  it("keeps every line where it was", () => {
    const text = "a\n```ts\nb\n```\nc";
    expect(outsideCode(text).split("\n")).toHaveLength(5);
    expect(outsideCode(text)).toBe("a\n\n\n\nc");
  });
});

describe("stopping a run whose process is already gone", () => {
  it("closes it, so the agent is free and the composer is not locked", async () => {
    const { stopAgent } = await import("@/lib/orchestrator");
    setUp([run({ id: "gone", agentId: "a0", parentRunId: null, rootRunId: "gone", round: 0, process: { pid: 1, image: "cmd.exe" } })]);
    useAppStore.setState(state => ({
      runtime: { p1: { ...state.runtime.p1, a0: { agentId: "a0", status: "working", queuedInstructions: [], currentRunId: "gone" } } },
    }) as never);

    // The null transport has no process to kill: `killRun` answers false, as Rust does for a run it
    // no longer holds.
    await stopAgent("a0", "p1");

    const state = useAppStore.getState();
    expect(state.runs.gone.status).toBe("killed");
    expect(state.runtime.p1.a0.status).not.toBe("working");
    expect(state.runtime.p1.a0.currentRunId).toBeUndefined();
  });
});
