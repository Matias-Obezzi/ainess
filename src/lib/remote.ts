// LAN remote access: what the phone page sees (snapshot) and what it can do (commands).
// The HTTP server itself lives in the transport (Rust in the app, node:http in the CLI);
// this module is the shared, transport-agnostic part.
import { useAppStore, selectRoots, selectProjectAgents } from "@/store";
import { getTransport } from "@/lib/transport";
import { log } from "@/lib/logger";
import type { AgentConfig, AgentQuestion, AgentStatus, Approval, Binaries, BoardSource, Chat, ChatMessage, ChatParticipant, CommMessage, Run, Task, TaskStatus, ProviderId, ProviderQuota } from "@/types";
import type { RepoState } from "@/lib/git-repo";
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
  projects: Array<{ id: string; name: string; workspaceDir: string; repoDir?: string; color?: string; createdAt: number; activeTaskRunId: string | null; running: number; board?: BoardSource; autonomous?: { until: number } }>;
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
  /** Cached git repository status per project so branch badges and diff panels work remotely. */
  repoState?: Record<string, RepoState>;
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
/**
 * While an agent streams, a change lands every 80 ms and each push rebuilds the whole snapshot on the
 * thread that draws the app. A phone reading along is just as well served a little less often.
 */
const PUSH_THROTTLE_STREAMING_MS = 1500;
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
      repoDir: p.repoDir,
      board: p.board,
      autonomous: p.autonomous,
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
    repoState: s.repoState,
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

const SAFE_GIT_SUBCOMMANDS = new Set(["diff", "status", "ls-files", "log", "rev-parse", "branch", "show"]);
const SAFE_BRANCH_FLAGS = new Set(["--show-current", "--list", "-a", "-r", "-v", "-vv", "--all"]);

export function isSafeGitArgs(args: string[]): boolean {
  if (!Array.isArray(args) || args.length === 0) return false;
  const subcmd = args[0];
  if (!SAFE_GIT_SUBCOMMANDS.has(subcmd)) return false;

  for (const arg of args) {
    if (typeof arg !== "string") return false;
    if (arg === "-o" || arg === "--output" || arg.startsWith("--output=")) {
      return false;
    }
  }

  if (subcmd === "branch") {
    const extra = args.slice(1);
    for (const arg of extra) {
      if (!SAFE_BRANCH_FLAGS.has(arg)) {
        return false;
      }
    }
  }

  return true;
}

function normFsPath(p: string): string {
  let forward = p.replace(/\\/g, "/").replace(/\/+$/, "");
  if (forward.startsWith("//?/")) forward = forward.slice(4);
  return /^[A-Za-z]:(\/|$)/.test(forward) ? forward[0].toLowerCase() + forward.slice(1) : forward;
}

export function isAllowedWorkspacePath(targetPath: string, allowedRoots: string[]): boolean {
  if (!targetPath || typeof targetPath !== "string") return false;
  const forward = targetPath.replace(/\\/g, "/");
  if (/(^|\/)\.\.(\/|$)/.test(forward)) return false;
  const normTarget = normFsPath(forward);
  return allowedRoots.some(root => {
    if (!root) return false;
    const normRoot = normFsPath(root);
    return normTarget === normRoot || normTarget.startsWith(`${normRoot}/`);
  });
}

