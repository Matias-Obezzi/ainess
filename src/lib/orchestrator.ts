import { useAppStore, selectChildren, selectAgent } from "@/store";
import { ipc, onRunOutput, onRunExit } from "@/lib/tauri";
import { PROVIDERS, buildSystemPrompt, parseDelegations, finalOutputFromLines } from "@/lib/providers";
import { Run, AgentStatus, CommMessage, RunStatus, RunOutputEvent, RunExitEvent } from "@/types";

let listenersAttached = false;

export async function attachListeners(): Promise<void> {
  if (listenersAttached) return;
  listenersAttached = true;
  await onRunOutput(handleOutput);
  await onRunExit(handleExit);
}

function addMessage(msg: Omit<CommMessage, "id" | "ts">) {
  useAppStore.setState(state => ({
    messages: [...state.messages, { ...msg, id: crypto.randomUUID(), ts: Date.now() }]
  }));
}

function appendCommText(agentId: string, runId: string, delta: string) {
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
          { id: msgId, ts: Date.now(), runId, fromAgentId: agentId, kind: "text", text: delta }
        ]
      };
    }
  });
}

function startRun(opts: { agentId: string; prompt: string; parentRunId: string | null; round: number; resume?: boolean; rootRunId?: string }): string | undefined {
  const store = useAppStore.getState();
  const agent = selectAgent(store, opts.agentId);
  if (!agent) return undefined;

  const runId = crypto.randomUUID();
  const run: Run = {
    id: runId,
    agentId: opts.agentId,
    parentRunId: opts.parentRunId,
    rootRunId: opts.rootRunId ?? runId,
    prompt: opts.prompt,
    status: "running",
    startedAt: Date.now(),
    output: "",
    rawLines: [],
    childRunIds: [],
    round: opts.round
  };

  useAppStore.setState(state => {
    const parentRun = opts.parentRunId ? state.runs[opts.parentRunId] : undefined;
    return {
      runs: {
        ...state.runs,
        [runId]: run,
        ...(parentRun && opts.parentRunId ? { [opts.parentRunId]: { ...parentRun, childRunIds: [...parentRun.childRunIds, runId] } } : {})
      },
      runtime: {
        ...state.runtime,
        [opts.agentId]: {
          ...state.runtime[opts.agentId],
          status: "working",
          currentRunId: runId,
          currentTask: opts.prompt
        }
      }
    };
  });

  const provider = PROVIDERS[agent.provider];
  const binary = store.binaries[agent.provider];

  if (!binary || !binary.path) {
    const err = `No se encontró el CLI de ${provider.label}. Instalalo o configurá un comando custom.`;
    useAppStore.setState(state => ({
      runs: { ...state.runs, [runId]: { ...state.runs[runId], status: "error", output: err, endedAt: Date.now() } },
      runtime: { ...state.runtime, [opts.agentId]: { ...state.runtime[opts.agentId], status: "error", lastError: err, currentRunId: undefined } }
    }));
    addMessage({ fromAgentId: "system", toAgentId: opts.agentId, kind: "error", text: err, runId });
    setTimeout(() => onRunFinished(runId), 0);
    return runId;
  }

  const children = selectChildren(store, agent.id);
  const systemPrompt = buildSystemPrompt(agent, children);
  const sessionId = opts.resume ? store.runtime[opts.agentId]?.sessionId : undefined;

  const spawnOpts = provider.buildCommand({
    agent,
    prompt: opts.prompt,
    systemPrompt,
    sessionId,
    cwd: store.config.workspaceDir ?? undefined,
    binaryPath: binary.path
  });

  ipc.spawnRun({ runId, ...spawnOpts }).catch(err => {
    useAppStore.setState(state => ({
      runs: { ...state.runs, [runId]: { ...state.runs[runId], status: "error", output: String(err), endedAt: Date.now() } },
      runtime: { ...state.runtime, [opts.agentId]: { ...state.runtime[opts.agentId], status: "error", lastError: String(err), currentRunId: undefined } }
    }));
    addMessage({ fromAgentId: "system", toAgentId: opts.agentId, kind: "error", text: String(err), runId });
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
      useAppStore.setState(state => ({
        runtime: { ...state.runtime, [run.agentId]: { ...state.runtime[run.agentId], sessionId: ev.sessionId } }
      }));
    } else if (ev.type === "text") {
      appendCommText(run.agentId, e.runId, ev.text);
    } else if (ev.type === "tool") {
      const text = ev.detail ? `${ev.name}: ${ev.detail}` : ev.name;
      addMessage({ fromAgentId: run.agentId, kind: "tool", text: text.substring(0, 300), runId: e.runId });
    } else if (ev.type === "result") {
      useAppStore.setState(state => {
        const r = state.runs[e.runId];
        return {
          runs: { ...state.runs, [e.runId]: { ...r, output: ev.text } },
          ...(ev.sessionId ? { runtime: { ...state.runtime, [run.agentId]: { ...state.runtime[run.agentId], sessionId: ev.sessionId } } } : {})
        };
      });
    } else if (ev.type === "error") {
      addMessage({ fromAgentId: run.agentId, kind: "error", text: ev.text, runId: e.runId });
    }
  }
}

