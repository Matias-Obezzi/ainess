import { useAppStore, selectChildren, selectAgent, selectProjectAgents, selectSkillsFor, selectMcpFor, type AppState } from "@/store";
import { getTransport } from "@/lib/transport";
import type { Approval } from "@/types";
import { PROVIDERS, buildSystemPrompt, parseDelegations, parseQuestions, parseNotes, parseResult, parseTaskOps, finalOutputFromLines, TASK_STATUS_KEY } from "@/lib/providers";
import { recordAntigravityOutcome, outOfQuota, alternativeModels } from "@/lib/quota";
import { summarizeTool } from "@/lib/tool-summary";
import { trimMessagesInMemory, trimRunsInMemory, TRIM_MESSAGES_AT } from "@/lib/history";
import { ensureWorktree } from "@/lib/worktree";
import { truncate } from "@/lib/format";
import { translateNow, activeLocale } from "@/i18n/useT";
import * as taskSync from "@/lib/task-sync";
import { pickReviewer } from "@/lib/review";
import { Run, AgentConfig, AgentQuestion, AgentStatus, CommMessage, Delegation, Project, RunStatus, RunOutputEvent, RunExitEvent } from "@/types";
import { delegationNeedsApproval } from "@/lib/approvals";
import { StreamBuffer } from "@/lib/stream-buffer";
import { appendRawLines, forgetRawLines, rawLinesOf } from "@/lib/raw-lines";
import { resolveDelegations } from "@/lib/delegation";
import { bumpToolFailure, REPEATED_FAILURE_AT } from "@/lib/tool-failures";
import { emitHookEvent } from "@/lib/hooks";
import { budgetState, budgetAllowsStart } from "@/lib/budget";
import { runsOfProject, formatCost, dayKey } from "@/lib/usage";
import { isAutonomous, canAutoAnswer } from "@/lib/autonomous";

const toolFailures = new Map<string, number>();
/** Auto-answers spent per task (`rootRunId`), against `MAX_AUTO_ANSWERS`. Cleared by `taskFinished`. */
const autoAnswersUsed = new Map<string, number>();

/**
 * The end of a whole user request. Everything the orchestrator keyed by `rootRunId` and kept
 * outside the store is dropped here, so the next task starts from zero rather than inheriting it.
 */
function taskFinished(projectId: string, rootRunId: string, failed: boolean, error?: string): void {
  autoAnswersUsed.delete(rootRunId);
  taskSync.taskOnRootFinished(projectId, rootRunId, failed, error);
}
/**
 * Tracks the last local day a budget warning notification was emitted for each project.
 * A project can trigger dozens of runs in a single session: without this dedup, any run started
 * while in the warning zone (80%+) would emit a duplicate notification.
 */
const budgetWarningEmitted = new Map<string, string>();
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
  flushStream();
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

/**
 * What the CLIs are saying right now, held for a moment before it reaches the store.
 *
 * Every delta used to be a write: a copy of the whole message array to add one letter to the last
 * one, plus a copy of the runs map for the raw line. With a long history that is work proportional
 * to everything ever said, once per token, and it is what made the window heavy while an agent
 * typed. The deltas are gathered here and applied together, at most every 80 ms.
 */
const streamBuffer = new StreamBuffer();
let flushTimer: ReturnType<typeof setTimeout> | null = null;

export function flushStream() {
  if (flushTimer !== null) {
    clearTimeout(flushTimer);
    flushTimer = null;
  }
  if (streamBuffer.isEmpty()) return;

  const deltas = streamBuffer.take();
  if (deltas.size === 0) return;

  // The lines go to a module of their own, not into the store. They used to be appended to
  // `runs[id].rawLines` here, which gave `runs` a new identity twelve times a second and re-rendered
  // every component watching it — the composer included — for a buffer only one dialog ever reads.
  for (const [runId, delta] of deltas.entries()) appendRawLines(runId, delta.lines);

  useAppStore.setState(state => {
    const runs = state.runs;
    const runIdsWithText = new Set<string>();
    for (const [runId, delta] of deltas.entries()) {
      if (delta.text) runIdsWithText.add(runId);
    }
    // Nothing but lines this time, and those no longer live here: leave the store alone rather than
    // copy the whole feed to put it back unchanged.
    if (runIdsWithText.size === 0) return state;

    let messagesChanged = false;
    let messages = [...state.messages];
    let addedMessages = 0;

    // From the end: a run being streamed into has its `text-` message at the tail, and stopping as
    // soon as they are all found turns a walk over the whole feed into a walk over the last few.
    const msgIndices = new Map<string, number>();
    for (let i = messages.length - 1; i >= 0 && msgIndices.size < runIdsWithText.size; i--) {
      const m = messages[i];
      if (m.runId && m.id === `text-${m.runId}` && runIdsWithText.has(m.runId) && !msgIndices.has(m.runId)) {
        msgIndices.set(m.runId, i);
      }
    }

    for (const [runId, delta] of deltas.entries()) {
      const r = runs[runId];
      if (!r) continue;

      if (delta.text) {
        const idx = msgIndices.get(runId);
        if (idx !== undefined) {
          messages[idx] = { ...messages[idx], text: messages[idx].text + delta.text };
          messagesChanged = true;
        } else {
          messages.push({
            id: `text-${runId}`,
            ts: Date.now(),
            runId,
            projectId: r.projectId,
            fromAgentId: r.agentId,
            kind: "text",
            text: delta.text
          });
          messagesChanged = true;
          addedMessages++;
        }
      }
    }

    if (addedMessages > 0 && messages.length > TRIM_MESSAGES_AT) {
      messages = trimMessagesInMemory(messages);
    }

    if (!messagesChanged) return state;
    return { messages };
  });

  // A note is worth having while the agent is still working, which is the whole point of it, so it
  // is looked for on the way past instead of when the run ends. What gets parsed is the message
  // just written rather than the delta, so a block split across two flushes still reads.
  for (const runId of deltas.keys()) {
    const current = useAppStore.getState();
    const run = current.runs[runId];
    if (!run) continue;
    const streamed = current.messages.find(m => m.id === `text-${runId}`);
    if (streamed) {
      emitNewNotes(run, streamed.text);
      applyNewTaskOps(run, streamed.text);
    }
  }
}

