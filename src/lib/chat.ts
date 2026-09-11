// Chat orchestrator: individual and shared chat conversations with agents.
import { mergeLoaded } from "@/lib/chat-merge";
import { useAppStore, selectAgent, selectSkillsFor } from "@/store";
import { startRun, addMessage } from "@/lib/orchestrator";
import { getTransport } from "@/lib/transport";
import { recordTurn } from "@/lib/agent-history";
import { buildSystemPrompt } from "@/lib/providers";
import { translateNow } from "@/i18n/useT";
import { rewound } from "@/lib/chat-rewind";
import type { ChatMessage } from "@/types";

/** Tracks the current turn: chatId → { pending participant indices, turnId, responses so far } */
const activeTurns = new Map<string, {
  turnId: string;
  participantIdx: number;
  responses: Array<{ agentId: string; name: string; role: string; text: string }>;
  runId?: string;
}>();

/**
 * Who to tell when a turn starts or ends.
 *
 * A turn lives in this module and not in the store, so nothing could react to it: the composer
 * polled `isChatActive` on a 500ms timer, re-rendering itself twice a second for as long as a chat
 * was open, whether or not anything was happening. Same shape as `lib/raw-lines`.
 */
const activityListeners = new Set<() => void>();

/** Goes through here so a turn cannot start or end without the screen hearing about it. */
function setTurn(chatId: string, turn: NonNullable<ReturnType<typeof activeTurns.get>>): void {
  activeTurns.set(chatId, turn);
  for (const fn of activityListeners) fn();
}

function clearTurn(chatId: string): void {
  if (!activeTurns.delete(chatId)) return;
  for (const fn of activityListeners) fn();
}

/**
 * For `useSyncExternalStore` around `isChatActive`.
 *
 * Also listens to the store, because `isChatActive` reads `remoteActiveChats` from it — the phone
 * runs its turns in its own process. That subscription fires on every store write, which is cheap
 * here: what it wakes is a snapshot that returns a boolean, and React only re-renders when the
 * boolean actually moved.
 */
export function subscribeChatActivity(onChange: () => void): () => void {
  activityListeners.add(onChange);
  const unsubscribeStore = useAppStore.subscribe(onChange);
  return () => {
    activityListeners.delete(onChange);
    unsubscribeStore();
  };
}

// ---- Persistence helpers ----

function chatFilePath(chatId: string): string {
  return `chats/${chatId}.json`;
}

/** On-disk shape: messages plus the per-agent provider sessions, so a chat can be resumed
 *  from another process (the CLI) and not only within the app's lifetime. */
interface ChatFile { messages: ChatMessage[]; sessions: Record<string, string> }

async function persistMessages(chatId: string): Promise<void> {
  const state = useAppStore.getState();
  const msgs = state.chatMessages[chatId];
  if (!msgs) return;
  const file: ChatFile = { messages: msgs, sessions: state.chatSessions[chatId] || {} };
  await getTransport().writeTextFile(chatFilePath(chatId), JSON.stringify(file, null, 2));
}

/**
 * Brings a chat's history in from disk, without ever costing it what it already had.
 *
 * Three things here are deliberate, and each of them was a way the thread came back empty:
 *
 * The read is caught. It used to be inside a `try/finally` with no `catch`, so a read that failed
 * threw out of here as an unhandled rejection and left the chat with nothing in memory until the
 * next visit retried it — and a read can fail for a mundane reason, like landing on the moment
 * `persistMessages` has the same file open for writing.
 *
 * What came in while the read was in flight is kept: see `mergeLoaded`.
 *
 * And the loading flag goes down whatever happens, so nothing can leave the thread showing
 * skeletons over a history that is sitting right there.
 */
