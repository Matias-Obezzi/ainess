// The board was write-only: the app filled it and no agent could see it. Asked to "look at the
// tasks and get to work", a planner answered that there were none and delegated the request
// itself, which opened one more card saying the same thing — four times over, in the report.
import { describe, it, expect, beforeEach } from "vitest";
import { boardSection, buildSystemPrompt, parseDelegations, shortTaskId } from "@/lib/providers";
import { taskForDelegation, taskForPrompt } from "@/lib/task-sync";
import { createTask } from "@/lib/tasks";
import { useAppStore } from "@/store";
import type { AgentConfig, Run, Task } from "@/types";

const project = "p1";

const planner: AgentConfig = { id: "p", name: "Orquestador", provider: "claude", role: "planner", parentId: null, autoApprove: false };
const worker: AgentConfig = { id: "w", name: "Obrero", provider: "antigravity", role: "implementer", parentId: "p", autoApprove: true };

const task = (over: Partial<Task>): Task => createTask({ projectId: project, ...over });

const rootRun: Run = {
  id: "run-root", projectId: project, agentId: "p", parentRunId: null, rootRunId: "run-root",
  prompt: "Revisá las tareas y ponete a trabajar", status: "running", startedAt: 1, output: "",
  rawLines: [], childRunIds: [], round: 0,
};

function seed(tasks: Task[]) {
  useAppStore.setState(state => ({
    tasks: { ...state.tasks, [project]: tasks },
    runs: { [rootRun.id]: rootRun },
    config: { ...state.config, projects: [{ id: project, name: "P", workspaceDir: "C:\\p", createdAt: 1, agents: [planner, worker] }] },
  }));
}

beforeEach(() => {
  useAppStore.setState({ tasks: {}, runs: {} });
});

describe("the board in the system prompt", () => {
  it("lists what is open, with the id the planner has to quote back", () => {
    const open = task({ title: "Revisamos y agregamos contenido", status: "backlog" });
    const text = boardSection([open], () => undefined);
    expect(text).toContain("Revisamos y agregamos contenido");
    expect(text).toContain(shortTaskId(open.id));
  });

  it("leaves out what is finished or archived", () => {
    const text = boardSection(
      [
        task({ title: "Abierta", status: "needs-you" }),
        task({ title: "Terminada", status: "done" }),
        task({ title: "Archivada", status: "backlog", archived: true }),
      ],
      () => undefined,
    );
    expect(text).toContain("Abierta");
    expect(text).not.toContain("Terminada");
    expect(text).not.toContain("Archivada");
  });

  it("says the board is empty rather than saying nothing", () => {
    const text = boardSection([], () => undefined);
    expect(text.split("\n")).toHaveLength(2);
  });

  // A team can be built with everybody at the root: then the planner has nobody under it, and it
  // used to answer as if it were alone in the project.
  it("names the agents that exist but do not report to the planner", () => {
    const loose: AgentConfig = { ...worker, id: "loose", name: "Suelto", parentId: null };
    const prompt = buildSystemPrompt(planner, [], { skills: [], sharedContext: "", others: [planner, loose] });
    expect(prompt).toContain("Suelto");
    // Not itself: a planner is not one of its own missing children.
    expect(prompt.split("Suelto")[0]).not.toContain(planner.name);
  });

  it("says where the whole team is written down", () => {
    const prompt = buildSystemPrompt(planner, [worker], { skills: [], sharedContext: "" });
    expect(prompt).toContain(".ainess/AGENTS.md");
  });

  it("reaches the planner's prompt, and only when there is a team to delegate to", () => {
    const open = task({ title: "Modificaciones", status: "backlog" });
    const withTeam = buildSystemPrompt(planner, [worker], { skills: [], sharedContext: "", tasks: [open] });
    expect(withTeam).toContain("Modificaciones");
    // An implementer works on what it was handed; the board is the planner's to read.
    const child = buildSystemPrompt(worker, [], { skills: [], sharedContext: "", tasks: [open] });
    expect(child).not.toContain("Modificaciones");
  });
});