/** How many `note` blocks of a run already reached the feed, so none is handed over twice. */
const notesEmitted = new Map<string, number>();

/** How many `task` blocks of a run already took effect on the board, so none is applied twice. */
const taskOpsApplied = new Map<string, number>();

/**
 * The `note` blocks of a run that have not been passed on yet.
 *
 * Called while the text is still arriving, and once more when the run ends: the counter is what
 * keeps that second pass from repeating what the first one already said.
 */
function emitNewNotes(run: Run, text: string): void {
  const notes = parseNotes(text);
  const already = notesEmitted.get(run.id) ?? 0;
  if (notes.length <= already) return;
  const parentRun = run.parentRunId ? useAppStore.getState().runs[run.parentRunId] : undefined;
  const toAgentId = parentRun ? parentRun.agentId : "user";
  for (const note of notes.slice(already)) {
    addMessage({ projectId: run.projectId, fromAgentId: run.agentId, toAgentId, kind: "note", text: note, runId: run.id });
  }
  notesEmitted.set(run.id, notes.length);
}

function applyNewTaskOps(run: Run, text: string): void {
  const ops = parseTaskOps(text);
  const already = taskOpsApplied.get(run.id) ?? 0;
  if (ops.length <= already) return;
  const applied = taskSync.applyTaskOps(run, ops.slice(already));
  taskOpsApplied.set(run.id, ops.length);
  if (applied.length === 0) return;

  const agent = selectAgent(useAppStore.getState(), run.agentId)?.name ?? run.agentId;
  for (const op of applied) {
    // A card that only gained a line of detail did not change state, and saying it moved to ""
    // was the sentence that came out of pretending otherwise.
    const text = op.kind === "create"
      ? translateNow("task.opCreated", { agent, title: op.title })
      : op.status
        ? translateNow("task.opUpdated", { agent, status: translateNow(TASK_STATUS_KEY[op.status]) })
        : translateNow("task.opNoted", { agent });
    addMessage({
      projectId: run.projectId,
      fromAgentId: run.agentId,
      toAgentId: "user",
      kind: "system",
      text,
      runId: run.id,
    });
  }
}

/**
 * The provider session a run is picking up, if any.
 *
 * An agent has one slot in `runtime` for its session, and that slot holds whichever conversation
 * spoke last. That is fine for its tasks, which are one line of work. It is wrong for a chat: two
 * chats with the same agent are two conversations, and reading that slot for one of them is how a
 * message sent in one came back answered with the other's context.
 *
 * So a caller that owns its own session hands it over, and a chat never falls back to the agent's
 * slot — a chat with no session of its own is a chat that has not started yet, and starting fresh
 * is the right answer, not borrowing somebody else's.
 */
export function resumeSessionId(
  opts: { resume?: boolean; sessionId?: string; chatId?: string },
  agentSession: string | undefined,
): string | undefined {
  if (opts.sessionId) return opts.sessionId;
  if (opts.chatId) return undefined;
  return opts.resume ? agentSession : undefined;
}

/**
 * Where the session a run just reported belongs: with its chat, or in the agent's own slot.
 *
 * Kept apart on purpose. A chat writing into the agent's slot is the same bug read backwards —
 * it would hand the agent's next task the conversation you were having with it.
 */
function rememberSession(state: AppState, run: Run, sessionId: string | undefined): Partial<AppState> {
  if (!sessionId) return {};
  if (run.chatId) {
    return {
      chatSessions: {
        ...state.chatSessions,
        [run.chatId]: { ...(state.chatSessions[run.chatId] || {}), [run.agentId]: sessionId },
      },
    };
  }
  const pRuntime = state.runtime[run.projectId] || {};
  return {
    runtime: {
      ...state.runtime,
      [run.projectId]: { ...pRuntime, [run.agentId]: { ...pRuntime[run.agentId], sessionId, sessionUpdatedAt: Date.now() } },
    },
  };
}

function scheduleStreamFlush() {
  if (flushTimer === null) {
    flushTimer = setTimeout(flushStream, 80);
  }
}

