// LAN remote access: what the phone page sees (snapshot) and what it can do (commands).
// The HTTP server itself lives in the transport (Rust in the app, node:http in the CLI);
// this module is the shared, transport-agnostic part.
import { useAppStore, selectRoots, selectProjectAgents } from "@/store";
import { getTransport } from "@/lib/transport";
import { log } from "@/lib/logger";
import type { AgentConfig, AgentQuestion, AgentStatus, Approval, Binaries, Chat, ChatMessage, CommMessage, Run, Task, TaskStatus, ProviderId, ProviderQuota } from "@/types";
import { TASK_STATUSES } from "@/lib/tasks";
import { pendingApprovals } from "@/lib/approvals";
import { resolveLanguage, type Language } from "@/i18n";

/**
 * Everything the phone needs to render the same React UI as the desktop app: the page is a
 * build of the app (see src/remote/), hydrates its store with this and never reads the disk.
 */
export interface RemoteSnapshot {
  serverTime: number;
  /** Already resolved: the phone shows the same language as the app, whatever its own system says. */
  language: Language;
  projects: Array<{ id: string; name: string; workspaceDir: string; color?: string; createdAt: number; activeTaskRunId: string | null; running: number }>;
  /** Every project's team, flattened; `projectId` says which one each agent belongs to. */
  agents: Array<Pick<AgentConfig, "id" | "name" | "provider" | "role" | "parentId" | "model" | "description" | "color"> & { projectId: string }>;
  runtime: Record<string, Record<string, { status: AgentStatus; currentTask?: string }>>;
  messages: CommMessage[];
  approvals: Approval[];
  /** Questions still waiting for an answer; the phone can answer them too. */
  questions: AgentQuestion[];
  /** Recent runs of every project, newest first, without `rawLines` (they never leave the PC). */
  runs: Array<Omit<Run, "rawLines">>;
  chats: Chat[];
  /** Only the chats already loaded in memory, newest messages last. */
  chatMessages: Record<string, ChatMessage[]>;
  /** Just the paths: the phone only uses this to know whether a provider's CLI exists. */
  binaries: Binaries;
  /** Chats with a turn in flight; `lib/chat.ts` keeps that in memory, out of reach of the phone. */
  activeChats: string[];
  /** Every project's board, flattened: each task already carries its `projectId`. */
  tasks: Task[];
  /** Latest quota fetched per provider, if any. */
  quota: Partial<Record<ProviderId, ProviderQuota>>;
}

export interface RemoteCommand {
  id: string;
  action: string;
  payload: Record<string, unknown>;
}

export interface RemoteStatus {
  running: boolean;
  url?: string;
  ip?: string;
  clients: number;
}

export interface TunnelStatus {
  running: boolean;
  /** Public URL of the tunnel, without the token. */
  url?: string;
  provider?: string;
  error?: string;
  /** true when the URL is fixed (static ngrok domain or cloudflared named tunnel). */
  fixed?: boolean;
}

const MAX_MESSAGES = 800;
const MAX_RUNS_PER_PROJECT = 60;
const MAX_CHAT_MESSAGES = 200;
const MAX_MESSAGE_CHARS = 8000;
const MAX_OUTPUT_CHARS = 20000;
/** Over this, the snapshot is rebuilt with half the history: a phone on 4G has to keep up. */
const MAX_SNAPSHOT_BYTES = 1_000_000;
const TRIMMED_LIMITS = { messages: 400, runs: 30 };
const PUSH_THROTTLE_MS = 300;

function clip(text: string, max: number): string {
  return text.length > max ? text.slice(0, max) + "…" : text;
}