function handleExit(e: RunExitEvent) {
  const store = useAppStore.getState();
  const run = store.runs[e.runId];
  if (!run) return;

  const isError = e.code !== 0 && !e.killed && !run.output;
  const status: RunStatus = e.killed ? "killed" : isError ? "error" : "done";
  const output = e.killed ? "[detenido por el usuario]" : (run.output || finalOutputFromLines(run.rawLines));

  useAppStore.setState(state => ({
    runs: {
      ...state.runs,
      [e.runId]: {
        ...state.runs[e.runId],
        status,
        output,
        endedAt: Date.now(),
        exitCode: e.code
      }
    }
  }));

  onRunFinished(e.runId);
}

function onRunFinished(runId: string) {
  const store = useAppStore.getState();
  const run = store.runs[runId];
  if (!run) return;
  const agent = selectAgent(store, run.agentId);
  if (!agent) return;

  let agentStatus: AgentStatus = run.status === "killed" ? "stopped" : run.status === "error" ? "error" : "idle";
  let waitingForChildren = false;

  if (run.status === "done" || run.status === "killed") {
    const children = selectChildren(store, agent.id);
    if (children.length > 0) {
      const delegations = parseDelegations(run.output);
      if (delegations.length > 0) {
        waitingForChildren = true;
        agentStatus = "waiting";

        for (const task of delegations) {
          const childAgent = children.find(c => c.name.toLowerCase() === task.agent.toLowerCase() || c.id === task.agent);
          if (childAgent) {
            addMessage({ fromAgentId: agent.id, toAgentId: childAgent.id, kind: "delegation", text: task.task, runId });
            startRun({ agentId: childAgent.id, prompt: task.task, parentRunId: runId, round: run.round, rootRunId: run.rootRunId });
          } else {
            addMessage({ fromAgentId: "system", toAgentId: agent.id, kind: "error", text: `Delegación fallida: no se encontró al agente "${task.agent}" bajo el mando de ${agent.name}.`, runId });
          }
        }
      }
    }
  }

  useAppStore.setState(state => ({
    runtime: {
      ...state.runtime,
      [agent.id]: {
        ...state.runtime[agent.id],
        status: agentStatus,
        currentRunId: undefined,
        currentTask: undefined
      }
    }
  }));

  if (!waitingForChildren) {
    if (!run.parentRunId) {
      addMessage({ fromAgentId: agent.id, toAgentId: "user", kind: "result", text: run.output, runId });
      // Only runs belonging to the current task clear it; direct instructions don't.
      if (useAppStore.getState().activeTaskRunId === run.rootRunId) {
        useAppStore.setState({ activeTaskRunId: null });
      }
    } else {
      maybeContinueParent(run.parentRunId);
    }
  }

  processQueuedInstructions(agent.id);
}