export function startRun(opts: { agentId: string; projectId: string; prompt: string; parentRunId: string | null; round: number; resume?: boolean; rootRunId?: string; model?: string; kind?: "task" | "chat"; systemPromptOverride?: string; review?: { ofRunId: string; taskId: string }; sessionId?: string; chatId?: string }): string | undefined {
  const store = useAppStore.getState();
  const agent = selectAgent(store, opts.agentId);
  const project = store.config.projects.find(p => p.id === opts.projectId);
  if (!agent || !project) return undefined;
  const bState = budgetState(runsOfProject(store.runs, opts.projectId), project.budget);
  if (!budgetAllowsStart(bState, project.budget)) {
    const limitUsd = bState.limit?.usd ?? 0;
    const spentUsd = bState.limit?.kind === "monthly" ? bState.spentMonth : bState.spentToday;
    const locale = activeLocale();
    const limit = formatCost(limitUsd, locale);
    const spent = formatCost(spentUsd, locale);
    const text = translateNow("budget.blocked", { limit, spent });

    addMessage({
      projectId: opts.projectId,
      fromAgentId: "system",
      toAgentId: opts.agentId,
      kind: "error",
      text,
    });

    store.notify({
      kind: "info",
      title: text,
      projectId: opts.projectId,
      agentId: opts.agentId,
    });

    return undefined;
  }

  if (bState.warning) {
    const currentDay = dayKey(Date.now());
    const lastWarnedDay = budgetWarningEmitted.get(opts.projectId);
    if (lastWarnedDay !== currentDay) {
      budgetWarningEmitted.set(opts.projectId, currentDay);
      const limitUsd = bState.limit?.usd ?? 0;
      const locale = activeLocale();
      const limit = formatCost(limitUsd, locale);
      const percent = Math.round((bState.ratio ?? 0) * 100);
      const title = translateNow("budget.warning", { percent, limit });

      store.notify({
        kind: "info",
        title,
        projectId: opts.projectId,
        agentId: opts.agentId,
      });
    }
  }

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
    chatId: opts.chatId,
    review: opts.review,
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
    const err = translateNow("system.cliMissing", { cli: provider.label });
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
    // The board card is opened by whoever called us, right after this returns, so settling it has
    // to wait a tick: done here and now it would move a card that does not exist yet, and the card
    // would sit at "working" behind a run that never started.
    setTimeout(() => {
      const errorRun = useAppStore.getState().runs[runId];
      if (errorRun) taskSync.taskOnRunFinished(errorRun);
      onRunFinished(runId);
    }, 0);
    return runId;
  }

  const children = selectChildren(store, opts.projectId, agent.id);
  const skills = selectSkillsFor(store, agent.id);
  // This project's notes, and only this project's: the global one is what sent an agent off to
  // work on somebody else's repo because it had been told about it (see migration 13).
  const sharedContext = project.sharedContext ?? "";
  const sessionId = resumeSessionId(opts, store.runtime[opts.projectId]?.[opts.agentId]?.sessionId);
  // Nothing to read on the very first run of an agent: the file is written as the turns end.
  const hasPast = Object.values(store.runs).some(r =>
    r.agentId === agent.id && r.projectId === opts.projectId && r.status === "done");

  const thisRoot = opts.rootRunId ?? runId;
  const projectRuntime = store.runtime[opts.projectId] || {};
  const teammates: { name: string; task: string }[] = [];
  for (const [otherId, rt] of Object.entries(projectRuntime)) {
    if (otherId === agent.id) continue;
    if (rt.status !== "working") continue;
    if (!rt.currentTask || !rt.currentRunId) continue;
    const otherRun = store.runs[rt.currentRunId];
    if (otherRun && otherRun.rootRunId === thisRoot) {
      const otherAgent = selectAgent(store, otherId);
      if (otherAgent) teammates.push({ name: otherAgent.name, task: rt.currentTask });
    }
  }

  // Not `taskForRun(runId)`: this run has not started, so nothing points at it yet. What the agent
  // is coming back to is the card its previous run in this same lineage left behind.
  const cardTask = taskSync.cardForNextRun({ projectId: opts.projectId, agentId: opts.agentId, rootRunId: opts.rootRunId });
  const card = cardTask ? { id: cardTask.id, title: cardTask.title, status: cardTask.status } : undefined;

  const systemPrompt = opts.systemPromptOverride ?? buildSystemPrompt(agent, children, {
    // No parent run means the user is talking to this agent itself, which is worth saying: an
    // implementer told to do something by its planner and by the user reads the same prompt.
    fromUser: opts.parentRunId === null,
    skills,
    sharedContext,
    profile: store.config.profile,
    autoModel: store.config.autoModel,
    // What there is to do. The board used to be something only the app could see, so a planner
    // asked to work off it answered that there was nothing there.
    tasks: store.tasks[opts.projectId] ?? [],
    agentName: (id) => selectAgent(store, id)?.name,
    // Who else is in this project, for the planner that has nobody under it.
    others: selectProjectAgents(store, opts.projectId).filter(a => a.parentId !== agent.id),
    // A session that is being carried on already read the preamble; only what changed goes again.
    resuming: !!sessionId,
    historyFile: !sessionId && hasPast ? `${FOLDER}/${HISTORY_DIR}/${historyFileName(agent)}` : undefined,
    teammates: teammates.length > 0 ? teammates : undefined,
    canNote: opts.parentRunId !== null,
    card,
  });

  const mcpServers = selectMcpFor(store, agent.id);

  const doSpawn = async () => {
    // Right before the run, so what the agent opens is what the settings say right now. Only the
    // ones this agent has: the prompt names them by path and the file has to be there.
    if (project) await writeSkillFiles(project, skills);

    let mcpConfigPath: string | undefined;
    // Claude Code and Copilot both take a file of MCP servers for the session, in the same shape.
    // Antigravity is configured machine-wide instead (`ainess mcp sync`), and the rest have no way in
    // yet — see Configuración → MCP.
    if ((agent.provider === "claude" || agent.provider === "copilot") && mcpServers.length > 0) {
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

    let baseSha: string | undefined;
    try {
      const rev = await getTransport().exec("git", ["rev-parse", "HEAD"], cwd, 10);
      if (rev.code === 0 && rev.stdout.trim()) {
        baseSha = rev.stdout.trim();
      }
    } catch {
      // Not a git repo, repo without commits, or exec failed; leave baseSha undefined.
    }

    useAppStore.setState(state => {
      const run = state.runs[runId];
      return run ? { runs: { ...state.runs, [runId]: { ...run, cwd, baseSha } } } : state;
    });

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

    const spawned = await getTransport().spawnRun({ runId, ...spawnOpts });
    // Written down with the run, and so onto disk: if this app dies without getting to kill its
    // agents, the next launch has what it needs to find the process it left behind.
    if (spawned) {
      useAppStore.setState(state => {
        const run = state.runs[runId];
        return run ? { runs: { ...state.runs, [runId]: { ...run, process: spawned } } } : state;
      });
    }
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

  streamBuffer.pushLine(e.runId, e.line);

  for (const ev of events) {
    if (ev.type === "session") {
      useAppStore.setState(state => rememberSession(state, run, ev.sessionId));
    } else if (ev.type === "text") {
      streamBuffer.pushText(e.runId, ev.text);
    } else if (ev.type === "tool") {
      const workspaceDir = store.config.projects.find(p => p.id === run.projectId)?.workspaceDir;
      const summary = summarizeTool(ev.name, ev.input, { workspaceDir });
      if (ev.failed) {
        addMessage({
          projectId: run.projectId,
          fromAgentId: run.agentId,
          kind: "tool",
          text: translateNow("tool.failedShort", { name: ev.name }),
          runId: e.runId,
          meta: { tool: ev.name, summary, input: ev.input, failed: true, error: ev.error },
        });

        const count = bumpToolFailure(toolFailures, run.id, ev.name);
        if (count === REPEATED_FAILURE_AT) {
          addMessage({
            projectId: run.projectId,
            fromAgentId: "system",
            toAgentId: run.agentId,
            kind: "system",
            text: translateNow("tool.failedRepeatedly", { name: ev.name, n: String(REPEATED_FAILURE_AT) }),
            runId: run.id
          });
        }
      } else {
        const text = ev.detail ? `${ev.name}: ${ev.detail}` : ev.name;
        addMessage({
          projectId: run.projectId,
          fromAgentId: run.agentId,
          kind: "tool",
          text: text.substring(0, 300),
          runId: e.runId,
          meta: { tool: ev.name, summary, input: ev.input },
        });
      }
    } else if (ev.type === "result") {
      useAppStore.setState(state => {
        const r = state.runs[e.runId];
        if (!r) return state;
        return {
          // Copilot's result carries usage but no text: keep whatever answer we already had.
          runs: { ...state.runs, [e.runId]: { ...r, output: ev.text || r.output, ...(ev.usage ? { usage: ev.usage } : {}) } },
          ...(ev.sessionId ? rememberSession(state, run, ev.sessionId) : {})
        };
      });
    } else if (ev.type === "error") {
      addMessage({ projectId: run.projectId, fromAgentId: run.agentId, kind: "error", text: ev.text, runId: e.runId });
    }
  }

  scheduleStreamFlush();
}

function handleExit(e: RunExitEvent) {
  flushStream();
  const store = useAppStore.getState();
  const run = store.runs[e.runId];
  if (!run) return;

  // Everything the run printed, taken out of the live buffer now that there is no more coming. From
  // here on it belongs to the run: what gets saved, what the raw view of a finished run shows.
  const rawLines = rawLinesOf(e.runId) ?? run.rawLines;
  forgetRawLines(e.runId);

  const agentForRun = selectAgent(store, run.agentId);
  const spec = agentForRun ? PROVIDERS[agentForRun.provider] : undefined;
  const collected = run.output || (spec?.finalOutput ? spec.finalOutput(rawLines) : finalOutputFromLines(rawLines));
  // Providers that only report what each step spent (opencode) are added up here, once.
  const finalUsage = spec?.finalUsage ? spec.finalUsage(rawLines) : undefined;
  const isError = e.code !== 0 && !e.killed && !collected;
  const status: RunStatus = e.killed ? "killed" : isError ? "error" : "done";
  const output = e.killed ? translateNow("system.stoppedByUser") : collected;

  useAppStore.setState(state => ({
    // The run is closed and then the project's runs are brought back to the size the file keeps:
    // without this every run of the session stayed in memory with its whole raw buffer.
    runs: trimRunsInMemory(
      {
        ...state.runs,
        [e.runId]: {
          ...state.runs[e.runId],
          rawLines,
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

  if (agentForRun) {
    maybeStartReview({ ...run, status, output, endedAt: Date.now(), exitCode: e.code }, agentForRun);
  }

  if (agentForRun?.provider === "antigravity" && !e.killed) {
    const text = `${output}\n${rawLines.slice(-20).join("\n")}`;
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

  // A whole task (not a nested delegation — the retry below relaunches it from scratch, with
  // nothing to reattach it to) that died only because its model ran dry: with the agent's own
  // "reintentar cuando vuelva la cuota" on, or the project running unattended, this is not the end
  // of the task, just a wait. See `parkQuotaRetry` and `useQuotaSync`, which relaunches it.
  const parkForRetry = !run.parentRunId && spentModel(run, agent) !== null && shouldRetryOnQuota(agent, project);
  if (parkForRetry) agentStatus = "waiting";
  // Ended any other way — it finished, it failed for its own reasons, it was stopped. Whatever was
  // parked for this same work is settled, and leaving it would have it relaunched later for nothing.
  else store.clearQuotaWaitingFor(run.projectId, agent.id, run.prompt);

  if (run.status === "done") void emitHookEvent("run.finished", {}, ctx);
  else if (run.status === "error") void emitHookEvent("run.failed", {}, ctx);
  else if (run.status === "killed") void emitHookEvent("agent.stopped", {}, ctx);

  // An agent that asked something is not finished, it is waiting: the round stops here and picks
  // up when the question is answered (see `resumeWithAnswer`).
  const asked = run.status === "done" ? askQuestions(run, agent) : false;
  if (asked) {
    agentStatus = "waiting";
  }

  let retryUnknownPayload: { prompt: string, gaveUpText?: string } | undefined;

  if (run.status === "done" || run.status === "killed") {
    // Whatever the stream did not carry: a note that only shows up in the final answer, or one
    // whose block closed on the very last delta. What was handed over already is skipped.
    emitNewNotes(run, run.output);
    notesEmitted.delete(run.id);
    applyNewTaskOps(run, run.output);
    taskOpsApplied.delete(run.id);
    for (const key of toolFailures.keys()) {
      if (key.startsWith(`${run.id}:`)) toolFailures.delete(key);
    }
  }

  if (!asked && (run.status === "done" || run.status === "killed")) {
    const children = selectChildren(store, run.projectId, agent.id);

    if (children.length > 0) {
      const delegations = parseDelegations(run.output);
      if (delegations.length > 0) {
        const { resolved, unknown } = resolveDelegations(delegations, children);
        let startedCount = 0;
        let resolvedIdx = 0;

        for (const task of delegations) {
          if (unknown.includes(task.agent)) {
            addMessage({ projectId: run.projectId, fromAgentId: "system", toAgentId: agent.id, kind: "error", text: translateNow("delegation.unknownAgent", { name: task.agent, agent: agent.name }), runId });
          } else {
            const childAgent = resolved[resolvedIdx++];
            // A model the parent asked for is obeyed whether or not "choose the model" is on:
            // that setting decides whether the planner is *told to pick* one, not whether a pick
            // it made counts. With it off, an agent told to retry on another model because its
            // own ran out of quota was silently started on the same one again.
            let modelToUse: string | undefined = undefined;
            if (task.model) {
              const providerSpec = PROVIDERS[childAgent.provider];
              const allowed = new Set(providerSpec?.defaultModels || []);
              if (childAgent.model) allowed.add(childAgent.model);
              if (allowed.has(task.model)) {
                modelToUse = task.model;
              } else {
                addMessage({ projectId: run.projectId, fromAgentId: "system", toAgentId: agent.id, kind: "system", text: translateNow("system.modelUnavailable", { model: task.model, name: childAgent.name }), runId });
              }
            }
            const textForMessage = modelToUse ? `[${modelToUse}] ${task.task}` : task.task;
            addMessage({ projectId: run.projectId, fromAgentId: agent.id, toAgentId: childAgent.id, kind: "delegation", text: textForMessage, runId });
            void emitHookEvent("delegation", {}, { ...ctx, toAgent: childAgent.name, task: task.task, model: modelToUse || "" });
            const payload = { agentId: childAgent.id, projectId: run.projectId, prompt: task.task, parentRunId: runId, round: run.round, rootRunId: run.rootRunId, model: modelToUse };
            const summary = `${agent.name} → ${childAgent.name}: ${task.task.slice(0, 200)}`;
            const needsApproval = delegationNeedsApproval(childAgent, store.config.approveDelegations);
            if (needsApproval && !isAutonomous(project)) {
              // Gate: the child only runs once the user approves (app, CLI or phone).
              const approval = requestApproval({ kind: "delegation", agentId: agent.id, toAgentId: childAgent.id, summary, payload });
              taskSync.taskForDelegation({ projectId: run.projectId, agentId: childAgent.id, task: task.task, rootRunId: run.rootRunId, approvalId: approval.id, taskId: task.taskId });
            } else {
              // Autonomous mode skips the wait, but the decision still gets written down — see
              // `autonomousReport`, which is how the user finds out in the morning what ran without them.
              if (needsApproval) recordAutoApproval({ kind: "delegation", agentId: agent.id, toAgentId: childAgent.id, summary, payload });
              const childRunId = startRun(payload);
              // A child that never started is not a child to wait for. Counting it anyway left the
              // planner waiting on a run that does not exist and its card in "working" for good —
              // which is now reachable for a real reason, because a spent budget refuses to start.
              if (!childRunId) {
                addMessage({ projectId: run.projectId, fromAgentId: "system", toAgentId: agent.id, kind: "error", text: translateNow("delegation.couldNotStart", { name: childAgent.name }), runId });
                continue;
              }
              taskSync.taskForDelegation({ projectId: run.projectId, agentId: childAgent.id, task: task.task, rootRunId: run.rootRunId, runId: childRunId, taskId: task.taskId });
            }
            startedCount++;
          }
        }

        if (startedCount > 0) {
          waitingForChildren = true;
          agentStatus = "waiting";
        } else if (unknown.length > 0) {
          if (run.round + 1 <= store.config.maxRounds) {
            const validNames = children.length > 0 ? children.map(c => c.name).join(", ") : translateNow("delegation.noChildren");
            retryUnknownPayload = { prompt: translateNow("delegation.retryUnknown", { names: unknown.join(", "), valid: validNames }) };
          } else {
            const gaveUpText = translateNow("delegation.gaveUp", { names: unknown.join(", ") });
            retryUnknownPayload = { prompt: "", gaveUpText };
            agentStatus = "idle";
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

  if (parkForRetry) {
    parkQuotaRetry(run, agent);
    // The board card moves to "needs-you" (the closest existing bucket to "paused, not failed")
    // instead of sitting in "working" forever with nothing left to move it — the retry, once it
    // runs, opens its own fresh card the same way `RetryRunDialog` does. Neither the "task failed"
    // hook nor its notification fire: this is not a failure, `autonomousReport`/the parked-run
    // message already say what happened, and firing both would read as contradicting itself.
    useAppStore.setState(state => ({ activeTaskRunId: { ...state.activeTaskRunId, [run.projectId]: null } }));
    taskFinished(run.projectId, run.rootRunId, true, translateNow("autonomous.quotaParked", { name: agent.name }));
    return;
  }

  if (retryUnknownPayload) {
    if (retryUnknownPayload.prompt) {
      startRun({ agentId: agent.id, projectId: run.projectId, prompt: retryUnknownPayload.prompt, parentRunId: run.parentRunId, round: run.round + 1, rootRunId: run.rootRunId, resume: true });
    } else {
      addMessage({ projectId: run.projectId, fromAgentId: "system", toAgentId: agent.id, kind: "system", text: retryUnknownPayload.gaveUpText!, runId });
      if (!run.parentRunId) {
        useAppStore.setState(state => ({ activeTaskRunId: { ...state.activeTaskRunId, [run.projectId]: null } }));
        taskFinished(run.projectId, run.rootRunId, true, retryUnknownPayload.gaveUpText!);
        void emitHookEvent("task.failed", {}, ctx);
        notifyTaskOutcome(run, true);
      } else {
        maybeContinueParent(run.parentRunId);
      }
    }
  } else if (!waitingForChildren) {
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
        taskFinished(run.projectId, run.rootRunId, run.status === "error", run.output);
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

  // What was said, into the project itself, where the agent can read it next time (and so can you,
  // with an editor). Failures and stops are written too: knowing a turn ended badly is the point.
  if (project) {
    const parent = run.parentRunId ? store.runs[run.parentRunId] : undefined;
    const from = parent
      ? selectAgent(store, parent.agentId)?.name ?? translateNow("folder.history.fromUser")
      : translateNow("folder.history.fromUser");
    void recordTurn(project, agent, { from, prompt: run.prompt, answer: run.output });
  }
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

  const store = useAppStore.getState();
  const project = store.config.projects.find(p => p.id === run.projectId);
  const rootRun = store.runs[run.rootRunId];
  const taskPrompt = rootRun ? rootRun.prompt : run.prompt;
  const ctx = {
    project,
    agent,
    runId: run.id,
    round: run.round,
    prompt: run.prompt,
    output: run.output,
    taskPrompt,
    error: "",
  };

  // No one is here to answer while the project runs unattended: the question is still written down
  // (it belongs in the history and in the autonomous report), but nobody has to click anything —
  // `autoAnswer`, once set, resolves every question this run asked with the same conservative note.
  const now = Date.now();
  // An agent that answers every answer with another question would run all night on one task, and
  // the round cap that would normally catch that is the very thing autonomous mode turns off. Past
  // the ceiling the questions go back to waiting for the user: a task that ends up needing them is
  // a better morning than a quota spent going in circles.
  const autoAnswered = autoAnswersUsed.get(run.rootRunId) ?? 0;
  const autonomous = canAutoAnswer(project, autoAnswered);
  const autoAnswer = autonomous ? [translateNow("autonomous.answerPrompt")] : undefined;

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
      createdAt: now,
      ...(autoAnswer
        ? { status: "answered" as const, answer: autoAnswer, answeredAt: now, auto: true }
        : { status: "pending" as const }),
    };
    addMessage({
      projectId: run.projectId,
      fromAgentId: agent.id,
      toAgentId: "user",
      kind: "system",
      text: q.question,
      runId: run.id,
    });
    void emitHookEvent("question.asked", { question: q.question }, ctx);
  }
  useAppStore.setState(state => ({ questions: { ...state.questions, ...questions } }));

  if (autoAnswer) {
    autoAnswersUsed.set(run.rootRunId, autoAnswered + Object.keys(questions).length);
    // Deferred: the caller (`onRunFinished`) still has its own `runtime` update to make for this
    // very run once this function returns, and starting the resumed run synchronously here would
    // have that update stomp on the new run's `currentRunId` a moment after `resumeWithAnswer` sets it.
    // One resume carrying every question, the same way a person answering them gets one — see
    // `resumeWithAnswers`. Resuming once per question forks the lineage, and each fork can ask
    // again, which doubles every turn with nothing but the expiry hour underneath it.
    const asked = Object.values(questions).map(question => ({ question, answer: autoAnswer }));
    setTimeout(() => resumeWithAnswers(asked), 0);
    return true;
  }

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
  resumeWithAnswers([{ question, answer }]);
}

/**
 * Hands back every answer at once and lets the agent carry on — one message, one run.
 *
 * A run that asks three things used to be resumed three times, once per answer: three runs off one
 * turn, three tasks on the board, three agents editing the same workspace over a question the user
 * answered once. The agent asked in a single turn and it gets a single reply, which is also the only
 * shape that makes sense to it — the second answer is no use without the first.
 *
 * Every question here belongs to the same run; the caller groups them (see `pending-question.ts`).
 */
export function resumeWithAnswers(items: Array<{ question: AgentQuestion; answer: string[] }>): void {
  if (items.length === 0) return;
  const store = useAppStore.getState();
  const question = items[0].question;
  const run = store.runs[question.runId];

  const lines = items.map(item => {
    const chosen = item.answer.filter(a => a.trim()).join(", ");
    return translateNow("questions.answerPrompt", { question: item.question.question, answer: chosen });
  });
  const text = lines.join("\n");

  addMessage({
    projectId: question.projectId,
    fromAgentId: "user",
    toAgentId: question.agentId,
    kind: "instruction",
    // The feed shows what was answered, and with several questions the answers alone ("sí, la B")
    // say nothing without the questions they belong to.
    text: items.length === 1 ? items[0].answer.filter(a => a.trim()).join(", ") : text,
    runId: question.runId,
  });

  const resumed = startRun({
    agentId: question.agentId,
    projectId: question.projectId,
    prompt: text,
    parentRunId: run?.parentRunId ?? null,
    round: question.round,
    resume: true,
    // A chat turn that answers a question is still a chat turn. Without carrying the kind over, the
    // resumed run was read as a task: its `delegate` blocks were parsed and acted on, so an agent
    // could hand work out from inside a conversation where nobody had asked it to.
    kind: run?.kind,
    // A question asked inside a chat is answered inside that chat. Without this the answer went to
    // whatever session the agent's own slot was holding, which is the same crossing of wires read
    // from the other end.
    chatId: run?.chatId,
    sessionId: run?.chatId ? store.chatSessions[run.chatId]?.[question.agentId] : undefined,
    rootRunId: question.rootRunId,
  });

  // The agent (or the project) is gone: the answer has nowhere to go, and saying so beats leaving
  // the thread looking like something is working on it.
  if (!resumed) {
    addMessage({
      projectId: question.projectId,
      fromAgentId: "system",
      kind: "error",
      text: translateNow("questions.agentGone"),
      runId: question.runId,
    });
  }
}

/**
 * Starts a review run if the finished run was an implementer's delegated work,
 * and a reviewer agent is available in the project.
 */
function maybeStartReview(run: Run, agent: AgentConfig): void {
  if (run.status !== "done" || !run.parentRunId) return;
  if (run.kind === "chat") return;
  if (run.review) return;
  
  const store = useAppStore.getState();
  const reviewer = pickReviewer(selectProjectAgents(store, run.projectId), agent.id);
  if (!reviewer) return;
  
  const task = taskSync.taskForRun(run.projectId, run.id);
  if (!task) return;
  
  const prompt = translateNow("review.prompt", { agent: agent.name, task: run.prompt, output: run.output });
  const reviewRunId = startRun({
    agentId: reviewer.id,
    projectId: run.projectId,
    prompt,
    parentRunId: run.parentRunId,
    round: run.round,
    rootRunId: run.rootRunId,
    review: { ofRunId: run.id, taskId: task.id }
  });
  
  if (!reviewRunId) return;

  // The reviewer's CLI may be missing: `startRun` closes that run in error on its own and no exit
  // ever arrives, so nothing would move the card. Settle it here instead of parking it in a review
  // nobody is doing.
  const started = useAppStore.getState().runs[reviewRunId];
  if (started && started.status !== "running") {
    taskSync.taskOnRunFinished(started);
    return;
  }

  taskSync.taskOnReviewStarted(task.id, reviewRunId);
}

/**
 * What to add under a child's answer when the child did not fail at the work but ran out of quota.
 *
 * Left alone, the parent reads a wall of CLI error text, cannot tell "the model is spent" from
 * "the task is impossible", and re-delegates onto the same exhausted model. So it is told plainly
 * what happened, which models are left, and that it may name one — the `model` field is not in the
 * delegate schema unless "choose the model" is on, and it is honoured either way.
 */
/**
 * The model a child ran out of, or `null` when quota is not what stopped it.
 *
 * Separate from the note it produces because running out of quota is an event and the note is a
 * paragraph: something that fires a hook cannot live inside a function whose job is to build a
 * string, or it fires again the day somebody builds that string twice.
 */
function spentModel(childRun: Run, childAgent: AgentConfig | undefined): string | undefined | null {
  if (childRun.status !== "error" || !childAgent) return null;
  if (!outOfQuota(childRun.output)) return null;
  return childRun.model ?? childAgent.model;
}

function quotaNote(childRun: Run, childAgent: AgentConfig | undefined): string {
  const spent = spentModel(childRun, childAgent);
  if (spent === null || !childAgent) return "";
  const others = alternativeModels(childAgent.provider, spent);
  if (others.length === 0) return `\n${translateNow("prompt.quota.spentNoOthers", { name: childAgent.name })}\n`;
  return `\n${translateNow("prompt.quota.spent", { name: childAgent.name, models: others.join(", ") })}\n`;
}

/** Whether a run of `agent` that dies out of quota should be parked and relaunched later instead
 * of ending the task: either the agent has its own "reintentar cuando vuelva la cuota" on, or the
 * project is running unattended and nobody is there to hit retry by hand. */
function shouldRetryOnQuota(agent: AgentConfig, project: Project | undefined): boolean {
  return agent.retryOnQuota === true || isAutonomous(project);
}

/**
 * Parks a run that only died from a spent quota, so `useQuotaSync` can relaunch it — same prompt,
 * from scratch, no `resume` and no `rootRunId`, exactly what `RetryRunDialog` does by hand — once
 * the provider has room again. The card does not stay in "working" with nothing left to move it:
 * the caller settles it into "needs-you" and the retry opens a fresh one, the same way a retry by
 * hand does.
 */
function parkQuotaRetry(run: Run, agent: AgentConfig): void {
  useAppStore.setState(state => {
    // This run may itself be a relaunch of one that was parked before. Same project, same agent,
    // same prompt is the same piece of work coming back for another go, and the count has to follow
    // it — without that, each attempt looked like the first and there was nothing to give up after.
    const waiting = { ...state.quotaWaiting };
    let attempts = 0;
    for (const [id, entry] of Object.entries(waiting)) {
      if (entry.projectId === run.projectId && entry.agentId === agent.id && entry.prompt === run.prompt) {
        attempts = Math.max(attempts, entry.attempts);
        delete waiting[id];
      }
    }
    return {
      quotaWaiting: {
        ...waiting,
        [run.id]: {
          agentId: agent.id,
          projectId: run.projectId,
          provider: agent.provider,
          prompt: run.prompt,
          model: run.model,
          createdAt: Date.now(),
          attempts,
        },
      },
    };
  });
  addMessage({
    projectId: run.projectId,
    fromAgentId: "system",
    toAgentId: agent.id,
    kind: "system",
    text: translateNow("autonomous.quotaParked", { name: agent.name }),
    runId: run.id,
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
    const project = store.config.projects.find(p => p.id === parentRun.projectId);

    let outputText = translateNow("prompt.results.header") + "\n\n";
    for (const childRun of children) {
      const childAgent = selectAgent(store, childRun.agentId);
      outputText += `### ${childAgent?.name || childRun.agentId}\n${childRun.output}\n`;
      
      // What the child says it did, in the shape the planner can act on. Only the lists with
      // something in them: three empty headings say nothing and cost a paragraph.
      const result = parseResult(childRun.output);
      if (result) {
        const lines: string[] = [];
        if (result.files.length) lines.push(`**${translateNow("result.files")}:** ${result.files.join(", ")}`);
        if (result.verified.length) lines.push(`**${translateNow("result.verified")}:** ${result.verified.join(", ")}`);
        if (result.blocked.length) lines.push(`**${translateNow("result.blocked")}:** ${result.blocked.join(", ")}`);
        if (lines.length) outputText += "\n" + lines.join("\n") + "\n";
      }

      const spent = spentModel(childRun, childAgent);
      if (spent !== null) {
        const childRoot = store.runs[childRun.rootRunId];
        void emitHookEvent("quota.exhausted", { model: spent ?? "" }, {
          project,
          agent: childAgent,
          runId: childRun.id,
          round: childRun.round,
          prompt: childRun.prompt,
          output: childRun.output,
          taskPrompt: childRoot ? childRoot.prompt : childRun.prompt,
          error: childRun.output,
        });
      }

      outputText += quotaNote(childRun, childAgent);
      outputText += "\n";
    }

    const cancelled = cancelledRuns.delete(parentRunId);
    // The round cap is a human-shaped stop, not a safety one (the budget is that): autonomous mode
    // skips it so the task keeps going past it, same as it does with approvals and questions. A
    // manual stop (`cancelled`) is not skipped — parar a mano tiene que seguir parando.
    const roundsCapped = !cancelled && parentRun.round >= store.config.maxRounds && !isAutonomous(project);
    if (cancelled || roundsCapped) {
      const isMaxRounds = roundsCapped;
      addMessage({
        projectId: parentRun.projectId,
        fromAgentId: "system",
        toAgentId: parentRun.agentId,
        kind: "system",
        text: cancelled ? translateNow("system.taskStopped", { name: parentAgent.name }) : translateNow("rounds.maxReached", { n: store.config.maxRounds })
      });
      if (cancelled) {
        useAppStore.setState(state => ({
          runs: { ...state.runs, [parentRunId]: { ...state.runs[parentRunId], output: translateNow("system.stoppedByUser") } }
        }));
      }

      useAppStore.setState(state => {
        const pRuntime = state.runtime[parentRun.projectId] || {};
        return {
          runtime: { ...state.runtime, [parentRun.projectId]: { ...pRuntime, [parentRun.agentId]: { ...pRuntime[parentRun.agentId], status: "idle" } } }
        };
      });

      // Nothing of the parent's own ends here, and the drain hangs off a run ending: without this
      // a message waiting for it would sit there until it happened to run again.
      processQueuedInstructions(parentRun.agentId, parentRun.projectId);

      if (!parentRun.parentRunId) {
        useAppStore.setState(state => ({ activeTaskRunId: { ...state.activeTaskRunId, [parentRun.projectId]: null } }));
        
        if (isMaxRounds) {
          taskFinished(parentRun.projectId, parentRun.rootRunId, true, translateNow("rounds.maxReachedDetail", { n: store.config.maxRounds }));
        } else {
          taskFinished(parentRun.projectId, parentRun.rootRunId, cancelled || parentRun.status === "error", parentRun.output);
        }

        const rootRun = store.runs[parentRun.rootRunId];
        const ctx = { project, agent: parentAgent, runId: parentRun.id, round: parentRun.round, prompt: parentRun.prompt, output: parentRun.output, taskPrompt: rootRun ? rootRun.prompt : parentRun.prompt, error: parentRun.status === "error" ? parentRun.output : "" };
        if (cancelled || parentRun.status === "error" || isMaxRounds) {
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

/**
 * An agent that cannot be handed anything new: it is answering, or it delegated and is waiting for
 * what it delegated. After an error or a stop it is free again.
 */
function isBusy(status: AgentStatus | undefined): boolean {
  return status === "working" || status === "waiting";
}

/**
 * The child a delegation names, by name (however it was capitalised) or by id.
 *
 * Both of these read the one matching rule out of `resolveDelegations`: the round hangs on who a
 * name lands on, and two copies of that rule is one too many.
 */
export function childFor(children: AgentConfig[], name: string): AgentConfig | undefined {
  return resolveDelegations([{ agent: name }], children).resolved[0];
}

/** True when not one of these delegations names somebody who is actually under this agent. */
export function noneLand(delegations: Delegation[], children: AgentConfig[]): boolean {
  return resolveDelegations(delegations, children).resolved.length === 0;
}

function processQueuedInstructions(agentId: string, projectId: string) {
  const store = useAppStore.getState();
  const runtime = store.runtime[projectId]?.[agentId];
  // Every run end calls this, and the end of the run that delegated is not the end of the work:
  // handing the message over there would have it run beside its own children.
  if (!runtime || isBusy(runtime.status)) return;

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

import { recordTurn, HISTORY_DIR, historyFileName } from "@/lib/agent-history";
import { writeSkillFiles, FOLDER } from "@/lib/project-folder";

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

/**
 * Cuts the turn short and hands the message over now.
 *
 * Nothing is lost: what the agent did is already on disk, and what it said is in the CLI's own
 * session, which the run that follows resumes. It is put at the head of the queue and the agent is
 * stopped; the drain that every stop ends in is what starts it.
 */
export async function sendNowInterrupting(agentId: string, projectId: string, index: number): Promise<void> {
  const store = useAppStore.getState();
  const queue = store.runtime[projectId]?.[agentId]?.queuedInstructions ?? [];
  const text = queue[index];
  if (text === undefined) return;

  const rest = queue.filter((_, i) => i !== index);
  // The agent has to know its last turn was cut, or it reads the transcript as a turn it finished.
  rest.unshift(`${translateNow("queued.interruptedNote")}

${text}`);
  useAppStore.setState(state => {
    const pRuntime = state.runtime[projectId] || {};
    return {
      runtime: { ...state.runtime, [projectId]: { ...pRuntime, [agentId]: { ...pRuntime[agentId], queuedInstructions: rest } } },
    };
  });

  await stopAgent(agentId, projectId);
}

export async function instructAgent(agentId: string, text: string, projectId: string, opts?: { model?: string }): Promise<void> {
  const store = useAppStore.getState();
  // The agent has to belong to this project's team: nobody else can be given work here.
  if (!selectProjectAgents(store, projectId).some(a => a.id === agentId)) return;
  const runtime = store.runtime[projectId]?.[agentId];

  addMessage({ projectId, fromAgentId: "user", toAgentId: agentId, kind: "instruction", text });

  if (isBusy(runtime?.status)) {
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

/**
 * Records a delegation that autonomous mode approved without asking — same `Approval` shape as a
 * normal one, already settled, so `pendingApprovals` never sees it and the thread stays quiet. What
 * makes it different from one the user approved is `auto: true`, which is all `autonomousReport`
 * needs to say what ran on its own overnight.
 */
function recordAutoApproval(input: Pick<Approval, "kind" | "agentId" | "toAgentId" | "summary" | "payload">): Approval {
  const now = Date.now();
  const approval: Approval = {
    id: crypto.randomUUID(),
    projectId: input.payload.projectId,
    createdAt: now,
    status: "approved",
    decidedAt: now,
    auto: true,
    ...input,
  };
  useAppStore.setState(state => ({ approvals: { ...state.approvals, [approval.id]: approval } }));
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
  addMessage({ projectId: approval.projectId, fromAgentId: "user", toAgentId: approval.toAgentId, kind: "system", text: `${translateNow("system.approved", { summary: approval.summary })}${note ? ` (${note})` : ""}` });
  const runId = startRun(approval.payload);
  taskSync.taskOnApprovalSettled(approval.id, true, runId);
}

export async function rejectApproval(approvalId: string, note?: string): Promise<void> {
  const approval = settleApproval(approvalId, "rejected", note);
  if (!approval) return;
  const store = useAppStore.getState();
  const { payload } = approval;
  addMessage({ projectId: approval.projectId, fromAgentId: "user", toAgentId: approval.toAgentId, kind: "system", text: `${translateNow("system.rejected", { summary: approval.summary })}${note ? ` (${note})` : ""}` });
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
    output: note ? translateNow("system.rejectedRunWithNote", { note }) : translateNow("system.rejectedRun"),
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
  for (const a of pending) settleApproval(a.id, "rejected", translateNow("system.stoppedByUser"));
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
  flushStream();
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
  flushStream();
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
