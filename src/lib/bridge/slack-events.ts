import type { IncomingMessage } from "./types";

interface SlackEvent {
  type?: string;
  channel?: string;
  text?: string;
  user?: string;
  bot_id?: string;
  subtype?: string;
}

interface SocketModeFrame {
  type?: string;
  envelope_id?: string;
  payload?: { event?: SlackEvent };
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