function snapshotWith(limits: { messages: number; runs: number }): RemoteSnapshot {
  const s = useAppStore.getState();

  const runningByProject: Record<string, number> = {};
  const runsByProject = new Map<string, Run[]>();
  for (const r of Object.values(s.runs)) {
    if (r.status === "running") runningByProject[r.projectId] = (runningByProject[r.projectId] ?? 0) + 1;
    const list = runsByProject.get(r.projectId);
    if (list) list.push(r);
    else runsByProject.set(r.projectId, [r]);
  }

  // Newest runs win: an old task nobody scrolls to is not worth the bytes.
  const runs: Array<Omit<Run, "rawLines">> = [];
  for (const list of runsByProject.values()) {
    list.sort((a, b) => b.startedAt - a.startedAt);
    for (const run of list.slice(0, limits.runs)) {
      const { rawLines: _rawLines, ...rest } = run;
      runs.push({ ...rest, prompt: clip(run.prompt, MAX_OUTPUT_CHARS), output: clip(run.output, MAX_OUTPUT_CHARS) });
    }
  }

  const runtime: RemoteSnapshot["runtime"] = {};
  for (const [pid, agents] of Object.entries(s.runtime)) {
    runtime[pid] = {};
    for (const [aid, rt] of Object.entries(agents)) {
      runtime[pid][aid] = { status: rt.status, currentTask: rt.currentTask ? rt.currentTask.slice(0, 200) : undefined };
    }
  }

  const chatMessages: Record<string, ChatMessage[]> = {};
  const activeChats: string[] = [];
  for (const [chatId, msgs] of Object.entries(s.chatMessages)) {
    chatMessages[chatId] = msgs.slice(-MAX_CHAT_MESSAGES).map(m => ({ ...m, text: clip(m.text, MAX_MESSAGE_CHARS) }));
    if (msgs.some(m => m.status === "pending")) activeChats.push(chatId);
  }

  const binaries: Binaries = {};
  for (const [provider, info] of Object.entries(s.binaries)) {
    binaries[provider as keyof Binaries] = info ? { path: info.path } : null;
  }

  return {
    serverTime: Date.now(),
    language: resolveLanguage(s.config.language),
    projects: s.config.projects.map(p => ({
      id: p.id,
      name: p.name,
      workspaceDir: p.workspaceDir,
      color: p.color,
      createdAt: p.createdAt,
      activeTaskRunId: s.activeTaskRunId[p.id] ?? null,
      running: runningByProject[p.id] ?? 0,
    })),
    agents: s.config.projects.flatMap(p => (p.agents ?? []).map(a => ({
      id: a.id, name: a.name, provider: a.provider, role: a.role, parentId: a.parentId,
      model: a.model, description: a.description, color: a.color, projectId: p.id,
    }))),
    runtime,
    messages: s.messages.slice(-limits.messages).map(m => ({ ...m, text: clip(m.text, MAX_MESSAGE_CHARS) })),
    approvals: pendingApprovals(s.approvals, s.config.projects),
    questions: Object.values(s.questions).filter(q => q.status === "pending").sort((a, b) => a.createdAt - b.createdAt),
    runs,
    chats: s.config.chats,
    chatMessages,
    binaries,
    activeChats,
    tasks: Object.values(s.tasks).flat(),
    quota: s.quota,
  };
}

export function buildSnapshot(): RemoteSnapshot {
  const full = snapshotWith({ messages: MAX_MESSAGES, runs: MAX_RUNS_PER_PROJECT });
  const size = JSON.stringify(full).length;
  log.debug("remote", `snapshot de ${size} bytes (${full.messages.length} mensajes, ${full.runs.length} runs)`);
  if (size <= MAX_SNAPSHOT_BYTES) return full;
  const trimmed = snapshotWith(TRIMMED_LIMITS);
  log.debug("remote", `snapshot recortado a ${JSON.stringify(trimmed).length} bytes`);
  return trimmed;
}

