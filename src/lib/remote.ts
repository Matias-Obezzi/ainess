// LAN remote access: what the phone page sees (snapshot) and what it can do (commands).
// The HTTP server itself lives in the transport (Rust in the app, node:http in the CLI);
// this module is the shared, transport-agnostic part.
import { useAppStore, selectRoots, selectProjectAgents } from "@/store";
import { getTransport } from "@/lib/transport";
import { log } from "@/lib/logger";
import type { AgentConfig, AgentQuestion, AgentStatus, Approval, Binaries, Chat, ChatMessage, CommMessage, Run, Task, TaskStatus, ProviderId, ProviderQuota } from "@/types";
import { TASK_STATUSES } from "@/lib/tasks";
import { pendingApprovals } from "@/lib/approvals";
import { isForUser } from "@/lib/pending-question";
import { resolveLanguage, type Language } from "@/i18n";
import { translateNow } from "@/i18n/useT";

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
/** How often the push loop looks at whether any phone is connected. */
const CLIENT_WATCH_MS = 1500;

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
    questions: Object.values(s.questions).filter(q => q.status === "pending" && isForUser(q)).sort((a, b) => a.createdAt - b.createdAt),
    runs,
    chats: s.config.chats,
    chatMessages,
    binaries,
    activeChats,
    tasks: Object.values(s.tasks).flat(),
    quota: s.quota,
  };
}

/**
 * The snapshot together with its serialization. Deciding whether it has to be trimmed already
 * costs the bytes, so whoever needs the string gets it for free instead of serializing the same
 * object a second time on the way to the wire.
 */
function snapshotAndJson(): { snapshot: RemoteSnapshot; json: string } {
  const full = snapshotWith({ messages: MAX_MESSAGES, runs: MAX_RUNS_PER_PROJECT });
  const json = JSON.stringify(full);
  log.debug("remote", `snapshot of ${json.length} bytes (${full.messages.length} messages, ${full.runs.length} runs)`);
  if (json.length <= MAX_SNAPSHOT_BYTES) return { snapshot: full, json };
  const trimmed = snapshotWith(TRIMMED_LIMITS);
  const trimmedJson = JSON.stringify(trimmed);
  log.debug("remote", `snapshot trimmed to ${trimmedJson.length} bytes`);
  return { snapshot: trimmed, json: trimmedJson };
}

/** The snapshot as an object, for the `state` command, which answers with one. */
export function buildSnapshot(): RemoteSnapshot {
  return snapshotAndJson().snapshot;
}

/**
 * The snapshot already serialized, which is what every push wants: the SSE frame is text and the
 * Rust side broadcasts a string. A push lands every 300 ms while an autonomous run is going, so
 * the serialization it used to pay twice (three times when trimming) is paid once here.
 */
