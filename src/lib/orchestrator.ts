import { useAppStore, selectChildren, selectAgent, selectProjectAgents, selectSkillsFor, selectMcpFor } from "@/store";
import { getTransport } from "@/lib/transport";
import type { Approval } from "@/types";
import { PROVIDERS, buildSystemPrompt, parseDelegations, parseQuestions, finalOutputFromLines } from "@/lib/providers";
import { recordAntigravityOutcome } from "@/lib/quota";
import { summarizeTool } from "@/lib/tool-summary";
import { trimMessagesInMemory, trimRunsInMemory, TRIM_MESSAGES_AT } from "@/lib/history";
import { ensureWorktree } from "@/lib/worktree";
import { truncate } from "@/lib/format";
import { translateNow } from "@/i18n/useT";
import * as taskSync from "@/lib/task-sync";
import { Run, AgentConfig, AgentQuestion, AgentStatus, CommMessage, Project, RunStatus, RunOutputEvent, RunExitEvent } from "@/types";

let listenersAttached = false;

export async function attachListeners(): Promise<void> {
  if (listenersAttached) return;
  listenersAttached = true;
  await getTransport().onRunOutput(handleOutput);
  await getTransport().onRunExit(handleExit);
}

export function addMessage(msg: Omit<CommMessage, "id" | "ts">) {
  useAppStore.setState(state => {
    const messages = [...state.messages, { ...msg, id: crypto.randomUUID(), ts: Date.now() }];
    return { messages: messages.length > TRIM_MESSAGES_AT ? trimMessagesInMemory(messages) : messages };
  });
}

/** The message an error carries, without the `Error:` prefix `String(err)` would add. */
function errorText(err: unknown): string {
  return err instanceof Error ? err.message : String(err);
}

/** What the agent is setting up before its run can start, so the UI can narrate it. */
function setPreparing(projectId: string, agentId: string, step: string | undefined): void {
  useAppStore.setState(state => {
    const projectRuntime = state.runtime[projectId] ?? {};
    const rt = projectRuntime[agentId] ?? { agentId, status: "idle" as AgentStatus, queuedInstructions: [] };
    if (rt.preparing === step) return state;
    return { runtime: { ...state.runtime, [projectId]: { ...projectRuntime, [agentId]: { ...rt, preparing: step } } } };
  });
}

/**
 * Where an agent runs: its own git worktree when it works on its own branch, the project's
 * workspace otherwise. Preparing a worktree can take minutes (a checkout plus `npm install`),
 * so every step is told to the runtime and to the feed.
 */
async function resolveCwd(projectId: string, agent: AgentConfig, project: Project, runId: string): Promise<string> {
  if (!agent.worktree) return project.workspaceDir;
  try {
    const known = useAppStore.getState().worktrees[projectId]?.find(w => w.agentId === agent.id);
    setPreparing(projectId, agent.id, "Preparando el worktree…");
    const worktree = await ensureWorktree(project, agent, step => {
      setPreparing(projectId, agent.id, step);
      addMessage({ projectId, fromAgentId: "system", toAgentId: agent.id, kind: "system", text: `${agent.name}: ${step}`, runId });
    }, known);
    useAppStore.getState().setWorktree(projectId, worktree);
    return worktree.path;
  } finally {
    setPreparing(projectId, agent.id, undefined);
  }
}

/** Closes a run that never reached a process: killed, agent idle, and the feed says why. */
function finishNeverSpawned(runId: string, projectId: string, agentId: string, reason: string): void {
  useAppStore.setState(state => {
    const pRuntime = state.runtime[projectId] || {};
    return {
      runs: { ...state.runs, [runId]: { ...state.runs[runId], status: "killed", output: reason, endedAt: Date.now() } },
      runtime: {
        ...state.runtime,
        [projectId]: { ...pRuntime, [agentId]: { ...pRuntime[agentId], status: "idle", currentRunId: undefined, currentTask: undefined } },
      },
    };
  });
  addMessage({ projectId, fromAgentId: "system", toAgentId: agentId, kind: "system", text: reason, runId });
  onRunFinished(runId);
}

function appendCommText(agentId: string, runId: string, projectId: string, delta: string) {
  useAppStore.setState(state => {
    const msgId = `text-${runId}`;
    const idx = state.messages.findIndex(m => m.id === msgId);
    if (idx >= 0) {
      const newMsgs = [...state.messages];
      newMsgs[idx] = { ...newMsgs[idx], text: newMsgs[idx].text + delta };
      return { messages: newMsgs };
    } else {
      return {
        messages: [
          ...state.messages,
          { id: msgId, ts: Date.now(), runId, projectId, fromAgentId: agentId, kind: "text", text: delta }
        ]
      };
    }
  });
}