/** Executes a command coming from the phone page. Never throws: errors are returned. */
export async function handleRemoteCommand(action: string, payload: Record<string, unknown>): Promise<Record<string, unknown>> {
  const s = useAppStore.getState();
  const str = (k: string) => (typeof payload[k] === "string" ? (payload[k] as string) : undefined);
  try {
    switch (action) {
      case "prompt": {
        const projectId = str("projectId");
        const text = str("text")?.trim();
        if (!projectId || !s.config.projects.some(p => p.id === projectId)) return { error: "Proyecto inválido" };
        if (!text) return { error: "Falta el texto" };
        if (s.activeTaskRunId[projectId]) return { error: "Ya hay una tarea en curso en este proyecto. Usá una instrucción o detenela." };
        const roots = selectRoots(s, projectId);
        const agentId = str("agentId") ?? (roots.find(a => a.role === "planner") ?? roots[0])?.id;
        if (!agentId || !selectProjectAgents(s, projectId).some(a => a.id === agentId)) return { error: "Agente inválido" };
        await s.submitPrompt(text, agentId, projectId, { model: str("model") });
        return { ok: true, runId: useAppStore.getState().activeTaskRunId[projectId] };
      }
      case "diagnostics": {
        const { collectDiagnostics } = await import("@/lib/diagnostics");
        const { dictionaries, baseDictionary, translate } = await import("@/i18n");
        const lang = resolveLanguage(s.config.language);
        const dict = dictionaries[lang] ?? baseDictionary;
        const t = (key: string, vars?: Record<string, string | number>) => translate(dict, baseDictionary, key, vars);
        const refreshQuota = payload.refreshQuota === true;
        const results = await collectDiagnostics(t, { refreshQuota });
        return { results };
      }
      case "instruct": {
        const projectId = str("projectId");
        const agentId = str("agentId");
        const text = str("text")?.trim();
        if (!projectId || !agentId || !text) return { error: "Faltan datos" };
        await s.instructAgent(agentId, text, projectId, { model: str("model") });
        return { ok: true };
      }
      case "stop": {
        // A chat turn is stopped on its own; everything else needs the project.
        const chatId = str("chatId");
        if (chatId) {
          if (!s.config.chats.some(c => c.id === chatId)) return { error: "Chat inexistente" };
          await s.stopChat(chatId);
          return { ok: true };
        }
        const projectId = str("projectId");
        const agentId = str("agentId");
        if (!projectId) return { error: "Falta el proyecto" };
        if (agentId) await s.stopAgent(agentId, projectId); else await s.stopAll(projectId);
        return { ok: true };
      }
      case "task": {
        // Creating comes with no task id: it is the one op that makes one.
        if (str("op") === "create") {
          const projectId = str("projectId");
          const title = str("title")?.trim();
          if (!projectId || !s.config.projects.some(p => p.id === projectId)) return { error: "Proyecto inválido" };
          if (!title) return { error: "Falta el título" };
          const agentId = str("agentId");
          const task = s.addTask(projectId, {
            title,
            detail: str("detail"),
            ...(agentId && selectProjectAgents(s, projectId).some(a => a.id === agentId) ? { agentId } : {}),
          });
          return { ok: true, taskId: task.id };
        }
        const id = str("taskId");
        if (!id) return { error: "Falta la tarea" };
        const op = str("op") ?? "move";
        if (op === "archive") { s.archiveTask(id); return { ok: true }; }
        if (op === "delete") { s.removeTask(id); return { ok: true }; }
        const status = str("status");
        if (!status || !TASK_STATUSES.includes(status as TaskStatus)) return { error: "Estado inválido" };
        s.moveTask(id, status as TaskStatus, typeof payload.index === "number" ? payload.index : 0);
        return { ok: true };
      }
      case "answer": {
        const id = str("questionId");
        const answer = Array.isArray(payload.answer)
          ? (payload.answer as unknown[]).filter((a): a is string => typeof a === "string" && a.trim().length > 0)
          : [];
        if (!id || !s.questions[id]) return { error: "Pregunta inexistente" };
        if (answer.length === 0) return { error: "Falta la respuesta" };
        s.answerQuestion(id, answer);
        return { ok: true };
      }
      case "approve": {
        const id = str("approvalId");
        const decision = str("decision");
        if (!id || !s.approvals[id]) return { error: "Aprobación inexistente" };
        if (decision === "reject") await s.reject(id, str("note")); else await s.approve(id, str("note"));
        return { ok: true };
      }
      case "chat": {
        const chatId = str("chatId");
        const text = str("text")?.trim();
        if (!chatId || !text) return { error: "Faltan datos" };
        if (!s.config.chats.some(c => c.id === chatId)) return { error: "Chat inexistente" };
        await s.sendChatMessage(chatId, text);
        return { ok: true };
      }
      case "state":
        return buildSnapshot() as unknown as Record<string, unknown>;
      default:
        return { error: `Acción desconocida: ${action}` };
    }
  } catch (e) {
    return { error: String(e instanceof Error ? e.message : e) };
  }
}