export async function loadChatMessages(chatId: string): Promise<void> {
  const existing = useAppStore.getState().chatMessages[chatId];
  if (existing && existing.length > 0) return; // already loaded
  useAppStore.setState(state => ({ chatLoading: { ...state.chatLoading, [chatId]: true } }));
  try {
    const raw = await getTransport().readTextFile(chatFilePath(chatId));
    if (raw) {
      const parsed = JSON.parse(raw) as ChatFile | ChatMessage[];
      const msgs = Array.isArray(parsed) ? parsed : parsed.messages || [];
      const sessions = Array.isArray(parsed) ? {} : parsed.sessions || {};
      useAppStore.setState(state => ({
        chatMessages: { ...state.chatMessages, [chatId]: mergeLoaded(msgs, state.chatMessages[chatId] ?? []) },
        chatSessions: { ...state.chatSessions, [chatId]: { ...sessions, ...(state.chatSessions[chatId] || {}) } },
      }));
    }
  } catch {
    // Unreadable or corrupt: whatever is in memory stays on screen. There is nothing better to put
    // there, and emptying it is the one outcome that loses something.
  } finally {
    useAppStore.setState(state => ({ chatLoading: { ...state.chatLoading, [chatId]: false } }));
  }
}

// ---- System prompt builder for chat ----

function buildChatSystemPrompt(chatId: string, agentId: string): string {
  const store = useAppStore.getState();
  const chat = store.config.chats.find(c => c.id === chatId);
  if (!chat) return "";
  const agent = selectAgent(store, agentId);
  if (!agent) return "";

  const participant = chat.participants.find(p => p.agentId === agentId);
  const role = participant?.role || agent.role;
  const others: { name: string; role: string }[] = [];

  if (chat.mode === "shared" && chat.participants.length > 1) {
    for (const p of chat.participants) {
      if (p.agentId === agentId) continue;
      const other = selectAgent(store, p.agentId);
      others.push({ name: other?.name || p.agentId, role: p.role });
    }
  }

  return buildSystemPrompt(agent, [], {
    skills: selectSkillsFor(store, agentId) || [],
    sharedContext: store.config.projects.find(p => p.id === chat.projectId)?.sharedContext ?? "",
    profile: store.config.profile,
    chat: { role, others }
  });
}

// ---- Send a message and trigger turn ----

export async function sendChatMessage(chatId: string, text: string): Promise<void> {
  const store = useAppStore.getState();
  const chat = store.config.chats.find(c => c.id === chatId);
  if (!chat) return;

  // Add user message
  const userMsg: ChatMessage = {
    id: crypto.randomUUID(),
    chatId,
    ts: Date.now(),
    from: "user",
    text,
  };

  useAppStore.setState(state => ({
    chatMessages: {
      ...state.chatMessages,
      [chatId]: [...(state.chatMessages[chatId] || []), userMsg]
    }
  }));

  // Also add to comm feed
  addMessage({
    projectId: chat.projectId,
    fromAgentId: "user",
    toAgentId: chat.participants[0]?.agentId,
    kind: "user",
    text: `[Chat: ${chat.name}] ${text}`,
  });

  await persistMessages(chatId);

  // Start turn
  await startTurn(chatId, text, 0, []);
}