export function buildSnapshotJson(): string {
  return snapshotAndJson().json;
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
        if (!projectId || !s.config.projects.some(p => p.id === projectId)) return { error: translateNow("remote.err.invalidProject") };
        if (!text) return { error: translateNow("remote.err.missingText") };
        if (s.activeTaskRunId[projectId]) return { error: translateNow("remote.err.projectBusy") };
        const roots = selectRoots(s, projectId);
        const agentId = str("agentId") ?? (roots.find(a => a.role === "planner") ?? roots[0])?.id;
        if (!agentId || !selectProjectAgents(s, projectId).some(a => a.id === agentId)) return { error: translateNow("remote.err.invalidAgent") };
        await s.submitPrompt(text, agentId, projectId, { model: str("model") });
        return { ok: true, runId: useAppStore.getState().activeTaskRunId[projectId] };
      }
      case "diagnostics": {
        const { collectDiagnostics } = await import("@/lib/diagnostics");
        const { dictionaries, baseDictionary, translate, loadLanguage } = await import("@/i18n");
        const lang = resolveLanguage(s.config.language);
        await loadLanguage(lang);
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
        if (!projectId || !agentId || !text) return { error: translateNow("remote.err.missingData") };
        await s.instructAgent(agentId, text, projectId, { model: str("model") });
        return { ok: true };
      }
      case "stop": {
        // A chat turn is stopped on its own; everything else needs the project.
        const chatId = str("chatId");
        if (chatId) {
          if (!s.config.chats.some(c => c.id === chatId)) return { error: translateNow("remote.err.noChat") };
          await s.stopChat(chatId);
          return { ok: true };
        }
        const projectId = str("projectId");
        const agentId = str("agentId");
        if (!projectId) return { error: translateNow("remote.err.missingProject") };
        if (agentId) await s.stopAgent(agentId, projectId); else await s.stopAll(projectId);
        return { ok: true };
      }
      case "task": {
        // Creating comes with no task id: it is the one op that makes one.
        if (str("op") === "create") {
          const projectId = str("projectId");
          const title = str("title")?.trim();
          if (!projectId || !s.config.projects.some(p => p.id === projectId)) return { error: translateNow("remote.err.invalidProject") };
          if (!title) return { error: translateNow("remote.err.missingTitle") };
          const agentId = str("agentId");
          const task = s.addTask(projectId, {
            title,
            detail: str("detail"),
            ...(agentId && selectProjectAgents(s, projectId).some(a => a.id === agentId) ? { agentId } : {}),
          });
          return { ok: true, taskId: task.id };
        }
        const id = str("taskId");
        if (!id) return { error: translateNow("remote.err.missingTask") };
        const op = str("op") ?? "move";
        if (op === "archive") { s.archiveTask(id); return { ok: true }; }
        if (op === "delete") { s.removeTask(id); return { ok: true }; }
        const status = str("status");
        if (!status || !TASK_STATUSES.includes(status as TaskStatus)) return { error: translateNow("remote.err.invalidStatus") };
        s.moveTask(id, status as TaskStatus, typeof payload.index === "number" ? payload.index : 0);
        return { ok: true };
      }
      case "answer": {
        const id = str("questionId");
        const answer = Array.isArray(payload.answer)
          ? (payload.answer as unknown[]).filter((a): a is string => typeof a === "string" && a.trim().length > 0)
          : [];
        const target = id ? s.questions[id] : undefined;
        // A question waiting on its planner is not on offer here either: the phone never saw it,
        // and a hand-written command should not be able to answer it behind the planners back.
        if (!target || !isForUser(target)) return { error: translateNow("remote.err.noQuestion") };
        if (answer.length === 0) return { error: translateNow("remote.err.missingAnswer") };
        s.answerQuestion(target.id, answer);
        return { ok: true };
      }
      case "approve": {
        const id = str("approvalId");
        const decision = str("decision");
        if (!id || !s.approvals[id]) return { error: translateNow("remote.err.noApproval") };
        if (decision === "reject") await s.reject(id, str("note")); else await s.approve(id, str("note"));
        return { ok: true };
      }
      case "agent": {
        // The one thing about an agent the phone gets to change. Its whole config is not on
        // offer: a system prompt or a provider typed into a URL from a phone on the same wifi is
        // a different kind of reach than picking a model from the list it was shown.
        const projectId = str("projectId");
        const agentId = str("agentId");
        if (!projectId || !s.config.projects.some(p => p.id === projectId)) return { error: translateNow("remote.err.invalidProject") };
        if (!agentId || !selectProjectAgents(s, projectId).some(a => a.id === agentId)) return { error: translateNow("remote.err.invalidAgent") };
        // An empty string is how the phone says "no model of its own", which JSON cannot carry
        // as an absent key inside an object it also has to be able to send filled.
        const model = str("model")?.trim();
        s.updateAgent(projectId, agentId, { model: model || undefined });
        return { ok: true };
      }
      case "chat": {
        const chatId = str("chatId");
        const text = str("text")?.trim();
        if (!chatId || !text) return { error: translateNow("remote.err.missingData") };
        if (!s.config.chats.some(c => c.id === chatId)) return { error: translateNow("remote.err.noChat") };
        await s.sendChatMessage(chatId, text);
        return { ok: true };
      }
      case "state":
        return buildSnapshot() as unknown as Record<string, unknown>;
      default:
        return { error: translateNow("remote.err.unknownAction", { action }) };
    }
  } catch (e) {
    return { error: String(e instanceof Error ? e.message : e) };
  }
}

let attached = false;
let running = false;
let pushTimer: ReturnType<typeof setTimeout> | null = null;
/** Phones listening as of the last look. `null` while it is not known (nothing asked yet, or the backend did not answer). */
let clientCount: number | null = null;
/** Something changed while nobody was connected: whoever connects next has to be told. */
let pendingPush = false;
let watchTimer: ReturnType<typeof setInterval> | null = null;

function pushNow(): Promise<void> {
  pendingPush = false;
  return getTransport().remotePushState(buildSnapshotJson()).catch(() => {});
}

