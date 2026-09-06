// Glue between the phone page and the PC: reads the token, keeps the SSE connection open,
// pours every snapshot into the store and replaces the store actions that do something with
// the matching HTTP call. See src/lib/remote.ts for the other side of the protocol.
import { useAppStore } from "@/store";
import { toast } from "@/components/ui/toast";
import type { RemoteSnapshot } from "@/lib/remote";
import type { AgentConfig, AgentRuntime, Approval, Project, Run, Task } from "@/types";

/** Session storage, not local: the token dies with the tab, like a phone browser session. */
const TOKEN_KEY = "ais.remote.token";
const RECONNECT_MIN_MS = 1000;
const RECONNECT_MAX_MS = 10000;

const NOT_ON_PHONE = "Esto se edita desde la app de escritorio";

export class RemoteError extends Error {
  constructor(message: string, readonly status: number) {
    super(message);
    this.name = "RemoteError";
  }
}

let cachedToken: string | null | undefined;

/**
 * The token from `?token=…` (the QR link), remembered for the tab. The URL is cleaned right
 * away so the secret never sits in the address bar, the history or a screenshot.
 */
export function getToken(): string | null {
  if (cachedToken !== undefined) return cachedToken;
  let token: string | null = null;
  try {
    const url = new URL(window.location.href);
    token = url.searchParams.get("token");
    if (token) {
      try { sessionStorage.setItem(TOKEN_KEY, token); } catch { /* private mode */ }
      url.searchParams.delete("token");
      window.history.replaceState(null, "", `${url.pathname}${url.search}${url.hash}`);
    }
  } catch { /* malformed URL */ }
  if (!token) {
    try { token = sessionStorage.getItem(TOKEN_KEY); } catch { /* private mode */ }
  }
  cachedToken = token;
  return token;
}

/** One request to the PC. Throws `RemoteError` on an HTTP error or an `{ error }` body. */
export async function api(path: string, body?: Record<string, unknown>): Promise<Record<string, unknown>> {
  const res = await fetch(path, {
    method: body ? "POST" : "GET",
    headers: { Authorization: `Bearer ${getToken() ?? ""}`, "Content-Type": "application/json" },
    body: body ? JSON.stringify(body) : undefined,
  });
  const json = (await res.json().catch(() => ({}))) as Record<string, unknown>;
  if (!res.ok || typeof json.error === "string") {
    throw new RemoteError(typeof json.error === "string" ? json.error : `HTTP ${res.status}`, res.status);
  }
  return json;
}

/**
 * Keeps an EventSource on `/api/events` alive, reconnecting with a 1→10 s backoff.
 * Returns the teardown.
 */
export function connectEvents(handlers: {
  onState: (snapshot: RemoteSnapshot) => void;
  onConnected: () => void;
  onDisconnected: () => void;
}): () => void {
  let source: EventSource | null = null;
  let timer: ReturnType<typeof setTimeout> | null = null;
  let delay = RECONNECT_MIN_MS;
  let closed = false;

  const open = () => {
    if (closed) return;
    source = new EventSource(`/api/events?token=${encodeURIComponent(getToken() ?? "")}`);
    source.addEventListener("state", (event) => {
      delay = RECONNECT_MIN_MS;
      handlers.onConnected();
      try {
        handlers.onState(JSON.parse((event as MessageEvent<string>).data) as RemoteSnapshot);
      } catch {
        // A truncated frame is not worth killing the connection over: the next one is whole.
      }
    });
    source.onerror = () => {
      source?.close();
      source = null;
      handlers.onDisconnected();
      if (closed) return;
      timer = setTimeout(open, delay);
      delay = Math.min(delay * 2, RECONNECT_MAX_MS);
    };
  };

  open();
  return () => {
    closed = true;
    if (timer) clearTimeout(timer);
    source?.close();
  };
}

