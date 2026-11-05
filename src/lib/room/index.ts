// A project's room: a channel between the orchestrators of different machines, with no people in
// it. The orchestrator speaks with a ```room block, which goes out signed; what comes in from
// machines the user allowed reaches its main thread, unless it was meant for somebody else or the
// machines have been talking among themselves for too long (see `shouldAnswer`). The room's chat
// is the read-only record of all of it.
import { useSyncExternalStore } from "react";
import { useAppStore, selectProjectAgents } from "@/store";
import { translateNow } from "@/i18n/useT";
import { log } from "@/lib/logger";
import { appendChatMessage } from "@/lib/chat";
import { addMessage, instructAgent } from "@/lib/orchestrator";
import { bossOf } from "@/lib/team";
import { agentStreak, isValidMessage, makeMessage, roomLabel, shouldAnswer, type RoomKind, type RoomMessage } from "./protocol";
import { openRoomTransport, type RoomStatus, type RoomTransport } from "./transports";
import type { ChatMessage, Project, RoomConfig } from "@/types";

const DEFAULT_MAX_TURNS = 6;

export interface RoomState {
  status: RoomStatus;
  detail?: string;
  /** Every machine heard from since connecting, allowed or not, by id. */
  seen: Record<string, string>;
}

interface Hub {
  key: string;
  transport: RoomTransport;
  ids: Set<string>;
}

const hubs = new Map<string, Hub>();
let states: Record<string, RoomState> = {};
const listeners = new Set<() => void>();
// shortcut: undelivered lines live in memory and are lost on restart, persist them if that turns out to matter
const undelivered = new Map<string, string[]>();

function setState(projectId: string, patch: Partial<RoomState>): void {
  const prev = states[projectId] ?? { status: "connecting", seen: {} };
  states = { ...states, [projectId]: { ...prev, ...patch } };
  for (const l of listeners) l();
}

export function useRoomState(projectId: string | undefined): RoomState | undefined {
  return useSyncExternalStore(
    l => { listeners.add(l); return () => listeners.delete(l); },
    () => (projectId ? states[projectId] : undefined),
  );
}

/** This machine as the room sees it, made up the first time. */
export function machine(): { id: string; name: string } {
  const state = useAppStore.getState();
  if (state.config.machine) return state.config.machine;
  const made = { id: crypto.randomUUID().replace(/-/g, "").slice(0, 12), name: state.config.profile?.name?.trim() || "ainess" };
  state.updateConfig({ machine: made });
  return made;
}

function ready(room: RoomConfig | undefined): room is RoomConfig {
  if (!room?.enabled || !room.room.trim() || !room.secret || !room.chatId) return false;
  return room.backend === "firebase" ? !!room.firebaseUrl?.trim() : !!(room.supabaseUrl?.trim() && room.supabaseKey?.trim());
}

/** What changes the connection itself; the allow list and the turn limit do not. */
function connectionKey(room: RoomConfig): string {
  const { allowed: _a, maxTurns: _m, chatId: _c, ...rest } = room;
  return JSON.stringify(rest);
}

/** Connects the rooms that are on and set up, and drops the rest. Runs again on every config change. */
function sync(): void {
  const projects = useAppStore.getState().config.projects;
  const wanted = new Map(projects.filter(p => ready(p.room)).map(p => [p.id, p]));
  for (const [id, hub] of hubs) {
    const project = wanted.get(id);
    if (!project || connectionKey(project.room!) !== hub.key) {
      hub.transport.stop();
      hubs.delete(id);
      if (!project) {
        setState(id, { status: "connecting", detail: undefined, seen: {} });
        undelivered.delete(id);
      }
    }
  }
  for (const [id, project] of wanted) {
    if (!hubs.has(id)) connect(project);
  }
}

function connect(project: Project): void {
  const room = project.room!;
  const ids = new Set<string>();
  const transport = openRoomTransport(room, {
    onStatus: (status, detail) => {
      setState(project.id, { status, detail });
      if (status === "connected") void post(project.id, "", "", "hello").catch(() => {});
    },
    onMessage: raw => void receive(project.id, raw),
  });
  hubs.set(project.id, { key: connectionKey(room), transport, ids });
}

function projectOf(projectId: string): Project | undefined {
  return useAppStore.getState().config.projects.find(p => p.id === projectId);
}

