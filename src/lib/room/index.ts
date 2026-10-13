// A project's room: its shared chat, spoken across machines. What is written in the chat goes out
// signed; what comes in from machines the user allowed lands in the chat as theirs, and the local
// agents answer it the way they answer a person — unless it was meant for somebody else, or the
// agents have been talking among themselves for too long (see `shouldAnswer`).
import { useSyncExternalStore } from "react";
import { useAppStore, selectAgent } from "@/store";
import { translateNow } from "@/i18n/useT";
import { log } from "@/lib/logger";
import { appendChatMessage, isChatActive, startRoomTurn } from "@/lib/chat";
import { isValidMessage, makeMessage, roomLabel, shouldAnswer, type RoomKind, type RoomMessage } from "./protocol";
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
/** Chats that heard something while their agents were busy, to be answered once they are done. */
const pending = new Set<string>();

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
      if (!project) setState(id, { status: "connecting", detail: undefined, seen: {} });
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
      if (status === "connected") void post(project.id, "", "", "hello");
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
  if (!hub || !room) return;
  const me = machine();
  const message = await makeMessage(room.secret, { machine: me.id, machineName: me.name }, sender, text, kind);
  hub.ids.add(message.id);
  await hub.transport.send(message).catch(e => log.warn("room", `could not send to ${room.room}: ${e instanceof Error ? e.message : String(e)}`));
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
    if (isNew) void post(projectId, "", "", "hello");
    return;
  }
  if (!(m.machine in project.room.allowed)) return;

  const chatId = project.room.chatId!;
  const message: ChatMessage = {
    id: crypto.randomUUID(),
    chatId,
    ts: Date.now(),
    from: roomLabel(m, translateNow("room.human")),
    text: m.text,
    room: { machine: m.machine, kind: m.kind },
  };
  await appendChatMessage(chatId, message);
  answer(projectId, chatId);
}

/** Who in the chat is local and which of its last messages were agents talking. */
function roster(chatId: string) {
  const state = useAppStore.getState();
  const chat = state.config.chats.find(c => c.id === chatId);
  const local = new Set(chat?.participants.map(p => p.agentId) ?? []);
  const localNames = [...local].map(id => selectAgent(state, id)?.name ?? "").filter(Boolean);
  const messages = (state.chatMessages[chatId] ?? []).filter(m => m.status !== "pending");
  const isAgent = (m: ChatMessage) => m.room ? m.room.kind === "agent" : local.has(m.from);
  let streak = 0;
  for (let i = messages.length - 1; i >= 0 && isAgent(messages[i]); i--) streak++;
  const knownNames = messages.filter(m => m.room?.kind === "agent").map(m => m.from.split(" @ ")[0]);
  return { local, localNames, messages, streak, knownNames };
}

/** Lets the local agents answer what came in, now or once they finish what they are doing. */
function answer(projectId: string, chatId: string): void {
  if (isChatActive(chatId)) {
    pending.add(chatId);
    return;
  }
  const { local, localNames, messages, streak, knownNames } = roster(chatId);
  const last = messages[messages.length - 1];
  const max = projectOf(projectId)?.room?.maxTurns ?? DEFAULT_MAX_TURNS;
  if (!last || !shouldAnswer(last.text, localNames, knownNames, streak, max)) return;

  // Everything since the local agents last spoke: that is what they have not read yet.
  let start = messages.length;
  while (start > 0 && !local.has(messages[start - 1].from)) start--;
  const me = machine();
  const userName = useAppStore.getState().config.profile?.name?.trim() || translateNow("room.human");
  const lines = messages.slice(start).map(m => `[${m.from === "user" ? `${userName} @ ${me.name}` : m.from}] ${m.text}`);
  void startRoomTurn(chatId, lines.join("\n\n"));
}

// ---- what the chat tells the room ----

function roomOfChat(chatId: string): Project | undefined {
  return useAppStore.getState().config.projects.find(p => p.room?.enabled && p.room.chatId === chatId);
}

/** Something said in a room's chat on this machine — by the user or by one of its agents — goes out. */
export function roomPublish(chatId: string, sender: string, text: string, kind: "human" | "agent"): void {
  const project = roomOfChat(chatId);
  if (project && hubs.has(project.id)) void post(project.id, sender, text, kind);
}

/** The chat's agents are done: whatever came in meanwhile gets its answer now. */
export function roomTurnDone(chatId: string): void {
  if (!pending.delete(chatId)) return;
  const project = roomOfChat(chatId);
  if (project) answer(project.id, chatId);
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