async function startTurn(
  chatId: string,
  userText: string,
  participantIdx: number,
  previousResponses: Array<{ agentId: string; name: string; role: string; text: string }>
): Promise<void> {
  const store = useAppStore.getState();
  const chat = store.config.chats.find(c => c.id === chatId);
  if (!chat || participantIdx >= chat.participants.length) return;

  const participant = chat.participants[participantIdx];
  const agent = selectAgent(store, participant.agentId);
  if (!agent) {
    // Skip missing agent, continue with next
    const errorMsg: ChatMessage = {
      id: crypto.randomUUID(),
      chatId,
      ts: Date.now(),
      from: participant.agentId,
      text: translateNow("chat.agentGone"),
      status: "error",
    };
    useAppStore.setState(state => ({
      chatMessages: {
        ...state.chatMessages,
        [chatId]: [...(state.chatMessages[chatId] || []), errorMsg]
      }
    }));
    await startTurn(chatId, userText, participantIdx + 1, previousResponses);
    return;
  }

  // Add pending message
  const pendingMsg: ChatMessage = {
    id: crypto.randomUUID(),
    chatId,
    ts: Date.now(),
    from: participant.agentId,
    text: "",
    status: "pending",
  };

  useAppStore.setState(state => ({
    chatMessages: {
      ...state.chatMessages,
      [chatId]: [...(state.chatMessages[chatId] || []), pendingMsg]
    }
  }));

  // Build prompt: user message + previous responses in shared mode
  let prompt = userText;
  if (chat.mode === "shared" && previousResponses.length > 0) {
    prompt += "\n\n---\n" + translateNow("prompt.chat.previousAnswers");
    for (const r of previousResponses) {
      prompt += `\n\n### ${r.name} (${r.role})\n${r.text}`;
    }
  }

  // Get or create session for this chat+agent
  const sessionId = store.chatSessions[chatId]?.[participant.agentId];

  // A turn that carries the session on does not carry the instructions with it: the CLI still has
  // them from the first turn, and sending them again every turn was paying for the same paragraph
  // over and over. A chat whose participants change mid-conversation keeps the roster it started
  // with — reset its session (or start another chat) for the new one to be announced.
  const systemPrompt = sessionId ? "" : buildChatSystemPrompt(chatId, participant.agentId);

  const turnId = crypto.randomUUID();

  const runId = startRun({
    agentId: participant.agentId,
    projectId: chat.projectId,
    prompt,
    parentRunId: null,
    round: 0,
    resume: !!sessionId,
    // Handed over rather than looked up: the agent's own slot holds whichever conversation spoke
    // last, and reading it here is how a message sent in one chat came back answered with another's.
    sessionId,
    chatId,
    rootRunId: turnId,
    model: participant.model,
    kind: "chat",
    systemPromptOverride: systemPrompt,
  });

  setTurn(chatId, {
    turnId,
    participantIdx,
    responses: previousResponses,
    runId: runId,
  });

  // The bubble needs the runId to show the agent's live activity while it answers.
  if (runId) {
    useAppStore.setState(state => {
      const msgs = state.chatMessages[chatId] || [];
      const idx = msgs.findIndex(m => m.id === pendingMsg.id);
      if (idx < 0) return state;
      const newMsgs = [...msgs];
      newMsgs[idx] = { ...newMsgs[idx], runId };
      return { chatMessages: { ...state.chatMessages, [chatId]: newMsgs } };
    });
  }
}

// ---- Called from orchestrator when a chat run finishes ----

export function onChatRunFinished(runId: string): void {
  const store = useAppStore.getState();
  const run = store.runs[runId];
  if (!run) return;

  // Find the chat this run belongs to
  let chatId: string | null = null;
  for (const [cId, turn] of activeTurns.entries()) {
    if (turn.runId === runId) {
      chatId = cId;
      break;
    }
  }
  if (!chatId) return;

  const turn = activeTurns.get(chatId)!;
  const chat = store.config.chats.find(c => c.id === chatId);
  if (!chat) return;

  const participant = chat.participants[turn.participantIdx];
  const agent = selectAgent(store, run.agentId);
  const agentName = agent?.name || run.agentId;

  const output = run.status === "error" ? (run.output ? translateNow("chat.runError", { error: run.output }) : translateNow("chat.runFailed")) : (run.output || "");
  const msgStatus = run.status === "error" ? "error" as const : "done" as const;

  // The session is written where it belongs the moment the provider reports it (see
  // `rememberSession`). Copying it out of the agent's shared slot here was the other half of two
  // chats answering each other: whichever one finished last decided what both of them resumed.

  // Update the pending message with the actual response
  useAppStore.setState(state => {
    const msgs = state.chatMessages[chatId!] || [];
    const pendingIdx = msgs.findIndex(m => m.from === run.agentId && m.status === "pending" && m.chatId === chatId);
    if (pendingIdx >= 0) {
      const newMsgs = [...msgs];
      newMsgs[pendingIdx] = { ...newMsgs[pendingIdx], text: output, status: msgStatus };
      return { chatMessages: { ...state.chatMessages, [chatId!]: newMsgs } };
    }
    // If pending message not found, add as new
    const newMsg: ChatMessage = {
      id: crypto.randomUUID(),
      chatId: chatId!,
      ts: Date.now(),
      from: run.agentId,
      text: output,
      runId,
      status: msgStatus,
    };
    return { chatMessages: { ...state.chatMessages, [chatId!]: [...msgs, newMsg] } };
  });

  // Add to comm feed
  addMessage({
    projectId: run.projectId,
    fromAgentId: run.agentId,
    toAgentId: "user",
    kind: "result",
    text: `[Chat: ${chat.name}] ${output.substring(0, 500)}`,
    runId,
  });

  // Persist
  void persistMessages(chatId);

  // And into the project's own folder, where the agent can read it back (see agent-history.ts).
  {
    const project = store.config.projects.find(p => p.id === run.projectId);
    const agent = project?.agents?.find(a => a.id === run.agentId);
    if (project && agent) {
      void recordTurn(project, agent, { from: `${translateNow("folder.history.fromUser")} · ${chat.name}`, prompt: run.prompt, answer: output });
    }
  }

  // Continue to next participant
  const newResponses = [
    ...turn.responses,
    { agentId: run.agentId, name: agentName, role: participant?.role || "", text: output }
  ];

  const nextIdx = turn.participantIdx + 1;
  if (nextIdx < chat.participants.length) {
    // Continue with next participant
    const userMsgs = (store.chatMessages[chatId] || []).filter(m => m.from === "user");
    const lastUserText = userMsgs.length > 0 ? userMsgs[userMsgs.length - 1].text : "";
    void startTurn(chatId, lastUserText, nextIdx, newResponses);
  } else {
    // Turn complete
    clearTurn(chatId);
    // What was written while this turn was running goes out now (see `flushChatQueue`).
    void useAppStore.getState().flushChatQueue(chatId);
  }
}