function maybeContinueParent(parentRunId: string) {
  const store = useAppStore.getState();
  const parentRun = store.runs[parentRunId];
  if (!parentRun) return;

  const allChildrenDone = parentRun.childRunIds.every(id => {
    const r = store.runs[id];
    return r && (r.status === "done" || r.status === "error" || r.status === "killed");
  });

  if (allChildrenDone) {
    const parentAgent = selectAgent(store, parentRun.agentId);
    if (!parentAgent) return;

    let outputText = "Resultados de tus agentes:\n\n";
    for (const id of parentRun.childRunIds) {
      const childRun = store.runs[id];
      if (childRun) {
        const childAgent = selectAgent(store, childRun.agentId);
        outputText += `### ${childAgent?.name || childRun.agentId}\n${childRun.output}\n\n`;
      }
    }

    const cancelled = cancelledRuns.delete(parentRunId);
    if (cancelled || parentRun.round >= store.config.maxRounds) {
      addMessage({
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

      useAppStore.setState(state => ({
        runtime: { ...state.runtime, [parentRun.agentId]: { ...state.runtime[parentRun.agentId], status: "idle" } }
      }));

      if (!parentRun.parentRunId) {
        useAppStore.setState({ activeTaskRunId: null });
      } else {
        maybeContinueParent(parentRun.parentRunId);
      }
    } else {
      startRun({
        agentId: parentRun.agentId,
        prompt: outputText,
        parentRunId: parentRun.parentRunId,
        round: parentRun.round + 1,
        resume: true,
        rootRunId: parentRun.rootRunId
      });
    }
  }
}

function processQueuedInstructions(agentId: string) {
  const store = useAppStore.getState();
  const runtime = store.runtime[agentId];
  if (!runtime || runtime.status === "working") return;

  if (runtime.queuedInstructions.length > 0) {
    const text = runtime.queuedInstructions[0];
    useAppStore.setState(state => ({
      runtime: { ...state.runtime, [agentId]: { ...state.runtime[agentId], queuedInstructions: state.runtime[agentId].queuedInstructions.slice(1) } }
    }));
    
    // User instructions are always direct: no parent, so they never re-trigger
    // a continuation of a planner that already received its results.
    startRun({ agentId, prompt: text, parentRunId: null, round: 0, resume: true });
  }
}

export async function submitPrompt(text: string, targetAgentId: string): Promise<void> {
  addMessage({ fromAgentId: "user", toAgentId: targetAgentId, kind: "user", text });
  const runId = startRun({ agentId: targetAgentId, prompt: text, parentRunId: null, round: 0 });
  if (runId) {
    useAppStore.setState({ activeTaskRunId: runId });
  }
}

export async function instructAgent(agentId: string, text: string): Promise<void> {
  const store = useAppStore.getState();
  const runtime = store.runtime[agentId];
  if (!runtime) return;

  addMessage({ fromAgentId: "user", toAgentId: agentId, kind: "instruction", text });

  if (runtime.status === "working") {
    useAppStore.setState(state => ({
      runtime: { ...state.runtime, [agentId]: { ...state.runtime[agentId], queuedInstructions: [...state.runtime[agentId].queuedInstructions, text] } }
    }));
  } else {
    startRun({ agentId, prompt: text, parentRunId: null, round: 0, resume: true });
  }
}

/** True when `run` descends (through parentRunId) from a run of `agentId`. */
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

export async function stopAgent(agentId: string): Promise<void> {
  const store = useAppStore.getState();
  const runtime = store.runtime[agentId];
  if (runtime?.currentRunId) {
    await ipc.killRun(runtime.currentRunId);
    return;
  }
  // Waiting for children: stop every running run delegated (directly or not) by this agent,
  // and cancel the continuation so the agent does not re-delegate with "[detenido]" results.
  const descendants = Object.values(store.runs).filter(
    r => r.status === "running" && descendsFromAgent(store.runs, r, agentId)
  );
  for (const r of descendants) {
    let cursor = r.parentRunId ? store.runs[r.parentRunId] : undefined;
    while (cursor) {
      if (cursor.agentId === agentId) { cancelledRuns.add(cursor.id); break; }
      cursor = cursor.parentRunId ? store.runs[cursor.parentRunId] : undefined;
    }
  }
  await Promise.all(descendants.map(r => ipc.killRun(r.id).catch(() => {})));
  if (descendants.length === 0) {
    useAppStore.setState(state => ({
      runtime: { ...state.runtime, [agentId]: { ...state.runtime[agentId], status: "idle" } }
    }));
  }
}

export async function stopAll(): Promise<void> {
  const store = useAppStore.getState();
  for (const agentId in store.runtime) {
    const runtime = store.runtime[agentId];
    if (runtime?.currentRunId) {
      ipc.killRun(runtime.currentRunId).catch(() => {});
    }
  }
}