export function startRun(opts: { agentId: string; projectId: string; prompt: string; parentRunId: string | null; round: number; resume?: boolean; rootRunId?: string; model?: string; kind?: "task" | "chat"; systemPromptOverride?: string }): string | undefined {
  const store = useAppStore.getState();
  const agent = selectAgent(store, opts.agentId);
  const project = store.config.projects.find(p => p.id === opts.projectId);
  if (!agent || !project) return undefined;

  const runId = crypto.randomUUID();
  const run: Run = {
    id: runId,
    projectId: opts.projectId,
    agentId: opts.agentId,
    parentRunId: opts.parentRunId,
    rootRunId: opts.rootRunId ?? runId,
    prompt: opts.prompt,
    status: "running",
    startedAt: Date.now(),
    output: "",
    rawLines: [],
    childRunIds: [],
    round: opts.round,
    model: opts.model,
    kind: opts.kind,
  };

  useAppStore.setState(state => {
    const parentRun = opts.parentRunId ? state.runs[opts.parentRunId] : undefined;
    const projectRuntime = state.runtime[opts.projectId] || {};
    return {
      runs: {
        ...state.runs,
        [runId]: run,
        ...(parentRun && opts.parentRunId ? { [opts.parentRunId]: { ...parentRun, childRunIds: [...parentRun.childRunIds, runId] } } : {})
      },
      runtime: {
        ...state.runtime,
        [opts.projectId]: {
          ...projectRuntime,
          [opts.agentId]: {
            ...(projectRuntime[opts.agentId] ?? { agentId: opts.agentId, queuedInstructions: [] }),
            status: "working",
            currentRunId: runId,
            currentTask: opts.prompt
          }
        }
      }
    };
  });

  const provider = PROVIDERS[agent.provider];
  // Custom agents bring their own program; every other provider needs a detected binary.
  const binary = agent.provider === "custom"
    ? (agent.customCommand?.program ? { path: agent.customCommand.program } : null)
    : store.binaries[agent.provider];

  if (!binary || !binary.path) {
    const err = `No se encontró el CLI de ${provider.label}. Instalalo o configurá un comando custom.`;
    useAppStore.setState(state => {
      const pRuntime = state.runtime[opts.projectId] || {};
      return {
        runs: { ...state.runs, [runId]: { ...state.runs[runId], status: "error", output: err, endedAt: Date.now() } },
        runtime: { 
          ...state.runtime, 
          [opts.projectId]: { 
            ...pRuntime, 
            [opts.agentId]: { ...pRuntime[opts.agentId], status: "error", lastError: err, currentRunId: undefined } 
          } 
        }
      };
    });
    addMessage({ projectId: opts.projectId, fromAgentId: "system", toAgentId: opts.agentId, kind: "error", text: err, runId });
    setTimeout(() => onRunFinished(runId), 0);
    return runId;
  }

  const children = selectChildren(store, opts.projectId, agent.id);
  const skills = selectSkillsFor(store, agent.id);
  const sharedContext = store.config.sharedContext;
  const systemPrompt = opts.systemPromptOverride ?? buildSystemPrompt(agent, children, { 
    skills, 
    sharedContext, 
    profile: store.config.profile, 
    autoModel: store.config.autoModel 
  });
  const sessionId = opts.resume ? store.runtime[opts.projectId]?.[opts.agentId]?.sessionId : undefined;

  const mcpServers = selectMcpFor(store, agent.id);

  const doSpawn = async () => {
    let mcpConfigPath: string | undefined;
    if (agent.provider === "claude" && mcpServers.length > 0) {
      const obj: any = { mcpServers: {} };
      for (const s of mcpServers) {
        if (s.transport === "http") {
          obj.mcpServers[s.name] = { type: "http", url: s.url };
        } else {
          obj.mcpServers[s.name] = { command: s.command, args: s.args || [], env: s.env || {} };
        }
      }
      mcpConfigPath = await getTransport().writeTextFile(`mcp/${agent.id}.json`, JSON.stringify(obj, null, 2));
    }

    const effectiveAgent = opts.model ? { ...agent, model: opts.model } : agent;

    // An agent with its own worktree runs there; a worktree that cannot be prepared stops the
    // run before it starts (the rejection lands in the catch below).
    const cwd = await resolveCwd(opts.projectId, agent, project, runId);

    // The user pressed stop while the worktree was being prepared. The install itself cannot be
    // taken back, but the agent is not launched on top of it.
    if (stoppedBeforeSpawn.delete(runId)) {
      finishNeverSpawned(runId, opts.projectId, opts.agentId, translateNow("run.stoppedWhilePreparing"));
      return;
    }

    const spawnOpts = provider.buildCommand({
      agent: effectiveAgent,
      prompt: opts.prompt,
      systemPrompt,
      sessionId,
      cwd,
      binaryPath: binary.path,
      mcpConfigPath
    });

    await getTransport().spawnRun({ runId, ...spawnOpts });
  };

  doSpawn().catch(err => {
    const message = errorText(err);
    useAppStore.setState(state => {
      const pRuntime = state.runtime[opts.projectId] || {};
      return {
        runs: { ...state.runs, [runId]: { ...state.runs[runId], status: "error", output: message, endedAt: Date.now() } },
        runtime: { 
          ...state.runtime, 
          [opts.projectId]: { 
            ...pRuntime, 
            [opts.agentId]: { ...pRuntime[opts.agentId], status: "error", lastError: message, currentRunId: undefined } 
          } 
        }
      };
    });
    addMessage({ projectId: opts.projectId, fromAgentId: "system", toAgentId: opts.agentId, kind: "error", text: message, runId });
    onRunFinished(runId);
  });

  return runId;
}

