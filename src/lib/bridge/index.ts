// Driving the app from a chat you already have open, without opening a door into your machine.
//
// The trick is that nothing has to reach you: the providers connect outwards (Telegram is polled
// over HTTPS, Discord holds a Gateway socket open, Slack holds a Socket Mode one), so there is no tunnel, no port
// and no public address. What arrives is text; what it turns into is `handleRemoteCommand`, the same API
// the phone talks to — this file translates and decides who is allowed to speak, and that is all.
import { useAppStore, selectProjectAgents } from "@/store";
import { handleRemoteCommand } from "@/lib/remote";
import { attentionItems, workingItems } from "@/lib/attention";
import { pendingApprovals } from "@/lib/approvals";
import { translateNow } from "@/i18n/useT";
import { truncate } from "@/lib/format";
import { log } from "@/lib/logger";
import { notificationText } from "./notify";
import { parseBridgeCommand, type BridgeCommand } from "./commands";
import { TelegramProvider } from "./telegram";
import { DiscordProvider } from "./discord";
import { SlackProvider } from "./slack";
import type { BridgeProvider, BridgeProviderId, IncomingMessage } from "./types";
import type { MessagingChannelConfig } from "@/types";

/** The channels this bridge knows how to speak, in the order the settings screen shows them. */
const CHANNEL_IDS: BridgeProviderId[] = ["telegram", "discord", "slack"];

/** This channel's own configuration — never another channel's, that is the whole point of having one per channel. */
function messagingConfig(id: BridgeProviderId): MessagingChannelConfig | undefined {
  const messaging = useAppStore.getState().config.messaging;
  if (id === "telegram") return messaging?.telegram;
  if (id === "discord") return messaging?.discord;
  if (id === "slack") return messaging?.slack;
  return undefined;
}

/**
 * `token` is always the one that sends messages, in every channel. `appToken` only exists for
 * Slack, and only Slack needs it to open its socket — without both, that channel simply does not
 * start, the same way any channel without a token does not.
 */
function newProvider(id: BridgeProviderId, token: string, appToken?: string): BridgeProvider | null {
  if (id === "telegram") return new TelegramProvider(token);
  if (id === "discord") return new DiscordProvider(token);
  if (id === "slack") return appToken ? new SlackProvider(token, appToken) : null;
  return null;
}

/** Whether this chat may give orders. An empty list authorises nobody, never everybody. */
export function isAllowed(chatId: string, allowed: string[]): boolean {
  return allowed.includes(chatId);
}

/**
 * The id a person types is the short one they were shown, so anything that names it takes a prefix
 * and resolves it here. Two matches is not a match: acting on the wrong approval is worse than
 * asking again.
 */
export function resolveId(prefix: string, ids: string[]): { id?: string; ambiguous?: boolean } {
  const wanted = prefix.replace(/[^a-z0-9-]/gi, "").toLowerCase();
  if (!wanted) return {};
  const hits = ids.filter(id => id.toLowerCase().startsWith(wanted));
  if (hits.length === 1) return { id: hits[0] };
  if (hits.length > 1) return { ambiguous: true };
  return {};
}

const providers = new Map<BridgeProviderId, BridgeProvider>();
/** The project each chat is talking about, until it says otherwise. Lives with the session. */
const chatProject = new Map<string, string>();
/**
 * Which channel each chat arrived on, so the per-channel default project can be found without
 * `runCommand` itself having to know channels exist — it only ever gets a chat id.
 */
const chatChannel = new Map<string, BridgeProviderId>();
/** The last chat that wrote without being on the list, per channel — a Discord id and a Telegram id are never the same waiting room. */
const lastUnknown = new Map<BridgeProviderId, string>();

/** The last chat id that wrote without being on the list, so the settings screen can offer it. */
export function lastUnknownChatId(id: BridgeProviderId = "telegram"): string | null {
  return lastUnknown.get(id) ?? null;
}

