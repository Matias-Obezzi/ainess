import { describe, it, expect } from "vitest";
import { updatesFrom } from "@/lib/bridge/telegram";

const body = (result: unknown) => JSON.stringify({ ok: true, result });

describe("updatesFrom", () => {
  it("reads the messages and where to carry on from", () => {
    const parsed = updatesFrom(body([
      { update_id: 10, message: { chat: { id: 42 }, text: "hola", from: { username: "matias" } } },
      { update_id: 11, message: { chat: { id: 42 }, text: "/status" } },
    ]));
    expect(parsed.messages).toEqual([
      { chatId: "42", text: "hola", from: "matias" },
      { chatId: "42", text: "/status", from: undefined },
    ]);
    // One past the last one seen, which is what stops Telegram from sending it all again.
    expect(parsed.nextOffset).toBe(12);
  });

  it("ignores what carries no text: a photo is not an order", () => {
    const parsed = updatesFrom(body([
      { update_id: 5, message: { chat: { id: 1 }, photo: [{ file_id: "x" }] } },
      { update_id: 6, edited_message: { chat: { id: 1 }, text: "arreglado" } },
    ]));
    expect(parsed.messages).toEqual([]);
    // The offset still moves, or those two would come back forever.
    expect(parsed.nextOffset).toBe(7);
  });

  it("survives an answer that is not what it should be", () => {
    expect(updatesFrom("")).toEqual({ messages: [], nextOffset: null, callbackIds: [] });
    expect(updatesFrom("<html>502</html>")).toEqual({ messages: [], nextOffset: null, callbackIds: [] });
    expect(updatesFrom(JSON.stringify({ ok: false, description: "unauthorized" }))).toEqual({ messages: [], nextOffset: null, callbackIds: [] });
    expect(updatesFrom(body([]))).toEqual({ messages: [], nextOffset: null, callbackIds: [] });
  });

  it("does not trip over a message with no chat", () => {
    const parsed = updatesFrom(body([{ update_id: 3, message: { text: "huérfano" } }]));
    expect(parsed.messages).toEqual([]);
    expect(parsed.nextOffset).toBe(4);
  });
});