function schedulePush(): void {
  if (!running || pushTimer) return;
  pushTimer = setTimeout(() => {
    pushTimer = null;
    if (!running) return;
    // Building the snapshot walks every run, message and chat of every project and serializes the
    // lot, on the thread that draws the app. With nobody on the other end that is pure cost, so it
    // is not built at all — an unknown count (`null`) pushes anyway, because the old behaviour is
    // the safe default when we cannot tell.
    if (clientCount === 0) {
      pendingPush = true;
      return;
    }
    void pushNow();
  }, PUSH_THROTTLE_MS);
}

/**
 * Asks the backend how many phones are connected, and brings them up to date when that changed.
 *
 * The push on the 0 -> N transition is not an optimisation, it is what makes skipping pushes safe.
 * In the desktop app `GET /api/state` (`state_handler`, src-tauri/src/remote.rs) and the first
 * event of the SSE stream (`events`, same file) answer with the LAST SNAPSHOT PUSHED; they never
 * ask the webview for a fresh one. Only the CLI server (src/lib/remote-node.ts) calls the command
 * handler when a client connects. So a phone that shows up after we skipped pushes would be served
 * whatever was in memory — minutes old — until something else changed. Hence the push happens on
 * the transition even with no `pendingPush`: time alone makes the held snapshot wrong.
 */
async function refreshClientCount(): Promise<void> {
  let count: number | null = null;
  try {
    const status = await getTransport().remoteStatus();
    count = typeof status.clients === "number" ? status.clients : null;
  } catch {
    // Pushing to nobody is cheaper than a phone frozen on old state, so a failed look pushes again.
    count = null;
  }
  if (!running) return;
  const before = clientCount;
  clientCount = count;
  // The UI reads the count from the store, which only the poll in useRemoteSync keeps fresh and
  // which `startRemote` used to fill with a hardcoded zero.
  if (count !== null && count !== before) {
    useAppStore.setState(state => ({ remoteStatus: { ...state.remoteStatus, clients: count as number } }));
  }
  const appeared = count !== null && count > 0 && (before === null || before === 0);
  if (count !== 0 && (appeared || pendingPush)) await pushNow();
}

/** The watch lives here and not in a React hook: `ainess serve` mounts no React and behaves the same. */
function startClientWatch(): void {
  if (watchTimer) return;
  watchTimer = setInterval(() => { void refreshClientCount().catch(() => {}); }, CLIENT_WATCH_MS);
}

function stopClientWatch(): void {
  if (watchTimer) clearInterval(watchTimer);
  watchTimer = null;
  clientCount = null;
  pendingPush = false;
}

/**
 * Shared tail of starting and of adopting a server: learn who is listening, then bring them up to
 * date. `refreshClientCount` sends the first snapshot itself when a phone is already connected.
 */
async function beginPushing(): Promise<void> {
  running = true;
  await refreshClientCount();
  startClientWatch();
  if (clientCount === 0) pendingPush = true;
  else if (clientCount === null) await pushNow();
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
 * The boards are read lazily when a project is opened, and `ainess serve` opens none: without this
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
  await beginPushing();
}

export async function startRemote(portOverride?: number): Promise<RemoteStatus> {
  await attachRemote();
  await loadEveryBoard();
  const { remote } = useAppStore.getState().config;
  const port = portOverride ?? remote.port;
  const info = await getTransport().remoteStart(port, remote.token);
  await beginPushing();
  // A server that was already up answers `remoteStart` with itself, phones included, so the count
  // is whatever the backend reports — not the zero this used to claim.
  return { running: true, url: info.url, ip: info.ip, clients: clientCount ?? 0 };
}

export async function stopRemote(): Promise<void> {
  running = false;
  // A push already scheduled would otherwise land on a server that is going away.
  if (pushTimer) clearTimeout(pushTimer);
  pushTimer = null;
  stopClientWatch();
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
  if (!status.running) throw new Error(translateNow("remote.err.enableLocalFirst"));
  const info = await getTransport().tunnelStart(remote.tunnel.provider, remote.port, {
    domain: remote.tunnel.domain,
    tunnelName: remote.tunnel.tunnelName,
  });
  log.info("tunnel", `${remote.tunnel.provider} tunnel up`);
  return { running: true, url: info.url, provider: remote.tunnel.provider };
}

export async function stopTunnel(): Promise<void> {
  await getTransport().tunnelStop();
}
