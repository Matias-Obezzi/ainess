import { getTransport } from "@/lib/transport";
import type { BridgeButton, BridgeProvider, IncomingMessage } from "./types";

/** Presses that still owe Telegram an `answerCallbackQuery`, or its client spins forever. */
export interface TelegramUpdates {
  messages: IncomingMessage[];
  nextOffset: number | null;
  callbackIds: string[];
}

export function updatesFrom(body: string): TelegramUpdates {
  try {
    const data = JSON.parse(body);
    if (!data || !Array.isArray(data.result)) {
      return { messages: [], nextOffset: null, callbackIds: [] };
    }

    const messages: IncomingMessage[] = [];
    const callbackIds: string[] = [];
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
      // A button press. `getUpdates` sends these alongside messages with no extra subscription, and
      // the chat is the one the message with the button was sent to — the same chat the allowlist
      // was checked against when it went out.
      const press = update.callback_query;
      if (press && typeof press.data === "string" && press.message?.chat?.id) {
        messages.push({
          chatId: String(press.message.chat.id),
          text: press.data,
          from: press.from?.username,
          action: press.data,
        });
        if (typeof press.id === "string") callbackIds.push(press.id);
      }
    }

    return {
      messages,
      nextOffset: maxUpdateId !== -1 ? maxUpdateId + 1 : null,
      callbackIds,
    };
  } catch {
    return { messages: [], nextOffset: null, callbackIds: [] };
  }
}

/** Telegram draws one row per button: a label is a sentence here, not a word. */
export function inlineKeyboard(buttons: BridgeButton[]): { inline_keyboard: Array<Array<{ text: string; callback_data: string }>> } {
  return { inline_keyboard: buttons.map(b => [{ text: b.label, callback_data: b.token }]) };
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
          const { messages, nextOffset, callbackIds } = updatesFrom(res.body);
          if (nextOffset !== null) {
            this.offset = nextOffset;
          }
          // Before the work, not after: until this lands the button keeps its loading spinner, and
          // the work behind it can take a whole run.
          for (const id of callbackIds) void this.answerCallback(id);
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

  /** Stops the spinner on the pressed button. Failing here costs nothing the user can see. */
  private async answerCallback(callbackId: string): Promise<void> {
    try {
      await getTransport().httpPost(
        `https://api.telegram.org/bot${this.token}/answerCallbackQuery`,
        JSON.stringify({ callback_query_id: callbackId }),
        { "Content-Type": "application/json" },
      );
    } catch { /* the press already arrived; the spinner is cosmetic */ }
  }

  async send(chatId: string, text: string, buttons?: BridgeButton[]): Promise<void> {
    const url = `https://api.telegram.org/bot${this.token}/sendMessage`;
    const clipped = text.length > 4096 ? text.slice(0, 4095) + "…" : text;
    const keyboard = buttons && buttons.length > 0 ? { reply_markup: inlineKeyboard(buttons) } : {};

    // Markdown is a courtesy, not a requirement: a stray asterisk in an agent's answer makes
    // Telegram refuse the whole message, and the message matters more than the formatting.
    const body = (markdown: boolean) => JSON.stringify({
      chat_id: chatId,
      text: clipped,
      ...(markdown ? { parse_mode: "Markdown" } : {}),
      disable_web_page_preview: true,
      ...keyboard,
    });
    const headers = { "Content-Type": "application/json" };
    const first = await getTransport().httpPost(url, body(true), headers);
    if (first.status !== 200) await getTransport().httpPost(url, body(false), headers);
  }
}