function handleOutput(e: RunOutputEvent) {
  const store = useAppStore.getState();
  const run = store.runs[e.runId];
  if (!run) return;
  const agent = selectAgent(store, run.agentId);
  if (!agent) return;

  const provider = PROVIDERS[agent.provider];
  const events = provider.parseLine(e.line, e.stream);

  useAppStore.setState(state => {
    const r = state.runs[e.runId];
    if (!r) return state;
    return {
      runs: {
        ...state.runs,
        [e.runId]: {
          ...r,
          rawLines: [...r.rawLines, e.line].slice(-2000)
        }
      }
    };
  });

  for (const ev of events) {
    if (ev.type === "session") {
      useAppStore.setState(state => {
        const pRuntime = state.runtime[run.projectId] || {};
        return {
          runtime: { ...state.runtime, [run.projectId]: { ...pRuntime, [run.agentId]: { ...pRuntime[run.agentId], sessionId: ev.sessionId, sessionUpdatedAt: Date.now() } } }
        };
      });
    } else if (ev.type === "text") {
      appendCommText(run.agentId, e.runId, run.projectId, ev.text);
    } else if (ev.type === "tool") {
      const text = ev.detail ? `${ev.name}: ${ev.detail}` : ev.name;
      const workspaceDir = store.config.projects.find(p => p.id === run.projectId)?.workspaceDir;
      const summary = summarizeTool(ev.name, ev.input, { workspaceDir });
      addMessage({
        projectId: run.projectId,
        fromAgentId: run.agentId,
        kind: "tool",
        text: text.substring(0, 300),
        runId: e.runId,
        meta: { tool: ev.name, summary, input: ev.input },
      });
    } else if (ev.type === "result") {
      useAppStore.setState(state => {
        const r = state.runs[e.runId];
        if (!r) return state;
        const pRuntime = state.runtime[run.projectId] || {};
        return {
          // Copilot's result carries usage but no text: keep whatever answer we already had.
          runs: { ...state.runs, [e.runId]: { ...r, output: ev.text || r.output, ...(ev.usage ? { usage: ev.usage } : {}) } },
          ...(ev.sessionId ? { runtime: { ...state.runtime, [run.projectId]: { ...pRuntime, [run.agentId]: { ...pRuntime[run.agentId], sessionId: ev.sessionId, sessionUpdatedAt: Date.now() } } } } : {})
        };
      });
    } else if (ev.type === "error") {
      addMessage({ projectId: run.projectId, fromAgentId: run.agentId, kind: "error", text: ev.text, runId: e.runId });
    }
  }
}

function handleExit(e: RunExitEvent) {
  const store = useAppStore.getState();
  const run = store.runs[e.runId];
  if (!run) return;

  const agentForRun = selectAgent(store, run.agentId);
  const spec = agentForRun ? PROVIDERS[agentForRun.provider] : undefined;
  const collected = run.output || (spec?.finalOutput ? spec.finalOutput(run.rawLines) : finalOutputFromLines(run.rawLines));
  // Providers that only report what each step spent (opencode) are added up here, once.
  const finalUsage = spec?.finalUsage ? spec.finalUsage(run.rawLines) : undefined;
  const isError = e.code !== 0 && !e.killed && !collected;
  const status: RunStatus = e.killed ? "killed" : isError ? "error" : "done";
  const output = e.killed ? "[detenido por el usuario]" : collected;

  useAppStore.setState(state => ({
    // The run is closed and then the project's runs are brought back to the size the file keeps:
    // without this every run of the session stayed in memory with its whole raw buffer.
    runs: trimRunsInMemory(
      {
        ...state.runs,
        [e.runId]: {
          ...state.runs[e.runId],
          status,
          output,
          endedAt: Date.now(),
          exitCode: e.code,
          ...(finalUsage ? { usage: finalUsage } : {})
        }
      },
      run.projectId,
    ),
  }));

  taskSync.taskOnRunFinished({ ...run, status, output, endedAt: Date.now(), exitCode: e.code });

  if (agentForRun?.provider === "antigravity" && !e.killed) {
    const text = `${output}\n${run.rawLines.slice(-20).join("\n")}`;
    void recordAntigravityOutcome(run.model ?? agentForRun.model, text, status === "done");
  }

  onRunFinished(e.runId);
}

/**
 * One line for the bell when a user task ends: "Claude terminó en uiness". Runs the user stopped
 * on purpose say nothing: they already know.
 */