describe("a delegation that names a card", () => {
  it("moves that card instead of opening another", () => {
    const open = task({ title: "Revisamos y agregamos contenido", status: "backlog" });
    seed([open]);

    taskForDelegation({
      projectId: project, agentId: worker.id, task: "Revisá el contenido y agregá lo que falte",
      rootRunId: rootRun.id, runId: "run-child", taskId: shortTaskId(open.id),
    });

    const tasks = useAppStore.getState().tasks[project];
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ id: open.id, status: "working", agentId: worker.id, runId: "run-child" });
  });

  it("waits for the user on the same card when the delegation needs approval", () => {
    const open = task({ title: "Modificaciones", status: "backlog" });
    seed([open]);

    taskForDelegation({
      projectId: project, agentId: worker.id, task: "Hacé las modificaciones",
      rootRunId: rootRun.id, approvalId: "ap-1", taskId: shortTaskId(open.id),
    });

    const tasks = useAppStore.getState().tasks[project];
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ status: "needs-you", approvalId: "ap-1" });
  });

  it("opens a card when the delegation is work of its own", () => {
    seed([task({ title: "Revisamos y agregamos contenido", status: "backlog", runId: rootRun.id })]);

    taskForDelegation({
      projectId: project, agentId: worker.id, task: "Escribí los tests que faltan",
      rootRunId: rootRun.id, runId: "run-child",
    });

    const tasks = useAppStore.getState().tasks[project];
    expect(tasks).toHaveLength(2);
    expect(tasks.map(t => t.title)).toContain("Escribí los tests que faltan");
  });

  // What the report looked like: the planner handed the user's own sentence down, unchanged.
  it("does not twin the root card when the planner passes the request straight through", () => {
    const root = task({ title: "Revisá las tareas y ponete a trabajar", detail: rootRun.prompt, status: "working", runId: rootRun.id });
    seed([root]);

    taskForDelegation({
      projectId: project, agentId: worker.id, task: rootRun.prompt,
      rootRunId: rootRun.id, runId: "run-child",
    });

    const tasks = useAppStore.getState().tasks[project];
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ id: root.id, agentId: worker.id, runId: "run-child" });
  });

  it("reads the id out of the delegate block", () => {
    const [delegation] = parseDelegations(
      '```delegate\n{"tasks":[{"agent":"Obrero","task":"seguir con esto","taskId":"a1b2c3d4"}]}\n```',
    );
    expect(delegation).toMatchObject({ agent: "Obrero", task: "seguir con esto", taskId: "a1b2c3d4" });
  });
});

// Of ~22 cards on the real board, four were work: the rest were "como viene?", "continua",
// "mandale nomas" — one card per message — and four delegations all titled with the same preamble
// line. Neither is fixed by reading the words: a message is the same work because the work is
// still running, and only the planner knows what it just handed down.
describe("a message sent while the request is still running", () => {
  it("moves the card that is already open instead of adding one", () => {
    const open = task({ title: "Revisá las tareas y ponete a trabajar", detail: rootRun.prompt, status: "working", runId: rootRun.id });
    seed([open]);

    taskForPrompt({ projectId: project, agentId: planner.id, runId: "run-2", prompt: "continua", liveRootRunId: rootRun.id });

    const tasks = useAppStore.getState().tasks[project];
    expect(tasks).toHaveLength(1);
    expect(tasks[0]).toMatchObject({ id: open.id, status: "working", runId: "run-2" });
    // The message is not thrown away: "continua, pero primero arreglá X" has to stay readable.
    expect(tasks[0].detail).toBe(`${rootRun.prompt}\n\ncontinua`);
  });

  it("opens a card when nothing of the project is in flight", () => {
    seed([task({ title: "Algo viejo", status: "ready", runId: rootRun.id })]);

    taskForPrompt({ projectId: project, agentId: planner.id, runId: "run-2", prompt: "arreglá el parser", liveRootRunId: null });

    const tasks = useAppStore.getState().tasks[project];
    expect(tasks).toHaveLength(2);
    expect(tasks.map(t => t.title)).toContain("arreglá el parser");
  });
});

describe("a delegation that says what it is", () => {
  it("reads the title out of the delegate block, and tolerates it missing", () => {
    const [titled] = parseDelegations(
      '```delegate\n{"tasks":[{"agent":"Obrero","task":"Proyecto: el de siempre. Migrar el parser.","title":"Migrar el parser de diffs"}]}\n```',
    );
    expect(titled.title).toBe("Migrar el parser de diffs");
    const [untitled] = parseDelegations('```delegate\n{"tasks":[{"agent":"Obrero","task":"hacelo"}]}\n```');
    expect(untitled.title).toBeUndefined();
  });

  it("names the card with the planner's title", () => {
    seed([]);

    taskForDelegation({
      projectId: project, agentId: worker.id, task: "Proyecto: C:\\p (Tauri 2 + React…)\n\nMigrar el parser.",
      rootRunId: rootRun.id, runId: "run-child", title: "Migrar el parser de diffs",
    });

    expect(useAppStore.getState().tasks[project][0].title).toBe("Migrar el parser de diffs");
  });

  it("falls back to the first line when the planner did not say", () => {
    seed([]);

    taskForDelegation({
      projectId: project, agentId: worker.id, task: "Proyecto: C:\\p (Tauri 2 + React…)\n\nMigrar el parser.",
      rootRunId: rootRun.id, runId: "run-child",
    });

    expect(useAppStore.getState().tasks[project][0].title).toBe("Proyecto: C:\\p (Tauri 2 + React…)");
  });
});