let attached = false;
let running = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;

function schedulePush(): void {
  if (!running || pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    void getTransport().remotePushState(buildSnapshot()).catch(() => {});
  }, PUSH_THROTTLE_MS);
}

/** Wire the store to the server once: push snapshots on change, answer commands. */
export async function attachRemote(): Promise<void> {
  if (attached) return;
  attached = true;
  useAppStore.subscribe((state, prev) => {
    if (state.runs !== prev.runs || state.messages !== prev.messages || state.runtime !== prev.runtime ||
        state.approvals !== prev.approvals || state.activeTaskRunId !== prev.activeTaskRunId ||
        state.chatMessages !== prev.chatMessages || state.binaries !== prev.binaries || state.config !== prev.config) {
      schedulePush();
    }
  });
  await getTransport().onRemoteCommand(cmd => handleRemoteCommand(cmd.action, cmd.payload ?? {}));
}

/**
 * The boards are read lazily when a project is opened, and `ais serve` opens none: without this
 * the phone would get an empty Tasks tab from a CLI server.
 */
async function loadEveryBoard(): Promise<void> {
  const store = useAppStore.getState();
  await Promise.all(store.config.projects.map(p => store.loadTasks(p.id).catch(() => {})));
}

/**
 * Wires this process to a server that is already listening instead of starting a second one.
 *
 * The server lives in the backend, so it survives a reload of the frontend — but `attached` and
 * `running` are module state that comes back false, and `schedulePush` does nothing while
 * `running` is false. Adopting the server is what keeps the phone updated: without it the page
 * sat on the snapshot from before the reload and never saw, say, a project created afterwards.
 */
export async function adoptRemote(): Promise<void> {
  if (running) return;
  await attachRemote();
  await loadEveryBoard();
  running = true;
  await getTransport().remotePushState(buildSnapshot()).catch(() => {});
}

export async function startRemote(portOverride?: number): Promise<RemoteStatus> {
  await attachRemote();
  await loadEveryBoard();
  const { remote } = useAppStore.getState().config;
  const port = portOverride ?? remote.port;
  const info = await getTransport().remoteStart(port, remote.token);
  running = true;
  await getTransport().remotePushState(buildSnapshot()).catch(() => {});
  return { running: true, url: info.url, ip: info.ip, clients: 0 };
}

export async function stopRemote(): Promise<void> {
  running = false;
  await getTransport().remoteStop();
}

export function remoteUrl(ip: string, port: number, token: string): string {
  return `http://${ip}:${port}/?token=${encodeURIComponent(token)}`;
}

/** Public URL of the tunnel with the token appended, ready to open on a phone. */
export function tunnelUrl(publicUrl: string, token: string): string {
  return `${publicUrl.replace(/\/$/, "")}/?token=${encodeURIComponent(token)}`;
}

/**
 * Opens the public tunnel. The LAN server has to be up first: the tunnel just forwards
 * `127.0.0.1:<port>`, so without it every request would 502.
 */
export async function startTunnel(): Promise<TunnelStatus> {
  const { remote } = useAppStore.getState().config;
  const status = await getTransport().remoteStatus();
  if (!status.running) throw new Error("Prendé primero el acceso remoto local");
  const info = await getTransport().tunnelStart(remote.tunnel.provider, remote.port, {
    domain: remote.tunnel.domain,
    tunnelName: remote.tunnel.tunnelName,
  });
  log.info("tunnel", `túnel ${remote.tunnel.provider} activo`);
  return { running: true, url: info.url, provider: remote.tunnel.provider };
}

export async function stopTunnel(): Promise<void> {
  await getTransport().tunnelStop();
}