function notifyTaskOutcome(run: Run, failed: boolean) {
  const store = useAppStore.getState();
  const agent = selectAgent(store, run.agentId);
  const project = store.config.projects.find(p => p.id === run.projectId);
  const name = agent?.name ?? translateNow("notify.anAgent");
  const body = truncate(run.output ?? "", 140);
  const key = failed
    ? (project ? "notify.agentFailedIn" : "notify.agentFailed")
    : (project ? "notify.agentDoneIn" : "notify.agentDone");
  store.notify({
    kind: failed ? "task-failed" : "task-done",
    title: translateNow(key, { name, project: project?.name ?? "" }),
    body: body || undefined,
    projectId: run.projectId,
    agentId: run.agentId,
    runId: run.id,
  });
}

function onRunFinished(runId: string) {
  const store = useAppStore.getState();
  const run = store.runs[runId];
  if (!run) return;
  const agent = selectAgent(store, run.agentId);
  if (!agent) return;

  // Chat runs bypass normal delegation logic
  if (run.kind === "chat") {
    useAppStore.setState(state => {
      const pRuntime = state.runtime[run.projectId] || {};
      return {
        runtime: {
          ...state.runtime,
          [run.projectId]: {
            ...pRuntime,
            [agent.id]: {
              ...pRuntime[agent.id],
              status: "idle",
              currentRunId: undefined,
              currentTask: undefined
            }
          }
        }
      };
    });
    // Notify chat module
    import("@/lib/chat").then(m => m.onChatRunFinished(runId)).catch(() => {});
    return;
  }

  let agentStatus: AgentStatus = run.status === "killed" ? "stopped" : run.status === "error" ? "error" : "idle";
  let waitingForChildren = false;

  const project = store.config.projects.find(p => p.id === run.projectId);
  const rootRun = store.runs[run.rootRunId];
  const taskPrompt = rootRun ? rootRun.prompt : run.prompt;
  const ctx = { project, agent, runId, round: run.round, prompt: run.prompt, output: run.output, taskPrompt, error: run.status === "error" ? run.output : "" };
  
  if (run.status === "done") void emitHookEvent("run.finished", {}, ctx);
  else if (run.status === "error") void emitHookEvent("run.failed", {}, ctx);
  else if (run.status === "killed") void emitHookEvent("agent.stopped", {}, ctx);

  // An agent that asked something is not finished, it is waiting: the round stops here and picks
  // up when the question is answered (see `resumeWithAnswer`).
  const asked = run.status === "done" ? askQuestions(run, agent) : false;
  if (asked) {
    agentStatus = "waiting";
  }

  if (!asked && (run.status === "done" || run.status === "killed")) {
    const children = selectChildren(store, run.projectId, agent.id);
    if (children.length > 0) {
      const delegations = parseDelegations(run.output);
      if (delegations.length > 0) {
        waitingForChildren = true;
        agentStatus = "waiting";

        for (const task of delegations) {
          const childAgent = children.find(c => c.name.toLowerCase() === task.agent.toLowerCase() || c.id === task.agent);
          if (childAgent) {
            let modelToUse: string | undefined = undefined;
            if (task.model && store.config.autoModel) {
              const providerSpec = PROVIDERS[childAgent.provider];
              const allowed = new Set(providerSpec?.defaultModels || []);
              if (childAgent.model) allowed.add(childAgent.model);
              if (allowed.has(task.model)) {
                modelToUse = task.model;
              } else {
                addMessage({ projectId: run.projectId, fromAgentId: "system", toAgentId: agent.id, kind: "system", text: `Modelo "${task.model}" no está disponible para ${childAgent.name}, se ignorará.`, runId });
              }
            }
            const textForMessage = modelToUse ? `[${modelToUse}] ${task.task}` : task.task;
            addMessage({ projectId: run.projectId, fromAgentId: agent.id, toAgentId: childAgent.id, kind: "delegation", text: textForMessage, runId });
            void emitHookEvent("delegation", {}, { ...ctx, toAgent: childAgent.name, task: task.task, model: modelToUse || "" });
            const payload = { agentId: childAgent.id, projectId: run.projectId, prompt: task.task, parentRunId: runId, round: run.round, rootRunId: run.rootRunId, model: modelToUse };
            if (store.config.approveDelegations || childAgent.requireApproval) {
              // Gate: the child only runs once the user approves (app, CLI or phone).
              const approval = requestApproval({ kind: "delegation", agentId: agent.id, toAgentId: childAgent.id, summary: `${agent.name} → ${childAgent.name}: ${task.task.slice(0, 200)}`, payload });
              taskSync.taskForDelegation({ projectId: run.projectId, agentId: childAgent.id, task: task.task, rootRunId: run.rootRunId, approvalId: approval.id });
            } else {
              const childRunId = startRun(payload);
              taskSync.taskForDelegation({ projectId: run.projectId, agentId: childAgent.id, task: task.task, rootRunId: run.rootRunId, runId: childRunId });
            }
          } else {
            addMessage({ projectId: run.projectId, fromAgentId: "system", toAgentId: agent.id, kind: "error", text: `Delegación fallida: no se encontró al agente "${task.agent}" bajo el mando de ${agent.name}.`, runId });
          }
        }
      }
    }
  }

  useAppStore.setState(state => {
    const pRuntime = state.runtime[run.projectId] || {};
    return {
      runtime: {
        ...state.runtime,
        [run.projectId]: {
          ...pRuntime,
          [agent.id]: {
            ...pRuntime[agent.id],
            status: agentStatus,
            currentRunId: undefined,
            currentTask: undefined
          }
        }
      }
    };
  });

  if (!waitingForChildren) {
    if (!run.parentRunId) {
      // The streamed text and the final answer are the same words when the agent only talked, so
      // keeping both showed the reply twice. The result is the one that carries the "to user"
      // meaning, so it wins and the live copy goes.
      const streamedId = `text-${runId}`;
      const streamed = useAppStore.getState().messages.find(m => m.id === streamedId);
      if (streamed && streamed.text.trim() === run.output.trim()) {
        useAppStore.setState(state => ({ messages: state.messages.filter(m => m.id !== streamedId) }));
      }
      addMessage({ projectId: run.projectId, fromAgentId: agent.id, toAgentId: "user", kind: "result", text: run.output, runId });
      // Only runs belonging to the current task clear it; direct instructions don't.
      if (useAppStore.getState().activeTaskRunId[run.projectId] === run.rootRunId) {
        useAppStore.setState(state => ({ activeTaskRunId: { ...state.activeTaskRunId, [run.projectId]: null } }));
        taskSync.taskOnRootFinished(run.projectId, run.rootRunId, run.status === "error", run.output);
        if (run.status === "error") {
          void emitHookEvent("task.failed", {}, ctx);
          notifyTaskOutcome(run, true);
        } else {
          void emitHookEvent("task.finished", {}, ctx);
          void emitHookEvent("result", {}, ctx);
          if (run.status !== "killed") notifyTaskOutcome(run, false);
        }
      }
    } else {
      maybeContinueParent(run.parentRunId);
    }
  }

  processQueuedInstructions(agent.id, run.projectId);
}