/** Pours a snapshot into the store, leaving the phone's own navigation alone. */
export function hydrate(snapshot: RemoteSnapshot): void {
  const runtime: Record<string, Record<string, AgentRuntime>> = {};
  for (const [projectId, agents] of Object.entries(snapshot.runtime)) {
    runtime[projectId] = {};
    for (const [agentId, rt] of Object.entries(agents)) {
      runtime[projectId][agentId] = { agentId, status: rt.status, currentTask: rt.currentTask, queuedInstructions: [] };
    }
  }

  const runs: Record<string, Run> = {};
  for (const run of snapshot.runs) runs[run.id] = { ...run, rawLines: [] };

  const approvals: Record<string, Approval> = {};
  for (const approval of snapshot.approvals) approvals[approval.id] = approval;

  // The phone never edits agents, so the fields it does not get can take their safe default.
  const agentsByProject = new Map<string, AgentConfig[]>();
  for (const { projectId, ...a } of snapshot.agents) {
    const agent: AgentConfig = { ...a, autoApprove: false };
    const list = agentsByProject.get(projectId);
    if (list) list.push(agent);
    else agentsByProject.set(projectId, [agent]);
  }

  const activeTaskRunId: Record<string, string | null> = {};
  const projects: Project[] = [];
  for (const p of snapshot.projects) {
    activeTaskRunId[p.id] = p.activeTaskRunId;
    projects.push({
      id: p.id, name: p.name, workspaceDir: p.workspaceDir, color: p.color, createdAt: p.createdAt,
      agents: agentsByProject.get(p.id) ?? [],
    });
  }

  const tasks: Record<string, Task[]> = {};
  for (const task of snapshot.tasks) {
    (tasks[task.projectId] ??= []).push(task);
  }

  useAppStore.setState(state => ({
    loaded: true,
    config: { ...state.config, projects, chats: snapshot.chats, language: snapshot.language },
    runtime,
    runs,
    messages: snapshot.messages,
    approvals,
    activeTaskRunId,
    chatMessages: snapshot.chatMessages,
    binaries: snapshot.binaries,
    remoteActiveChats: snapshot.activeChats,
    tasks,
    // Nothing is ever read from disk here, so no skeleton should ever be waiting for it.
    historyLoading: {},
    chatLoading: {},
  }));
}

/**
 * Replaces every store action that runs something with its HTTP call. Called once, right
 * after the first snapshot, so the components can be reused untouched.
 */
export function installRemoteActions(): void {
  const call = async (path: string, body: Record<string, unknown>): Promise<void> => {
    try {
      await api(path, body);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : String(e));
    }
  };
  const refuse = () => { toast.error(NOT_ON_PHONE); };

  useAppStore.setState({
    submitPrompt: (text, targetAgentId, projectId, opts) =>
      call("/api/prompt", { projectId, agentId: targetAgentId, text, model: opts?.model }),
    instructAgent: (agentId, text, projectId, opts) =>
      call("/api/instruct", { projectId, agentId, text, model: opts?.model }),
    stopAgent: (agentId, projectId) => call("/api/stop", { projectId, agentId }),
    stopAll: (projectId) => call("/api/stop", { projectId }),
    approve: (approvalId, note) => call("/api/approve", { approvalId, decision: "approve", note }),
    reject: (approvalId, note) => call("/api/approve", { approvalId, decision: "reject", note }),
    sendChatMessage: (chatId, text) => call("/api/chat", { chatId, text }),
    moveTask: (taskId, status, index) => { void call("/api/task", { taskId, op: "move", status, index }); },
    archiveTask: (taskId) => { void call("/api/task", { taskId, op: "archive" }); },
    removeTask: (taskId) => { void call("/api/task", { taskId, op: "delete" }); },
    stopChat: (chatId) => call("/api/stop", { chatId }),
    // The snapshot is the only source of truth here: nothing to load, nothing to persist.
    saveConfig: async () => {},
    loadChatMessages: async () => {},
    // Configuration stays on the desktop app (see "Fuera de alcance" in the plan).
    createChat: () => { refuse(); return ""; },
    updateChat: refuse,
    removeChat: refuse,
  });
}
