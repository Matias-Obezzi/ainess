import { getTransport } from "@/lib/transport";
import type { BridgeProvider, IncomingMessage } from "./types";
import { messageFrom } from "./discord-events";

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
      if (message) void this.onMessage(message);
    }
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

  async send(chatId: string, text: string): Promise<void> {
    const url = `https://discord.com/api/v10/channels/${chatId}/messages`;
    const clipped = text.length > 2000 ? text.slice(0, 1999) + "…" : text;
    const res = await getTransport().httpPost(url, JSON.stringify({ content: clipped }), {
      "Content-Type": "application/json",
      Authorization: `Bot ${this.token}`,
    });
    if (res.status < 200 || res.status >= 300) throw new Error(`HTTP ${res.status}`);
  }
}