/**
 * The runs of one round: what the parent recorded, plus anything that points back at it.
 *
 * The two should say the same, but the parent's list is only written when a child starts, and a
 * store rebuilt from disk carries the copy from before that — a task delegated in one session and
 * approved in the next has a parent whose list is empty. Read on its own, an empty list means
 * "every child is done", which is how a planner answered with two of its four audits while the
 * other two were still running.
 */
export function childRunsOf(runs: Record<string, Run>, parentRunId: string): Run[] {
  const out: Run[] = [];
  const seen = new Set<string>();
  for (const id of runs[parentRunId]?.childRunIds ?? []) {
    const child = runs[id];
    if (child && !seen.has(id)) { seen.add(id); out.push(child); }
  }
  for (const run of Object.values(runs)) {
    if (run.parentRunId === parentRunId && !seen.has(run.id)) { seen.add(run.id); out.push(run); }
  }
  return out.sort((a, b) => a.startedAt - b.startedAt);
}

/**
 * Reads the `ask` blocks of a finished run and records what it asked. Returns whether it asked
 * anything at all, which is what keeps the round from closing over an unanswered question.
 */
function askQuestions(run: Run, agent: AgentConfig): boolean {
  const parsed = parseQuestions(run.output);
  if (parsed.length === 0) return false;

  const questions: Record<string, AgentQuestion> = {};
  for (const q of parsed) {
    const id = crypto.randomUUID();
    questions[id] = {
      id,
      projectId: run.projectId,
      agentId: agent.id,
      runId: run.id,
      rootRunId: run.rootRunId,
      round: run.round,
      question: q.question,
      options: q.options,
      multiple: q.multiple,
      allowOther: q.allowOther,
      createdAt: Date.now(),
      status: "pending",
    };
    addMessage({
      projectId: run.projectId,
      fromAgentId: agent.id,
      toAgentId: "user",
      kind: "system",
      text: q.question,
      runId: run.id,
    });
  }
  useAppStore.setState(state => ({ questions: { ...state.questions, ...questions } }));

  const first = Object.values(questions)[0];
  useAppStore.getState().notify({
    kind: "question",
    title: translateNow("notify.asksSomething", { name: agent.name }),
    body: truncate(first.question, 140),
    projectId: run.projectId,
    agentId: agent.id,
    runId: run.id,
  });
  return true;
}

/**
 * Hands the answer back to the agent that asked and lets it carry on, in the same session, the
 * same way an instruction does. Nothing else of the round moved while it waited.
 */
export function resumeWithAnswer(question: AgentQuestion, answer: string[]): void {
  const store = useAppStore.getState();
  const run = store.runs[question.runId];
  const chosen = answer.filter(a => a.trim()).join(", ");
  const text = translateNow("questions.answerPrompt", { question: question.question, answer: chosen });

  addMessage({
    projectId: question.projectId,
    fromAgentId: "user",
    toAgentId: question.agentId,
    kind: "instruction",
    text: chosen,
    runId: question.runId,
  });

  startRun({
    agentId: question.agentId,
    projectId: question.projectId,
    prompt: text,
    parentRunId: run?.parentRunId ?? null,
    round: question.round,
    resume: true,
    rootRunId: question.rootRunId,
  });
}