async function post(projectId: string, sender: string, text: string, kind: RoomKind): Promise<void> {
  const hub = hubs.get(projectId);
  const room = projectOf(projectId)?.room;
  if (!hub || !room) throw new Error("room not connected");
  const me = machine();
  const message = await makeMessage(room.secret, { machine: me.id, machineName: me.name }, sender, text, kind);
  hub.ids.add(message.id);
  await hub.transport.send(message).catch(e => {
    log.warn("room", `could not send to ${room.room}: ${e instanceof Error ? e.message : String(e)}`);
    throw e;
  });
}

async function receive(projectId: string, raw: unknown): Promise<void> {
  const project = projectOf(projectId);
  const hub = hubs.get(projectId);
  if (!project?.room || !hub || !(await isValidMessage(raw, project.room.secret))) return;
  const m = raw as RoomMessage;
  const me = machine();
  if (m.machine === me.id || hub.ids.has(m.id)) return;
  hub.ids.add(m.id);

  const seen = states[projectId]?.seen ?? {};
  const isNew = !(m.machine in seen);
  setState(projectId, { seen: { ...seen, [m.machine]: m.machine_name } });
  if (m.kind === "hello") {
    // So the machine that just said hello sees this one too.
    if (isNew) void post(projectId, "", "", "hello").catch(() => {});
    return;
  }
  if (!(m.machine in project.room.allowed)) return;
  if (m.kind !== "agent") return;

  const chatId = project.room.chatId!;
  const message: ChatMessage = {
    id: crypto.randomUUID(),
    chatId,
    ts: Date.now(),
    from: roomLabel(m),
    text: m.text,
    room: { machine: m.machine, kind: m.kind },
  };
  await appendChatMessage(chatId, message);
  const lines = [...(undelivered.get(projectId) ?? []), `[${message.from}] ${m.text}`].slice(-20);
  undelivered.set(projectId, lines);

  const boss = orchestratorOf(projectId);
  if (!boss) return;
  const logged = (useAppStore.getState().chatMessages[chatId] ?? []).filter(x => x.status !== "pending");
  const knownNames = logged.filter(x => x.room).map(x => x.from.split(" @ ")[0]);
  const streak = agentStreak(logged.map(x => x.ts), Date.now());
  if (!shouldAnswer(m.text, [boss.name], knownNames, streak, project.room.maxTurns ?? DEFAULT_MAX_TURNS)) return;

  undelivered.delete(projectId);
  await instructAgent(boss.id, `${translateNow("prompt.room.incoming")}\n\n${lines.join("\n\n")}`, projectId, { from: "system" });
}

function orchestratorOf(projectId: string) {
  return bossOf(selectProjectAgents(useAppStore.getState(), projectId));
}

/** Whether this agent is the one that speaks for its project in a room that is on and set up. */
export function isRoomSpeaker(projectId: string, agentId: string): boolean {
  return ready(projectOf(projectId)?.room) && orchestratorOf(projectId)?.id === agentId;
}

/**
 * What the orchestrator said in a ```room block: out to the room, and into the record.
 * A message that could not leave is said in the thread and not recorded as sent.
 */
export async function roomSay(projectId: string, agentName: string, text: string, runId?: string): Promise<void> {
  try {
    await post(projectId, agentName, text, "agent");
  } catch {
    addMessage({ projectId, fromAgentId: "system", kind: "system", text: translateNow("room.notSent", { text }), runId });
    return;
  }
  const chatId = projectOf(projectId)?.room?.chatId;
  if (!chatId) return;
  const me = machine();
  await appendChatMessage(chatId, {
    id: crypto.randomUUID(),
    chatId,
    ts: Date.now(),
    from: `${agentName} @ ${me.name}`,
    text,
    room: { machine: me.id, kind: "agent" },
  }).catch(e => log.warn("room", `could not record a sent message: ${e instanceof Error ? e.message : String(e)}`));
}

function roomOfChat(chatId: string): Project | undefined {
  return useAppStore.getState().config.projects.find(p => p.room?.enabled && p.room.chatId === chatId);
}

export function isRoomChat(chatId: string): boolean {
  return !!roomOfChat(chatId);
}

/** Watches the config and keeps each project's room connected while it is on. */
export function startRooms(): () => void {
  sync();
  let projects = useAppStore.getState().config.projects;
  return useAppStore.subscribe(state => {
    if (state.config.projects === projects) return;
    projects = state.config.projects;
    sync();
  });
}
