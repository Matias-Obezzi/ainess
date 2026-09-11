import type { BridgeButton, IncomingMessage } from "./types";

/** Discord's own numbers: an action row holds buttons, a button has a style. */
const ROW = 1;
const BUTTON = 2;
const STYLE_PRIMARY = 1;
const STYLE_SECONDARY = 2;
const STYLE_DANGER = 4;

/** Five buttons to a row, five rows to a message. */
const PER_ROW = 5;

interface GatewayFrame {
  op?: number;
  t?: string;
  d?: unknown;
}

/** A press, which arrives as an interaction and owes Discord an answer within three seconds. */
export interface DiscordPress {
  message: IncomingMessage;
  /** What `POST /interactions/{id}/{token}/callback` needs to stop the button spinning. */
  interactionId: string;
  interactionToken: string;
}

interface InteractionData {
  id?: string;
  token?: string;
  type?: number;
  channel_id?: string;
  data?: { custom_id?: string; component_type?: number };
  member?: { user?: { username?: string } };
  user?: { username?: string };
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

/** The buttons of a message, in rows Discord will accept. */
export function componentsFor(buttons: BridgeButton[]): Array<{ type: number; components: unknown[] }> {
  const style = (b: BridgeButton) =>
    b.style === "primary" ? STYLE_PRIMARY : b.style === "danger" ? STYLE_DANGER : STYLE_SECONDARY;

  const rows: Array<{ type: number; components: unknown[] }> = [];
  for (let i = 0; i < buttons.length; i += PER_ROW) {
    rows.push({
      type: ROW,
      components: buttons.slice(i, i + PER_ROW).map(b => ({
        type: BUTTON,
        style: style(b),
        label: b.label,
        custom_id: b.token,
      })),
    });
  }
  return rows;
}

/**
 * The press a Gateway frame carries, or null.
 *
 * Type 3 is a message component — the buttons this app sends. Slash commands and modals are other
 * numbers and are not ours, so they are left alone rather than read as something they are not.
 */
export function pressFrom(frame: unknown): DiscordPress | null {
  if (!frame || typeof frame !== "object") return null;
  const { op, t, d } = frame as GatewayFrame;
  if (op !== 0 || t !== "INTERACTION_CREATE") return null;
  if (!d || typeof d !== "object") return null;

  const data = d as InteractionData;
  if (data.type !== 3) return null;
  const token = data.data?.custom_id;
  if (typeof token !== "string" || token.length === 0) return null;
  if (typeof data.channel_id !== "string" || data.channel_id.length === 0) return null;
  if (typeof data.id !== "string" || typeof data.token !== "string") return null;

  return {
    message: {
      chatId: data.channel_id,
      text: token,
      from: data.member?.user?.username ?? data.user?.username,
      action: token,
    },
    interactionId: data.id,
    interactionToken: data.token,
  };
}