function maybeContinueParent(parentRunId: string) {
  const store = useAppStore.getState();
  const parentRun = store.runs[parentRunId];
  if (!parentRun) return;
  // Delegations still waiting for approval count as unfinished children.
  if (pendingApprovalsFor(parentRunId).length > 0) return;

  const children = childRunsOf(store.runs, parentRunId);
  const allChildrenDone = children.every(r => r.status === "done" || r.status === "error" || r.status === "killed");

  if (allChildrenDone) {
    const parentAgent = selectAgent(store, parentRun.agentId);
    if (!parentAgent) return;

    let outputText = "Resultados de tus agentes:\n\n";
    for (const childRun of children) {
      const childAgent = selectAgent(store, childRun.agentId);
      outputText += `### ${childAgent?.name || childRun.agentId}\n${childRun.output}\n\n`;
    }

    const cancelled = cancelledRuns.delete(parentRunId);
    if (cancelled || parentRun.round >= store.config.maxRounds) {
      addMessage({
        projectId: parentRun.projectId,
        fromAgentId: "system",
        toAgentId: parentRun.agentId,
        kind: "system",
        text: cancelled ? `Tarea de ${parentAgent.name} detenida por el usuario` : "Se alcanzó el máximo de rondas"
      });
      if (cancelled) {
        useAppStore.setState(state => ({
          runs: { ...state.runs, [parentRunId]: { ...state.runs[parentRunId], output: "[detenido por el usuario]" } }
        }));
      }

      useAppStore.setState(state => {
        const pRuntime = state.runtime[parentRun.projectId] || {};
        return {
          runtime: { ...state.runtime, [parentRun.projectId]: { ...pRuntime, [parentRun.agentId]: { ...pRuntime[parentRun.agentId], status: "idle" } } }
        };
      });

      if (!parentRun.parentRunId) {
        useAppStore.setState(state => ({ activeTaskRunId: { ...state.activeTaskRunId, [parentRun.projectId]: null } }));
        taskSync.taskOnRootFinished(parentRun.projectId, parentRun.rootRunId, cancelled || parentRun.status === "error", parentRun.output);
        const project = store.config.projects.find(p => p.id === parentRun.projectId);
        const rootRun = store.runs[parentRun.rootRunId];
        const ctx = { project, agent: parentAgent, runId: parentRun.id, round: parentRun.round, prompt: parentRun.prompt, output: parentRun.output, taskPrompt: rootRun ? rootRun.prompt : parentRun.prompt, error: parentRun.status === "error" ? parentRun.output : "" };
        if (cancelled || parentRun.status === "error") {
          void emitHookEvent("task.failed", {}, ctx);
          if (!cancelled) notifyTaskOutcome(parentRun, true);
        } else {
          void emitHookEvent("task.finished", {}, ctx);
          void emitHookEvent("result", {}, ctx);
          notifyTaskOutcome(parentRun, false);
        }
      } else {
        maybeContinueParent(parentRun.parentRunId);
      }
    } else {
      startRun({
        agentId: parentRun.agentId,
        projectId: parentRun.projectId,
        prompt: outputText,
        parentRunId: parentRun.parentRunId,
        round: parentRun.round + 1,
        resume: true,
        rootRunId: parentRun.rootRunId
      });
    }
  }
}

function processQueuedInstructions(agentId: string, projectId: string) {
  const store = useAppStore.getState();
  const runtime = store.runtime[projectId]?.[agentId];
  if (!runtime || runtime.status === "working") return;

  const queued = runtime.queuedInstructions ?? [];
  if (queued.length > 0) {
    const text = queued[0];
    useAppStore.setState(state => {
      const pRuntime = state.runtime[projectId] || {};
      return {
        runtime: { ...state.runtime, [projectId]: { ...pRuntime, [agentId]: { ...pRuntime[agentId], queuedInstructions: (pRuntime[agentId]?.queuedInstructions ?? []).slice(1) } } }
      };
    });
    
    // User instructions are always direct: no parent, so they never re-trigger
    // a continuation of a planner that already received its results.
    startRun({ agentId, projectId, prompt: text, parentRunId: null, round: 0, resume: true });
  }
}

import { emitHookEvent } from "@/lib/hooks";

