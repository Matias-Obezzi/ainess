import { getTransport } from "@/lib/transport";
import type { BridgeProvider, IncomingMessage } from "./types";

export function updatesFrom(body: string): { messages: IncomingMessage[]; nextOffset: number | null } {
  try {
    const data = JSON.parse(body);
    if (!data || !Array.isArray(data.result)) {
      return { messages: [], nextOffset: null };
    }

    const messages: IncomingMessage[] = [];
    let maxUpdateId = -1;

    for (const update of data.result) {
      if (typeof update.update_id === "number" && update.update_id > maxUpdateId) {
        maxUpdateId = update.update_id;
      }
      if (update.message && typeof update.message.text === "string" && update.message.chat && update.message.chat.id) {
        messages.push({
          chatId: String(update.message.chat.id),
          text: update.message.text,
          from: update.message.from?.username,
        });
      }
    }

    return {
      messages,
      nextOffset: maxUpdateId !== -1 ? maxUpdateId + 1 : null,
    };
  } catch {
    return { messages: [], nextOffset: null };
  }
}

export class TelegramProvider implements BridgeProvider {
  id = "telegram" as const;
  private running = false;
  private offset = 0;
  
  constructor(private token: string) {}

  async start(onMessage: (m: IncomingMessage) => void | Promise<void>): Promise<void> {
    if (this.running) return;
    this.running = true;
    
    let backoff = 1000;
    
    while (this.running) {
      try {
        const url = `https://api.telegram.org/bot${this.token}/getUpdates?offset=${this.offset}&timeout=30`;
        const res = await getTransport().httpGet(url, {});
        
        if (!this.running) break;
        
        if (res.status === 200) {
          backoff = 1000;
          const { messages, nextOffset } = updatesFrom(res.body);
          if (nextOffset !== null) {
            this.offset = nextOffset;
          }
          for (const msg of messages) {
            if (!this.running) break;
            await onMessage(msg);
          }
        } else {
          throw new Error(`HTTP ${res.status}`);
        }
      } catch {
        if (!this.running) break;
        await new Promise(resolve => setTimeout(resolve, backoff));
        backoff = Math.min(backoff * 2, 30000);
      }
    }
  }

  async stop(): Promise<void> {
    this.running = false;
  }

  async send(chatId: string, text: string): Promise<void> {
    const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
    const clipped = text.length > 4096 ? text.slice(0, 4095) + "…" : text;
    
    // Markdown is a courtesy, not a requirement: a stray asterisk in an agent's answer makes
    // Telegram refuse the whole message, and the message matters more than the formatting.
    const body = (markdown: boolean) => JSON.stringify({
      chat_id: chatId,
      text: clipped,
      ...(markdown ? { parse_mode: "Markdown" } : {}),
      disable_web_page_preview: true,
    });
    const headers = { "Content-Type": "application/json" };
    const first = await getTransport().httpPost(url, body(true), headers);
    if (first.status !== 200) await getTransport().httpPost(url, body(false), headers);
  }
}
