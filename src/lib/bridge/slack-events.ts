import type { BridgeButton, IncomingMessage } from "./types";

interface SlackEvent {
  type?: string;
  channel?: string;
  text?: string;
  user?: string;
  bot_id?: string;
  subtype?: string;
}

interface SlackAction {
  action_id?: string;
  value?: string;
}

interface SocketModeFrame {
  type?: string;
  envelope_id?: string;
  payload?: {
    event?: SlackEvent;
    type?: string;
    actions?: SlackAction[];
    channel?: { id?: string };
    user?: { username?: string; name?: string };
  };
}

/** The message a Socket Mode envelope carries, or null when it is not one we act on. */
export function messageFrom(frame: unknown): IncomingMessage | null {
  if (!frame || typeof frame !== "object") return null;
  const { type, payload } = frame as SocketModeFrame;
  if (type !== "events_api") return null;

  const event = payload?.event;
  if (!event || typeof event !== "object") return null;
  if (event.type !== "message") return null;
  // Our own reply coming back, or an edit/delete/join notice, is how a bridge answers itself
  // forever: bot_id and subtype are the two shapes that loop it.
  if (typeof event.bot_id === "string") return null;
  if (typeof event.subtype === "string") return null;
  if (typeof event.text !== "string" || event.text.length === 0) return null;
  if (typeof event.channel !== "string" || event.channel.length === 0) return null;

  return {
    chatId: event.channel,
    text: event.text,
    from: event.user,
  };
}

/** The envelope id that has to be acknowledged, if this frame has one. */
export function envelopeIdOf(frame: unknown): string | null {
  if (!frame || typeof frame !== "object") return null;
  const { envelope_id } = frame as SocketModeFrame;
  return typeof envelope_id === "string" && envelope_id.length > 0 ? envelope_id : null;
}

/**
 * The press a Socket Mode envelope carries, or null.
 *
 * Socket Mode delivers interactive payloads on the same connection as events, so pressing a button
 * needs no public URL and no second door — which is the whole reason buttons are possible here at
 * all. Only the first action: one press is one answer.
 */
export function pressFrom(frame: unknown): IncomingMessage | null {
  if (!frame || typeof frame !== "object") return null;
  const { type, payload } = frame as SocketModeFrame;
  if (type !== "interactive") return null;
  if (payload?.type !== "block_actions") return null;

  const token = payload.actions?.[0]?.value ?? payload.actions?.[0]?.action_id;
  if (typeof token !== "string" || token.length === 0) return null;
  const channel = payload.channel?.id;
  if (typeof channel !== "string" || channel.length === 0) return null;

  return {
    chatId: channel,
    text: token,
    from: payload.user?.username ?? payload.user?.name,
    action: token,
  };
}

/**
 * The message as blocks, with the buttons under it.
 *
 * `action_id` has to be unique within a message, and so is the token: two buttons of one message
 * never name the same choice.
 */
export function blocksFor(text: string, buttons: BridgeButton[]): unknown[] {
  return [
    { type: "section", text: { type: "mrkdwn", text } },
    {
      type: "actions",
      elements: buttons.map(b => ({
        type: "button",
        text: { type: "plain_text", text: b.label, emoji: true },
        action_id: b.token,
        value: b.token,
        ...(b.style === "primary" ? { style: "primary" } : b.style === "danger" ? { style: "danger" } : {}),
      })),
    },
  ];
}