export async function submitPrompt(text: string, targetAgentId: string, projectId: string, opts?: { model?: string }): Promise<void> {
  addMessage({ projectId, fromAgentId: "user", toAgentId: targetAgentId, kind: "user", text });
  // A follow-up prompt continues the agent's conversation in this project (session resume), so
  // "vamos por la B" still means something. "Nueva conversación" resets the session explicitly.
  const runId = startRun({ agentId: targetAgentId, projectId, prompt: text, parentRunId: null, round: 0, model: opts?.model, resume: true });
  if (runId) {
    useAppStore.setState(state => ({ activeTaskRunId: { ...state.activeTaskRunId, [projectId]: runId } }));
    taskSync.taskForPrompt({ projectId, agentId: targetAgentId, runId, prompt: text });
    const store = useAppStore.getState();
    const project = store.config.projects.find(p => p.id === projectId);
    const agent = selectAgent(store, targetAgentId);
    if (project && agent) {
      void emitHookEvent("task.started", {}, { project, agent, runId, prompt: text, taskPrompt: text });
    }
  }
}

export async function instructAgent(agentId: string, text: string, projectId: string, opts?: { model?: string }): Promise<void> {
  const store = useAppStore.getState();
  // The agent has to belong to this project's team: nobody else can be given work here.
  if (!selectProjectAgents(store, projectId).some(a => a.id === agentId)) return;
  const runtime = store.runtime[projectId]?.[agentId];

  addMessage({ projectId, fromAgentId: "user", toAgentId: agentId, kind: "instruction", text });

  if (runtime?.status === "working") {
    useAppStore.setState(state => {
      const pRuntime = state.runtime[projectId] || {};
      return {
        runtime: { ...state.runtime, [projectId]: { ...pRuntime, [agentId]: { ...pRuntime[agentId], queuedInstructions: [...(pRuntime[agentId]?.queuedInstructions ?? []), text] } } }
      };
    });
  } else {
    startRun({ agentId, projectId, prompt: text, parentRunId: null, round: 0, resume: true, model: opts?.model });
  }
}

/** True when `run` descends (through parentRunId) from a run of `agentId`. */
// ---- Approvals: delegations that wait for the user's go-ahead ----

function requestApproval(input: Pick<Approval, "kind" | "agentId" | "toAgentId" | "summary" | "payload">): Approval {
  const approval: Approval = {
    id: crypto.randomUUID(),
    projectId: input.payload.projectId,
    createdAt: Date.now(),
    status: "pending",
    ...input,
  };
  useAppStore.setState(state => ({ approvals: { ...state.approvals, [approval.id]: approval } }));
  addMessage({ projectId: approval.projectId, fromAgentId: "system", toAgentId: approval.agentId, kind: "system", text: `Esperando aprobación: ${approval.summary}`, runId: approval.payload.parentRunId ?? undefined });
  const store = useAppStore.getState();
  const project = store.config.projects.find(p => p.id === approval.projectId);
  const agent = selectAgent(store, approval.agentId);
  void emitHookEvent("approval.requested", { summary: approval.summary, approvalId: approval.id }, {
    project,
    agent,
    toAgent: approval.toAgentId ? selectAgent(store, approval.toAgentId)?.name : undefined,
    task: approval.payload.prompt,
  });
  store.notify({
    kind: "approval",
    title: translateNow(project ? "notify.asksPermissionIn" : "notify.asksPermission", {
      name: agent?.name ?? translateNow("notify.anAgent"),
      project: project?.name ?? "",
    }),
    body: truncate(approval.summary, 140) || undefined,
    projectId: approval.projectId,
    agentId: approval.agentId,
    approvalId: approval.id,
  });
  return approval;
}

function pendingApprovalsFor(parentRunId: string): Approval[] {
  return Object.values(useAppStore.getState().approvals).filter(a => a.status === "pending" && a.payload.parentRunId === parentRunId);
}

function settleApproval(approvalId: string, status: "approved" | "rejected", note?: string): Approval | undefined {
  const approval = useAppStore.getState().approvals[approvalId];
  if (!approval || approval.status !== "pending") return undefined;
  const settled: Approval = { ...approval, status, note, decidedAt: Date.now() };
  useAppStore.setState(state => ({ approvals: { ...state.approvals, [approvalId]: settled } }));
  // The user already decided: the bell has nothing left to ask about this one.
  useAppStore.getState().markApprovalNotificationsRead(approvalId);
  return settled;
}

export async function approveApproval(approvalId: string, note?: string): Promise<void> {
  const approval = settleApproval(approvalId, "approved", note);
  if (!approval) return;
  addMessage({ projectId: approval.projectId, fromAgentId: "user", toAgentId: approval.toAgentId, kind: "system", text: `Aprobado: ${approval.summary}${note ? ` (${note})` : ""}` });
  const runId = startRun(approval.payload);
  taskSync.taskOnApprovalSettled(approval.id, true, runId);
}