function short(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

/** The project a chat is on: what it picked, else the configured one, else the last one opened. */
function projectFor(chatId: string): string | undefined {
  const s = useAppStore.getState();
  const picked = chatProject.get(chatId);
  if (picked && s.config.projects.some(p => p.id === picked)) return picked;
  const configured = messagingConfig(chatChannel.get(chatId) ?? "telegram")?.projectId;
  if (configured && s.config.projects.some(p => p.id === configured)) return configured;
  return s.currentProjectId ?? s.config.lastProjectId ?? s.config.projects[0]?.id;
}

/** What is happening and what is waiting, in the same words the home screen uses. */
function statusText(projectId: string | undefined): string {
  const s = useAppStore.getState();
  const projects = s.config.projects;
  const attention = attentionItems({ approvals: s.approvals, questions: s.questions, tasks: s.tasks, projects })
    .filter(item => !projectId || item.projectId === projectId);
  const working = workingItems({ runtime: s.runtime, runs: s.runs, projects })
    .filter(item => !projectId || item.projectId === projectId);

  if (attention.length === 0 && working.length === 0) return translateNow("bridge.reply.nothingWaiting");

  const name = (id: string) => selectProjectAgents(s, projectId ?? "").find(a => a.id === id)?.name ?? id;
  const lines: string[] = [];
  if (working.length > 0) {
    lines.push(translateNow("bridge.reply.working"));
    for (const item of working) lines.push(`• ${name(item.agentId)} — ${truncate((item.task ?? "").replace(/\s+/g, " "), 80)}`);
  }
  if (attention.length > 0) {
    if (lines.length > 0) lines.push("");
    lines.push(translateNow("bridge.reply.waiting"));
    for (const item of attention) lines.push(`• [${short(item.id.split(":")[1] ?? item.id)}] ${truncate(item.title.replace(/\s+/g, " "), 80)}`);
  }
  return lines.join("\n");
}

function tasksText(projectId: string | undefined): string {
  const s = useAppStore.getState();
  const open = (projectId ? s.tasks[projectId] ?? [] : []).filter(t => !t.archived && t.status !== "done");
  if (open.length === 0) return translateNow("bridge.reply.noTasks");
  return open
    .slice(0, 20)
    .map(t => `• [${short(t.id)}] ${translateNow(`task.status.${t.status === "needs-you" ? "needsYou" : t.status === "in-review" ? "inReview" : t.status}`)}: ${truncate(t.title, 80)}`)
    .join("\n");
}

/** One message, already known to come from someone allowed. Always answers something. */
async function runCommand(command: BridgeCommand, chatId: string): Promise<string> {
  const s = useAppStore.getState();
  const projectId = projectFor(chatId);
  const projectName = s.config.projects.find(p => p.id === projectId)?.name ?? "";

  switch (command.kind) {
    case "help":
      return translateNow("bridge.reply.help");

    case "start":
      // Said in the language the app is set to, and followed by what it can do: whoever just opened
      // this chat has no idea what any of it is yet.
      return translateNow("bridge.reply.welcome") + "\n\n" + translateNow("bridge.reply.help");

    case "status":
      return statusText(projectId);

    case "tasks":
      return tasksText(projectId);

    case "project": {
      if (!command.name) {
        const names = s.config.projects.map(p => p.name).join(", ");
        return names ? translateNow("bridge.reply.projects", { names }) : translateNow("bridge.reply.noProject");
      }
      const wanted = command.name.trim().toLowerCase();
      const found = s.config.projects.find(p => p.name.toLowerCase() === wanted)
        ?? s.config.projects.find(p => p.name.toLowerCase().startsWith(wanted));
      if (!found) return translateNow("bridge.reply.noProject");
      chatProject.set(chatId, found.id);
      return translateNow("bridge.reply.projectSet", { name: found.name });
    }

    case "prompt": {
      if (!projectId) return translateNow("bridge.reply.noProject");
      const result = await handleRemoteCommand("prompt", { projectId, text: command.text });
      if (result.error) return translateNow("bridge.reply.error", { error: String(result.error) });
      return translateNow("bridge.reply.started", { project: projectName });
    }

    case "stop": {
      if (!projectId) return translateNow("bridge.reply.noProject");
      const result = await handleRemoteCommand("stop", { projectId });
      if (result.error) return translateNow("bridge.reply.error", { error: String(result.error) });
      return translateNow("bridge.reply.stopped");
    }

    case "approve":
    case "reject": {
      const ids = pendingApprovals(s.approvals, s.config.projects).map(a => a.id);
      const { id, ambiguous } = resolveId(command.id, ids);
      if (ambiguous) return translateNow("bridge.reply.ambiguous", { id: command.id });
      if (!id) return translateNow("bridge.reply.error", { error: translateNow("remote.err.noApproval") });
      const result = await handleRemoteCommand("approve", {
        approvalId: id,
        decision: command.kind === "reject" ? "reject" : "approve",
        note: command.note,
      });
      if (result.error) return translateNow("bridge.reply.error", { error: String(result.error) });
      return translateNow(command.kind === "reject" ? "bridge.reply.rejected" : "bridge.reply.approved", { id: short(id) });
    }

    case "answer": {
      const pending = Object.values(s.questions).filter(q => q.status === "pending");
      if (pending.length === 0) return translateNow("bridge.reply.error", { error: translateNow("remote.err.noQuestion") });
      // With one question open, naming it is ceremony: what was written is the answer.
      let id = command.id ? resolveId(command.id, pending.map(q => q.id)).id : undefined;
      if (!id && !command.id && pending.length === 1) id = pending[0].id;
      if (!id) return translateNow("bridge.reply.error", { error: translateNow("remote.err.noQuestion") });
      const result = await handleRemoteCommand("answer", { questionId: id, answer: [command.text] });
      if (result.error) return translateNow("bridge.reply.error", { error: String(result.error) });
      return translateNow("bridge.reply.answered");
    }
  }
}

async function onMessage(provider: BridgeProvider, message: IncomingMessage): Promise<void> {
  if (!isAllowed(message.chatId, allowedChats(provider.id))) {
    // Not a word back: confirming the bot exists is the one thing a stranger learns for free.
    lastUnknown.set(provider.id, message.chatId);
    log.warn("bridge", `mensaje de un chat no autorizado (${message.chatId})`);
    return;
  }
  chatChannel.set(message.chatId, provider.id);
  try {
    const reply = await runCommand(parseBridgeCommand(message.text), message.chatId);
    await provider.send(message.chatId, reply);
  } catch (e) {
    // Through the sanitiser, both here and on the way back out. A failure to send can carry the
    // URL it failed on, and Telegram's carries the token inside it — a log or a chat reply is the
    // last place that should be the first to say it out loud.
    const channel = messagingConfig(provider.id);
    const error = sanitizeBridgeError(e, channel?.token, channel?.appToken);
    log.error("bridge", `no se pudo responder: ${error}`);
    // An order swallowed in silence is worse than one that says it went wrong.
    await provider.send(message.chatId, translateNow("bridge.reply.error", { error })).catch(() => {});
  }
}

/**
 * Starts every channel that is turned on. Idempotent: a second call adds nothing.
 *
 * `provider.start` only returns when the provider is stopped, so it is deliberately not awaited.
 */
export async function startBridge(): Promise<void> {
  for (const id of CHANNEL_IDS) {
    const channel = messagingConfig(id);
    if (channel?.enabled && channel.token && !providers.has(id)) {
      const provider = newProvider(id, channel.token, channel.appToken);
      if (!provider) continue;
      providers.set(id, provider);
      void provider.start(m => onMessage(provider, m));
      log.info("bridge", `${id} conectado`);
    }
  }
}

/** Stops one channel, or every channel when none is named. */
export async function stopBridge(id?: BridgeProviderId): Promise<void> {
  const targets = id ? ([[id, providers.get(id)]] as const) : Array.from(providers.entries());
  for (const [channelId, provider] of targets) {
    if (!provider) continue;
    await provider.stop().catch(() => {});
    providers.delete(channelId);
    log.info("bridge", `${channelId} desconectado`);
  }
}

/** Whether a channel is connected right now, for the settings screen. */
export function bridgeRunning(id: BridgeProviderId = "telegram"): boolean {
  return providers.has(id);
}

/** Everyone this channel is allowed to talk to right now. */
function allowedChats(id: BridgeProviderId): string[] {
  return messagingConfig(id)?.allowedChatIds ?? [];
}

function getDispatchProviders(id: BridgeProviderId): BridgeProvider[] {
  const existing = providers.get(id);
  if (existing) return [existing];
  const channel = messagingConfig(id);
  if (!channel?.token) return [];
  const provider = newProvider(id, channel.token, channel.appToken);
  return provider ? [provider] : [];
}

/**
 * A message to one chat on demand, for the "test it" button in the settings.
 *
 * It works with the bridge off too: nobody should have to turn something on to find out whether the
 * token they just pasted is the right one.
 */
export async function sendTest(chatId: string, id: BridgeProviderId = "telegram"): Promise<void> {
  const targets = getDispatchProviders(id);
  if (targets.length === 0) throw new Error(translateNow("messaging.testNoToken"));
  await targets[0].send(chatId, translateNow("bridge.test.message"));
}

function sanitizeBridgeError(e: unknown, ...tokens: Array<string | undefined>): string {
  let msg = e instanceof Error ? e.message : String(e);
  for (const token of tokens) {
    if (token && token.trim()) msg = msg.split(token).join("[REDACTED]");
  }
  msg = msg.replace(/\/bot[^/\s]+/g, "/bot[REDACTED]");
  return msg;
}

/**
 * A message to the chats one channel is allowed to talk to.
 *
 * One channel, not all of them. The only caller is the hook whose action type is literally
 * `telegram`, and quietly widening it the day somebody connects Discord would change what a hook
 * they set up months ago does, without their asking. A channel reaches its own list and no other:
 * a Discord channel id never earns a message by being on Telegram's.
 */
export async function sendToAllowed(text: string, id: BridgeProviderId = "telegram"): Promise<number> {
  let sentCount = 0;
  {
    const chats = allowedChats(id);
    if (chats.length === 0) return 0;
    const targets = getDispatchProviders(id);
    if (targets.length === 0) return 0;

    const channel = messagingConfig(id);
    for (const chatId of chats) {
      let sent = false;
      for (const provider of targets) {
        try {
          await provider.send(chatId, text);
          sent = true;
        } catch (e) {
          log.warn("bridge", `no se pudo avisar a ${chatId}: ${sanitizeBridgeError(e, channel?.token, channel?.appToken)}`);
        }
      }
      if (sent) sentCount++;
    }
  }
  return sentCount;
}

/**
 * One chat, by id, for a hook that names its destination.
 *
 * A chat that is not on the list is refused here too. The list is the whole of the security, and a
 * hook is not allowed to be the back door around it.
 *
 * Unlike the broadcast, this one throws when nothing got through: somebody named one destination,
 * and a hook that silently did not reach it is worse than one that says it failed.
 */
export async function sendToChat(chatId: string, text: string, id: BridgeProviderId = "telegram"): Promise<void> {
  if (!isAllowed(chatId, allowedChats(id))) {
    throw new Error(translateNow("hooks.telegramNotAllowed", { id: chatId }));
  }
  const targets = getDispatchProviders(id);
  const channel = messagingConfig(id);
  let sent = false;
  let lastError = "";
  for (const provider of targets) {
    try {
      await provider.send(chatId, text);
      sent = true;
    } catch (e) {
      lastError = sanitizeBridgeError(e, channel?.token, channel?.appToken);
      log.warn("bridge", `no se pudo avisar a ${chatId}: ${lastError}`);
    }
  }
  if (!sent) throw new Error(lastError || translateNow("hooks.telegramNoToken"));
}

let notificationsAttached = false;
let seenNotification: string | null = null;

/**
 * Forwards to the channel whatever reached the bell.
 *
 * One subscription for the life of the app, watching the same list the bell reads — so there is
 * never a second opinion about what deserves your attention, only a second place it arrives. Only
 * the newest one is sent: the list is rewritten whole on every change, and re-reading it would
 * repeat everything it holds.
 */
export function attachBridgeNotifications(): void {
  if (notificationsAttached) return;
  notificationsAttached = true;
  seenNotification = useAppStore.getState().notifications[0]?.id ?? null;

  useAppStore.subscribe((state, prev) => {
    if (state.notifications === prev.notifications) return;
    const newest = state.notifications[0];
    if (!newest || newest.id === seenNotification) return;
    seenNotification = newest.id;
    if (providers.size === 0) return;

    const project = newest.projectId
      ? state.config.projects.find(p => p.id === newest.projectId)?.name
      : undefined;
    const text = notificationText(newest, project);
    for (const provider of providers.values()) {
      const channel = messagingConfig(provider.id);
      for (const chatId of allowedChats(provider.id)) {
        void provider.send(chatId, text).catch(e =>
          log.warn("bridge", `no se pudo avisar: ${sanitizeBridgeError(e, channel?.token, channel?.appToken)}`));
      }
    }
  });
}