/**
 * Cuts the conversation back to `messageId` and throws away what came after it.
 *
 * The visible thread is only half of a conversation: the other half is the provider's own session,
 * which is what the agent actually remembers. Deleting bubbles without touching it would leave an
 * agent that still knows everything the user just took back, and answers accordingly — the thread
 * would be a lie about what the next turn is built on. So the sessions go too, and the next message
 * starts a fresh one. That is the cost of rewinding, and it is why this asks first.
 *
 * A turn in flight is stopped before anything is cut: it is writing into the very list being
 * rewritten, and letting it land afterwards would put back part of what was just removed.
 */
export async function rewindChat(chatId: string, messageId: string, inclusive: boolean): Promise<void> {
  if (isChatActive(chatId)) await stopChat(chatId);

  useAppStore.setState(state => {
    const msgs = state.chatMessages[chatId];
    if (!msgs) return state;
    const sessions = { ...state.chatSessions };
    delete sessions[chatId];
    return {
      chatMessages: { ...state.chatMessages, [chatId]: rewound(msgs, messageId, inclusive) },
      chatSessions: sessions,
    };
  });

  await persistMessages(chatId);
}

/**
 * Replaces one of the user's own messages with `text` and asks again from there.
 *
 * The old message and everything it caused are dropped — an answer to a question that is no longer
 * the question is worse than no answer — and the new text goes out as a fresh turn.
 */
export async function editChatMessage(chatId: string, messageId: string, text: string): Promise<void> {
  await rewindChat(chatId, messageId, false);
  await sendChatMessage(chatId, text);
}

// ---- Stop a chat ----

export async function stopChat(chatId: string): Promise<void> {
  const turn = activeTurns.get(chatId);
  if (!turn || !turn.runId) return;

  clearTurn(chatId);
  await getTransport().killRun(turn.runId).catch(() => {});
  // The run's completion no longer maps to a turn, so close the pending bubble here.
  useAppStore.setState(state => {
    const msgs = state.chatMessages[chatId] || [];
    const idx = msgs.findIndex(m => m.status === "pending");
    if (idx < 0) return state;
    const newMsgs = [...msgs];
    newMsgs[idx] = { ...newMsgs[idx], text: newMsgs[idx].text || translateNow("chat.stoppedByUser"), status: "done" };
    return { chatMessages: { ...state.chatMessages, [chatId]: newMsgs } };
  });
  void persistMessages(chatId);
}

/**
 * Called when a chat is deleted, on its own or with its project: forget the turn in flight and
 * empty its file, so the conversation does not come back the next time something reads it.
 */
export function forgetChat(chatId: string): void {
  clearTurn(chatId);
  void getTransport().deleteFile(chatFilePath(chatId)).catch(() => {});
}

// ---- Helper to check if a chat has an active turn ----

export function isChatActive(chatId: string): boolean {
  // On the phone the turns run in the app's process, so the answer comes with the snapshot.
  return activeTurns.has(chatId) || useAppStore.getState().remoteActiveChats.includes(chatId);
}