export async function rejectApproval(approvalId: string, note?: string): Promise<void> {
  const approval = settleApproval(approvalId, "rejected", note);
  if (!approval) return;
  const store = useAppStore.getState();
  const { payload } = approval;
  addMessage({ projectId: approval.projectId, fromAgentId: "user", toAgentId: approval.toAgentId, kind: "system", text: `Rechazado: ${approval.summary}${note ? ` (${note})` : ""}` });
  taskSync.taskOnApprovalSettled(approval.id, false);
  // Record the rejection as a finished child run so the planner gets it with the other results.
  const runId = crypto.randomUUID();
  const now = Date.now();
  const rejected: Run = {
    id: runId,
    agentId: payload.agentId,
    projectId: payload.projectId,
    parentRunId: payload.parentRunId,
    rootRunId: payload.rootRunId ?? runId,
    prompt: payload.prompt,
    status: "error",
    startedAt: now,
    endedAt: now,
    exitCode: null,
    output: `[rechazado por el usuario${note ? `: ${note}` : ""}]`,
    rawLines: [],
    childRunIds: [],
    round: payload.round,
  };
  useAppStore.setState(state => {
    const parent = payload.parentRunId ? state.runs[payload.parentRunId] : undefined;
    return {
      runs: {
        ...state.runs,
        [runId]: rejected,
        ...(parent && payload.parentRunId ? { [payload.parentRunId]: { ...parent, childRunIds: [...parent.childRunIds, runId] } } : {}),
      },
    };
  });
  if (payload.parentRunId && store.runs[payload.parentRunId]) maybeContinueParent(payload.parentRunId);
}

/** Reject every pending approval that belongs to a run of this agent (used by stopAgent). */
function rejectPendingApprovalsOf(agentId: string, projectId: string): number {
  const pending = Object.values(useAppStore.getState().approvals).filter(a => a.status === "pending" && a.projectId === projectId && a.agentId === agentId);
  for (const a of pending) settleApproval(a.id, "rejected", "detenido por el usuario");
  return pending.length;
}

function descendsFromAgent(runs: Record<string, Run>, run: Run, agentId: string): boolean {
  let cursor = run.parentRunId ? runs[run.parentRunId] : undefined;
  while (cursor) {
    if (cursor.agentId === agentId) return true;
    cursor = cursor.parentRunId ? runs[cursor.parentRunId] : undefined;
  }
  return false;
}

/** Runs whose continuation was cancelled by the user while they waited for children. */
const cancelledRuns = new Set<string>();

/**
 * Runs the user stopped before anything was spawned, which happens while a worktree is being
 * prepared: `killRun` has no child to kill yet, so the id is parked here and `startRun` drops the
 * run instead of launching the agent once the preparation ends.
 */
const stoppedBeforeSpawn = new Set<string>();

export async function stopAgent(agentId: string, projectId: string): Promise<void> {
  const store = useAppStore.getState();
  const runtime = store.runtime[projectId]?.[agentId];
  if (runtime?.currentRunId) {
    stoppedBeforeSpawn.add(runtime.currentRunId);
    await getTransport().killRun(runtime.currentRunId);
    return;
  }
  // Waiting for children: stop every running run delegated (directly or not) by this agent,
  // and cancel the continuation so the agent does not re-delegate with "[detenido]" results.
  const descendants = Object.values(store.runs).filter(
    r => r.projectId === projectId && r.status === "running" && descendsFromAgent(store.runs, r, agentId)
  );
  for (const r of descendants) {
    let cursor = r.parentRunId ? store.runs[r.parentRunId] : undefined;
    while (cursor) {
      if (cursor.agentId === agentId) { cancelledRuns.add(cursor.id); break; }
      cursor = cursor.parentRunId ? store.runs[cursor.parentRunId] : undefined;
    }
  }
  await Promise.all(descendants.map(r => getTransport().killRun(r.id).catch(() => {})));
  // Delegations still waiting for approval are dropped too; the task ends here.
  const rejected = rejectPendingApprovalsOf(agentId, projectId);
  if (descendants.length === 0) {
    useAppStore.setState(state => {
      const pRuntime = state.runtime[projectId] || {};
      return {
        runtime: { ...state.runtime, [projectId]: { ...pRuntime, [agentId]: { ...pRuntime[agentId], status: "idle" } } },
        ...(rejected > 0 ? { activeTaskRunId: { ...state.activeTaskRunId, [projectId]: null } } : {}),
      };
    });
    if (rejected > 0) {
      const agent = selectAgent(store, agentId);
      addMessage({ projectId, fromAgentId: "system", toAgentId: agentId, kind: "system", text: `Tarea de ${agent?.name ?? agentId} detenida: ${rejected} delegación(es) pendientes de aprobación descartadas` });
    }
  }
}

export async function stopAll(projectId?: string): Promise<void> {
  const store = useAppStore.getState();
  if (projectId) {
    const pRuntime = store.runtime[projectId];
    if (pRuntime) {
      for (const agentId in pRuntime) {
        const runtime = pRuntime[agentId];
        if (runtime?.currentRunId) {
          stoppedBeforeSpawn.add(runtime.currentRunId);
          getTransport().killRun(runtime.currentRunId).catch(() => {});
        }
      }
    }
  } else {
    for (const pid in store.runtime) {
      for (const agentId in store.runtime[pid]) {
        const runtime = store.runtime[pid][agentId];
        if (runtime?.currentRunId) {
          stoppedBeforeSpawn.add(runtime.currentRunId);
          getTransport().killRun(runtime.currentRunId).catch(() => {});
        }
      }
    }
  }
}
