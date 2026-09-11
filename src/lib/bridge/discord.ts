import { getTransport } from "@/lib/transport";
import type { BridgeButton, BridgeProvider, IncomingMessage } from "./types";
import { componentsFor, messageFrom, pressFrom } from "./discord-events";

const GATEWAY_URL = "wss://gateway.discord.gg/?v=10&encoding=json";

const OP_DISPATCH = 0;
const OP_HEARTBEAT = 1;
const OP_IDENTIFY = 2;
const OP_HELLO = 10;

// Receive messages posted in the guild text channels the bot can see.
const INTENT_GUILD_MESSAGES = 1 << 9;
// Receive messages sent directly to the bot in a DM.
const INTENT_DIRECT_MESSAGES = 1 << 12;
// Read the actual text of a message, not just that one arrived.
const INTENT_MESSAGE_CONTENT = 1 << 15;

const INTENTS = INTENT_GUILD_MESSAGES | INTENT_DIRECT_MESSAGES | INTENT_MESSAGE_CONTENT;

/**
 * The Gateway is a socket, not a poll: receiving means holding it open, sending the heartbeat it
 * asks for, and identifying with the token once it says hello. No RESUME, no sharding, no voice —
 * a dropped connection just gets a fresh IDENTIFY, which is all a single bot needs.
 */
export class DiscordProvider implements BridgeProvider {
  id = "discord" as const;
  private running = false;
  private socket: WebSocket | null = null;
  private heartbeatTimer: ReturnType<typeof setInterval> | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private lastSequence: number | null = null;
  private backoff = 1000;
  private onMessage: ((m: IncomingMessage) => void | Promise<void>) | null = null;

  constructor(private token: string) {}

  async start(onMessage: (m: IncomingMessage) => void | Promise<void>): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.onMessage = onMessage;
    this.backoff = 1000;
    this.connect();
  }

  private connect(): void {
    if (!this.running) return;
    const socket = new WebSocket(GATEWAY_URL);
    this.socket = socket;
    socket.onmessage = (event) => this.handleFrame(event);
    socket.onclose = () => this.scheduleReconnect();
    socket.onerror = () => socket.close();
  }

  private handleFrame(event: MessageEvent): void {
    if (!this.running) return;
    let frame: unknown;
    try {
      frame = JSON.parse(String(event.data));
    } catch {
      return;
    }

    const parsed = frame as { op?: number; s?: number; d?: unknown };
    if (typeof parsed.s === "number") this.lastSequence = parsed.s;

    if (parsed.op === OP_HELLO) {
      this.backoff = 1000;
      const interval = (parsed.d as { heartbeat_interval?: number } | undefined)?.heartbeat_interval ?? 41250;
      this.startHeartbeat(interval);
      this.identify();
      return;
    }

    if (parsed.op === OP_DISPATCH && this.onMessage) {
      const message = messageFrom(parsed);
      if (message) {
        void this.onMessage(message);
        return;
      }
      // A button press. Discord gives three seconds to acknowledge it or the client shows the
      // interaction as failed, and the work behind the press can take a whole run — so the
      // acknowledgement goes first and the press is handled after it.
      const press = pressFrom(parsed);
      if (press) {
        void this.acknowledge(press.interactionId, press.interactionToken);
        void this.onMessage(press.message);
      }
    }
  }

  /** Type 6 is "I have it, leave the message as it is": no second message under every press. */
  private async acknowledge(interactionId: string, interactionToken: string): Promise<void> {
    try {
      await getTransport().httpPost(
        `https://discord.com/api/v10/interactions/${interactionId}/${interactionToken}/callback`,
        JSON.stringify({ type: 6 }),
        { "Content-Type": "application/json" },
      );
    } catch { /* the press already arrived; this only stops the spinner */ }
  }

  private identify(): void {
    this.socket?.send(JSON.stringify({
      op: OP_IDENTIFY,
      d: {
        token: this.token,
        intents: INTENTS,
        properties: { os: "linux", browser: "ainess", device: "ainess" },
      },
    }));
  }

  private startHeartbeat(intervalMs: number): void {
    this.stopHeartbeat();
    this.heartbeatTimer = setInterval(() => {
      if (this.socket?.readyState === WebSocket.OPEN) {
        this.socket.send(JSON.stringify({ op: OP_HEARTBEAT, d: this.lastSequence }));
      }
    }, intervalMs);
  }

  private stopHeartbeat(): void {
    if (this.heartbeatTimer) {
      clearInterval(this.heartbeatTimer);
      this.heartbeatTimer = null;
    }
  }

  private scheduleReconnect(): void {
    this.stopHeartbeat();
    this.socket = null;
    if (!this.running) return;
    this.reconnectTimer = setTimeout(() => this.connect(), this.backoff);
    this.backoff = Math.min(this.backoff * 2, 30000);
  }

  async stop(): Promise<void> {
    this.running = false;
    this.onMessage = null;
    this.stopHeartbeat();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    this.lastSequence = null;
    this.backoff = 1000;
    const socket = this.socket;
    this.socket = null;
    if (socket) {
      socket.onclose = null;
      socket.onerror = null;
      socket.onmessage = null;
      socket.close();
    }
  }

  async send(chatId: string, text: string, buttons?: BridgeButton[]): Promise<void> {
    const url = `https://discord.com/api/v10/channels/${chatId}/messages`;
    const clipped = text.length > 2000 ? text.slice(0, 1999) + "…" : text;
    const components = buttons && buttons.length > 0 ? { components: componentsFor(buttons) } : {};
    const res = await getTransport().httpPost(url, JSON.stringify({ content: clipped, ...components }), {
      "Content-Type": "application/json",
      Authorization: `Bot ${this.token}`,
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
  }
}
