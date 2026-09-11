import { getTransport } from "@/lib/transport";
import type { BridgeButton, BridgeProvider, IncomingMessage } from "./types";
import { blocksFor, envelopeIdOf, messageFrom, pressFrom } from "./slack-events";

/**
 * Socket Mode, not the Events API: the app opens the connection, so there is no public URL to
 * expose. The catch is that the URL it connects to is single-use and expires — every reconnect,
 * including the first one, has to ask for a fresh one with the app-level token. Once inside, every
 * envelope has to be acknowledged on the socket itself, or Slack resends it up to three times.
 */
export class SlackProvider implements BridgeProvider {
  id = "slack" as const;
  private running = false;
  private socket: WebSocket | null = null;
  private reconnectTimer: ReturnType<typeof setTimeout> | null = null;
  private backoff = 1000;
  private onMessage: ((m: IncomingMessage) => void | Promise<void>) | null = null;

  constructor(private botToken: string, private appToken: string) {}

  async start(onMessage: (m: IncomingMessage) => void | Promise<void>): Promise<void> {
    if (this.running) return;
    this.running = true;
    this.onMessage = onMessage;
    this.backoff = 1000;
    await this.connect();
  }

  private async connect(): Promise<void> {
    if (!this.running) return;
    let url: string;
    try {
      url = await this.openConnection();
    } catch {
      this.scheduleReconnect();
      return;
    }
    if (!this.running) return;

    const socket = new WebSocket(url);
    this.socket = socket;
    socket.onmessage = (event) => void this.handleFrame(event);
    socket.onclose = () => this.scheduleReconnect();
    socket.onerror = () => socket.close();
  }

  private async openConnection(): Promise<string> {
    const res = await getTransport().httpPost(
      "https://slack.com/api/apps.connections.open",
      "",
      { Authorization: `Bearer ${this.appToken}` },
    );
    const data = JSON.parse(res.body) as { ok?: boolean; url?: string };
    if (!data.ok || !data.url) throw new Error("apps.connections.open failed");
    return data.url;
  }

  private async handleFrame(event: MessageEvent): Promise<void> {
    if (!this.running) return;
    let frame: unknown;
    try {
      frame = JSON.parse(String(event.data));
    } catch {
      return;
    }

    const envelopeId = envelopeIdOf(frame);
    // Acknowledge before doing anything else: processing a command can take a while, and Slack's
    // retry would arrive while we are still busy with the first delivery.
    if (envelopeId) this.socket?.send(JSON.stringify({ envelope_id: envelopeId }));

    const parsed = frame as { type?: string };
    if (parsed.type === "hello") {
      this.backoff = 1000;
      return;
    }
    if (parsed.type === "disconnect") {
      this.socket?.close();
      return;
    }

    if (this.onMessage) {
      const message = messageFrom(frame) ?? pressFrom(frame);
      if (message) void this.onMessage(message);
    }
  }

  private scheduleReconnect(): void {
    this.socket = null;
    if (!this.running) return;
    this.reconnectTimer = setTimeout(() => void this.connect(), this.backoff);
    this.backoff = Math.min(this.backoff * 2, 30000);
  }

  async stop(): Promise<void> {
    this.running = false;
    this.onMessage = null;
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
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
    const clipped = text.length > 40000 ? text.slice(0, 39999) + "…" : text;
    // `text` stays alongside the blocks: it is what a notification and a screen reader get.
    const blocks = buttons && buttons.length > 0 ? { blocks: blocksFor(clipped, buttons) } : {};
    const res = await getTransport().httpPost(
      "https://slack.com/api/chat.postMessage",
      JSON.stringify({ channel: chatId, text: clipped, ...blocks }),
      { "Content-Type": "application/json", Authorization: `Bearer ${this.botToken}` },
    );
    // Slack answers 200 even on failure: the real verdict is `ok` in the body.
    let data: { ok?: boolean; error?: string };
    try {
      data = JSON.parse(res.body);
    } catch {
      throw new Error(`HTTP ${res.status}`);
    }
    if (res.status < 200 || res.status >= 300 || !data.ok) {
      throw new Error(data.error || `HTTP ${res.status}`);
    }
  }
}
