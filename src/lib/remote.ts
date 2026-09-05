// LAN remote access: what the phone page sees (snapshot) and what it can do (commands).
// The HTTP server itself lives in the transport (Rust in the app, node:http in the CLI);
// this module is the shared, transport-agnostic part.
import { useAppStore, selectRoots } from "@/store";
import { getTransport } from "@/lib/transport";
import { log } from "@/lib/logger";
import type { Approval, CommMessage } from "@/types";

export interface RemoteSnapshot {
  serverTime: number;
  projects: Array<{ id: string; name: string; workspaceDir: string; activeTaskRunId: string | null; running: number }>;
  agents: Array<{ id: string; name: string; provider: string; role: string; parentId: string | null; color?: string }>;
  runtime: Record<string, Record<string, { status: string; currentTask?: string }>>;
  messages: CommMessage[];
  approvals: Approval[];
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
}

const MAX_MESSAGES = 150;
const PUSH_THROTTLE_MS = 300;

export function buildSnapshot(): RemoteSnapshot {
  const s = useAppStore.getState();
  const runningByProject: Record<string, number> = {};
  for (const r of Object.values(s.runs)) {
    if (r.status === "running") runningByProject[r.projectId] = (runningByProject[r.projectId] ?? 0) + 1;
  }
  const runtime: RemoteSnapshot["runtime"] = {};
  for (const [pid, agents] of Object.entries(s.runtime)) {
    runtime[pid] = {};
    for (const [aid, rt] of Object.entries(agents)) {
      runtime[pid][aid] = { status: rt.status, currentTask: rt.currentTask ? rt.currentTask.slice(0, 200) : undefined };
    }
  }
  return {
    serverTime: Date.now(),
    projects: s.config.projects.map(p => ({
      id: p.id,
      name: p.name,
      workspaceDir: p.workspaceDir,
      activeTaskRunId: s.activeTaskRunId[p.id] ?? null,
      running: runningByProject[p.id] ?? 0,
    })),
    agents: s.config.agents.map(a => ({ id: a.id, name: a.name, provider: a.provider, role: a.role, parentId: a.parentId, color: a.color })),
    runtime,
    messages: s.messages.slice(-MAX_MESSAGES).map(m => ({ ...m, text: m.text.length > 2000 ? m.text.slice(0, 2000) + "…" : m.text })),
    approvals: Object.values(s.approvals).filter(a => a.status === "pending").sort((a, b) => a.createdAt - b.createdAt),
  };
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
        const roots = selectRoots(s);
        const agentId = str("agentId") ?? (roots.find(a => a.role === "planner") ?? roots[0])?.id;
        if (!agentId || !s.config.agents.some(a => a.id === agentId)) return { error: "Agente inválido" };
        await s.submitPrompt(text, agentId, projectId, { model: str("model") });
        return { ok: true, runId: useAppStore.getState().activeTaskRunId[projectId] };
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
        const projectId = str("projectId");
        const agentId = str("agentId");
        if (!projectId) return { error: "Falta el proyecto" };
        if (agentId) await s.stopAgent(agentId, projectId); else await s.stopAll(projectId);
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
        state.approvals !== prev.approvals || state.activeTaskRunId !== prev.activeTaskRunId || state.config !== prev.config) {
      schedulePush();
    }
  });
  await getTransport().onRemoteCommand(cmd => handleRemoteCommand(cmd.action, cmd.payload ?? {}));
}

export async function startRemote(portOverride?: number): Promise<RemoteStatus> {
  await attachRemote();
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
  const info = await getTransport().tunnelStart(remote.tunnel.provider, remote.port);
  log.info("tunnel", `túnel ${remote.tunnel.provider} activo`);
  return { running: true, url: info.url, provider: remote.tunnel.provider };
}

export async function stopTunnel(): Promise<void> {
  await getTransport().tunnelStop();
}
