import type { IncomingMessage } from "./types";

interface GatewayFrame {
  op?: number;
  t?: string;
  d?: unknown;
}

interface MessageCreateData {
  channel_id?: string;
  content?: string;
  author?: { username?: string; bot?: boolean };
}

/** The message a Gateway frame carries, or null when it is not one we act on. */
export function messageFrom(frame: unknown): IncomingMessage | null {
  if (!frame || typeof frame !== "object") return null;
  const { op, t, d } = frame as GatewayFrame;
  if (op !== 0 || t !== "MESSAGE_CREATE") return null;
  if (!d || typeof d !== "object") return null;

  const data = d as MessageCreateData;
  // A reply from our own bot coming back as an incoming message is how a bridge answers itself
  // forever: this is the one check that stops that loop.
  if (data.author?.bot === true) return null;
  if (typeof data.content !== "string" || data.content.length === 0) return null;
  if (typeof data.channel_id !== "string" || data.channel_id.length === 0) return null;

  return {
    chatId: data.channel_id,
    text: data.content,
    from: data.author?.username,
  };
}
