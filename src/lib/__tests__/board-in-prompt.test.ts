// The board was write-only: the app filled it and no agent could see it. Asked to "look at the
// tasks and get to work", a planner answered that there were none and delegated the request
// itself, which opened one more card saying the same thing — four times over, in the report.
import { describe, it, expect, beforeEach } from "vitest";
import { boardSection, buildSystemPrompt, parseDelegations, shortTaskId } from "@/lib/providers";
import { taskForDelegation } from "@/lib/task-sync";
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
