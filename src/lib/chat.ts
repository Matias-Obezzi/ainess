// Chat orchestrator: individual and shared chat conversations with agents.
import { useAppStore, selectAgent, selectSkillsFor } from "@/store";
import { startRun, addMessage } from "@/lib/orchestrator";
import { getTransport } from "@/lib/transport";
import type { ChatMessage } from "@/types";

/** Tracks the current turn: chatId → { pending participant indices, turnId, responses so far } */
const activeTurns = new Map<string, {
  turnId: string;
  participantIdx: number;
  responses: Array<{ agentId: string; name: string; role: string; text: string }>;
  runId?: string;
}>();

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

export async function loadChatMessages(chatId: string): Promise<void> {
  const existing = useAppStore.getState().chatMessages[chatId];
  if (existing && existing.length > 0) return; // already loaded
  useAppStore.setState(state => ({ chatLoading: { ...state.chatLoading, [chatId]: true } }));
  try {
    const raw = await getTransport().readTextFile(chatFilePath(chatId));
    if (raw) {
      try {
        const parsed = JSON.parse(raw) as ChatFile | ChatMessage[];
        const msgs = Array.isArray(parsed) ? parsed : parsed.messages || [];
        const sessions = Array.isArray(parsed) ? {} : parsed.sessions || {};
        useAppStore.setState(state => ({
          chatMessages: { ...state.chatMessages, [chatId]: msgs },
          chatSessions: { ...state.chatSessions, [chatId]: { ...sessions, ...(state.chatSessions[chatId] || {}) } },
        }));
      } catch { /* corrupt file, ignore */ }
    }
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

  let prompt = `En esta conversación tu rol es: ${role}.`;

  if (chat.mode === "shared" && chat.participants.length > 1) {
    prompt += "\n\nOtros participantes en esta conversación:";
    for (const p of chat.participants) {
      if (p.agentId === agentId) continue;
      const other = selectAgent(store, p.agentId);
      prompt += `\n- ${other?.name || p.agentId} (${p.role})`;
    }
    prompt += "\n\nRespondé al último mensaje del usuario; podés referirte a lo que dijeron los otros participantes.";
  }

  // Append profile, shared context, and skills
  const skills = selectSkillsFor(store, agentId);
  const sharedContext = store.config.sharedContext;
  const profile = store.config.profile;

  if (profile && (profile.name || profile.about || profile.preferences)) {
    prompt += "\n\n## Sobre el usuario\n";
    if (profile.name) prompt += `Nombre: ${profile.name}\n`;
    if (profile.about) prompt += `${profile.about}\n`;
    if (profile.preferences) prompt += `Preferencias de trabajo: ${profile.preferences}\n`;
  }

  if (sharedContext && sharedContext.trim()) {
    prompt += "\n\n## Contexto compartido del equipo\n" + sharedContext;
  }

  const validSkills = skills?.filter(s => s.content.trim()) || [];
  if (validSkills.length > 0) {
    prompt += "\n\n## Skills";
    for (const skill of validSkills) {
      prompt += `\n### ${skill.name}\n${skill.content}`;
    }
  }

  if (agent.systemPrompt) {
    prompt += "\n\n" + agent.systemPrompt;
  }

  return prompt;
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
      text: `[Error: agente no encontrado]`,
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
    prompt += "\n\n---\nRespuestas anteriores de este turno:";
    for (const r of previousResponses) {
      prompt += `\n\n### ${r.name} (${r.role})\n${r.text}`;
    }
  }

  const systemPrompt = buildChatSystemPrompt(chatId, participant.agentId);

  // Get or create session for this chat+agent
  const sessionId = store.chatSessions[chatId]?.[participant.agentId];

  const turnId = crypto.randomUUID();

  const runId = startRun({
    agentId: participant.agentId,
    projectId: chat.projectId,
    prompt,
    parentRunId: null,
    round: 0,
    resume: !!sessionId,
    rootRunId: turnId,
    model: participant.model,
    kind: "chat",
    systemPromptOverride: systemPrompt,
  });

  activeTurns.set(chatId, {
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

  const output = run.status === "error" ? `[Error: ${run.output || "falló"}]` : (run.output || "");
  const msgStatus = run.status === "error" ? "error" as const : "done" as const;

  // Save session for this chat+agent
  const agentRuntime = store.runtime[run.projectId]?.[run.agentId];
  if (agentRuntime?.sessionId) {
    useAppStore.setState(state => ({
      chatSessions: {
        ...state.chatSessions,
        [chatId!]: {
          ...(state.chatSessions[chatId!] || {}),
          [run.agentId]: agentRuntime.sessionId!,
        }
      }
    }));
  }

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
    activeTurns.delete(chatId);
  }
}

// ---- Stop a chat ----

export async function stopChat(chatId: string): Promise<void> {
  const turn = activeTurns.get(chatId);
  if (!turn || !turn.runId) return;

  activeTurns.delete(chatId);
  await getTransport().killRun(turn.runId).catch(() => {});
  // The run's completion no longer maps to a turn, so close the pending bubble here.
  useAppStore.setState(state => {
    const msgs = state.chatMessages[chatId] || [];
    const idx = msgs.findIndex(m => m.status === "pending");
    if (idx < 0) return state;
    const newMsgs = [...msgs];
    newMsgs[idx] = { ...newMsgs[idx], text: newMsgs[idx].text || "[detenido por el usuario]", status: "done" };
    return { chatMessages: { ...state.chatMessages, [chatId]: newMsgs } };
  });
  void persistMessages(chatId);
}

// ---- Helper to check if a chat has an active turn ----

export function isChatActive(chatId: string): boolean {
  return activeTurns.has(chatId);
}