export function isAllowedAttachmentWritePath(targetPath: string, workspaceDirs: string[]): boolean {
  if (!targetPath || typeof targetPath !== "string") return false;
  const forward = targetPath.replace(/\\/g, "/");
  if (/(^|\/)\.\.(\/|$)/.test(forward)) return false;
  const normTarget = normFsPath(forward);
  return workspaceDirs.some(dir => {
    if (!dir) return false;
    const prefix = `${normFsPath(dir)}/.ainess/attachments/`;
    if (!normTarget.startsWith(prefix)) return false;
    const rest = normTarget.slice(prefix.length);
    return rest.length > 0 && !rest.includes("/");
  });
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
        if (Array.isArray(payload.items)) {
          const valid: Array<{ questionId: string; answer: string[] }> = [];
          for (const raw of payload.items as unknown[]) {
            if (!raw || typeof raw !== "object") continue;
            const entry = raw as Record<string, unknown>;
            const qid = typeof entry.questionId === "string" ? entry.questionId : undefined;
            const ans = Array.isArray(entry.answer)
              ? (entry.answer as unknown[]).filter((a): a is string => typeof a === "string" && a.trim().length > 0)
              : [];
            const q = qid ? s.questions[qid] : undefined;
            if (q && isForUser(q) && ans.length > 0) valid.push({ questionId: q.id, answer: ans });
          }
          if (valid.length === 0) return { error: translateNow("remote.err.missingAnswer") };
          s.answerQuestions(valid);
          return { ok: true };
        }
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
        const op = str("op");
        if (op === "create") {
          const projectId = str("projectId");
          const name = str("name")?.trim();
          const mode = (str("mode") ?? "individual") as Chat["mode"];
          const participants = Array.isArray(payload.participants) ? (payload.participants as ChatParticipant[]) : [];
          if (!projectId || !s.config.projects.some(p => p.id === projectId)) return { error: translateNow("remote.err.invalidProject") };
          if (!name || participants.length === 0) return { error: translateNow("remote.err.missingData") };
          const projectAgents = new Set(selectProjectAgents(s, projectId).map(a => a.id));
          const valid = participants.every(p => p && typeof p === "object" && typeof p.agentId === "string" && projectAgents.has(p.agentId));
          if (!valid) return { error: translateNow("remote.err.invalidAgent") };
          const id = await s.createChat({ projectId, name, mode, participants });
          return { ok: true, chatId: id };
        }
        if (op === "update") {
          const chatId = str("chatId");
          const chat = s.config.chats.find(c => c.id === chatId);
          if (!chatId || !chat) return { error: translateNow("remote.err.noChat") };
          const rawPatch = (payload.patch && typeof payload.patch === "object" ? payload.patch : {}) as Record<string, unknown>;
          const cleanPatch: Partial<Pick<Chat, "name" | "participants">> = {};
          if (typeof rawPatch.name === "string" && rawPatch.name.trim()) {
            cleanPatch.name = rawPatch.name.trim();
          }
          if (Array.isArray(rawPatch.participants)) {
            const projectAgents = new Set(selectProjectAgents(s, chat.projectId).map(a => a.id));
            const parts = rawPatch.participants as ChatParticipant[];
            const valid = parts.length > 0 && parts.every(p => p && typeof p === "object" && typeof p.agentId === "string" && projectAgents.has(p.agentId));
            if (!valid) return { error: translateNow("remote.err.invalidAgent") };
            cleanPatch.participants = parts;
          }
          s.updateChat(chatId, cleanPatch);
          return { ok: true };
        }
        if (op === "delete") {
          const chatId = str("chatId");
          if (!chatId || !s.config.chats.some(c => c.id === chatId)) return { error: translateNow("remote.err.noChat") };
          s.removeChat(chatId);
          return { ok: true };
        }
        const chatId = str("chatId");
        const text = str("text")?.trim();
        if (!chatId || !text) return { error: translateNow("remote.err.missingData") };
        if (!s.config.chats.some(c => c.id === chatId)) return { error: translateNow("remote.err.noChat") };
        await s.sendChatMessage(chatId, text);
        return { ok: true };
      }
      case "project": {
        const op = str("op");
        const projectId = str("projectId");
        if (!projectId || !s.config.projects.some(p => p.id === projectId)) return { error: translateNow("remote.err.invalidProject") };
        if (op === "resetSession") {
          const agentId = str("agentId");
          if (agentId) {
            s.resetSession(agentId, projectId);
          } else {
            for (const a of selectProjectAgents(s, projectId)) s.resetSession(a.id, projectId);
          }
          return { ok: true };
        }
        if (op === "setAutonomous") {
          const until = typeof payload.until === "number" ? payload.until : null;
          s.setAutonomous(projectId, until);
          return { ok: true };
        }
        if (op === "clearMessages") {
          s.clearMessages(projectId);
          return { ok: true };
        }
        return { error: translateNow("remote.err.unknownAction", { action: `project:${op ?? ""}` }) };
      }
      case "fs": {
        const op = str("op");
        const workspaceDirs = s.config.projects.map(p => p.workspaceDir).filter(Boolean);
        const allowedRoots = [
          ...workspaceDirs,
          ...s.config.projects.map(p => p.repoDir).filter((d): d is string => !!d),
          ...Object.values(s.worktrees).flat().map(w => w.path).filter(Boolean),
        ];
        const realRoots = await Promise.all(allowedRoots.map(r => getTransport().realPath(r)));
        const realWorkspaces = await Promise.all(workspaceDirs.map(w => getTransport().realPath(w)));

        if (op === "writeBytes") {
          const path = str("path");
          const base64 = str("base64");
          if (!path || base64 === undefined) {
            return { error: translateNow("remote.err.missingData") };
          }
          const real = await getTransport().realPath(path);
          if (!isAllowedAttachmentWritePath(path, workspaceDirs) || !isAllowedAttachmentWritePath(real, realWorkspaces)) {
            return { error: translateNow("remote.err.missingData") };
          }
          await getTransport().writeFileBytes(path, base64);
          return { ok: true };
        }
        if (op === "readBytes") {
          const path = str("path");
          const maxBytes = typeof payload.maxBytes === "number" ? Math.min(payload.maxBytes, 25 * 1024 * 1024) : 4 * 1024 * 1024;
          if (!path) return { ok: true, data: null };
          const real = await getTransport().realPath(path);
          if (!isAllowedWorkspacePath(path, allowedRoots) || !isAllowedWorkspacePath(real, realRoots)) return { ok: true, data: null };
          const data = await getTransport().readFileBytes(path, maxBytes);
          return { ok: true, data };
        }
        if (op === "readText") {
          const path = str("path");
          if (!path) return { ok: true, text: null };
          const real = await getTransport().realPath(path);
          if (!isAllowedWorkspacePath(path, allowedRoots) || !isAllowedWorkspacePath(real, realRoots)) return { ok: true, text: null };
          const text = await getTransport().readFileAbs(path);
          return { ok: true, text };
        }
        if (op === "exists") {
          const rawPaths = Array.isArray(payload.paths) ? (payload.paths as unknown[]).filter((p): p is string => typeof p === "string") : [];
          const checked: string[] = [];
          for (const p of rawPaths) {
            const real = await getTransport().realPath(p);
            if (isAllowedWorkspacePath(p, allowedRoots) && isAllowedWorkspacePath(real, realRoots)) {
              checked.push(p);
            }
          }
          const paths = checked.length > 0 ? await getTransport().filesExistAbs(checked) : [];
          return { ok: true, paths };
        }
        if (op === "git") {
          const cwd = str("cwd");
          const args = Array.isArray(payload.args) ? (payload.args as unknown[]).filter((a): a is string => typeof a === "string") : [];
          const timeoutSecs = typeof payload.timeoutSecs === "number" ? Math.min(payload.timeoutSecs, 30) : 10;
          if (!cwd) return { ok: true, code: 1, stdout: "", stderr: "Denied" };
          const realCwd = await getTransport().realPath(cwd);
          if (!isAllowedWorkspacePath(cwd, allowedRoots) || !isAllowedWorkspacePath(realCwd, realRoots) || !isSafeGitArgs(args)) {
            return { ok: true, code: 1, stdout: "", stderr: "Denied" };
          }
          const res = await getTransport().exec("git", args, cwd, timeoutSecs);
          return { ok: true, code: res.code, stdout: res.stdout, stderr: res.stderr };
        }
        return { error: translateNow("remote.err.unknownAction", { action: `fs:${op ?? ""}` }) };
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
  }, Object.values(useAppStore.getState().runs).some(r => r.status === "running") ? PUSH_THROTTLE_STREAMING_MS : PUSH_THROTTLE_MS);
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
        state.chatMessages !== prev.chatMessages || state.binaries !== prev.binaries || state.config !== prev.config ||
        state.tasks !== prev.tasks || state.questions !== prev.questions || state.repoState !== prev.repoState) {
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
