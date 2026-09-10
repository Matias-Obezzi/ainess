import { describe, it, expect } from "vitest";
import { messageFrom } from "@/lib/bridge/discord-events";

const messageCreate = (overrides: Record<string, unknown> = {}) => ({
  op: 0,
  t: "MESSAGE_CREATE",
  s: 3,
  d: {
    channel_id: "555",
    content: "hola",
    author: { username: "matias", bot: false },
    ...overrides,
  },
});

describe("messageFrom", () => {
  it("reads the chat, the text and the author from a real MESSAGE_CREATE", () => {
    expect(messageFrom(messageCreate())).toEqual({
      chatId: "555",
      text: "hola",
      from: "matias",
    });
  });

  it("returns null for a message from the bot itself, or the reply would answer itself forever", () => {
    expect(messageFrom(messageCreate({ author: { username: "ainess", bot: true } }))).toBeNull();
  });

  it("returns null for any other op", () => {
    expect(messageFrom({ op: 10, t: "HELLO", d: { heartbeat_interval: 41250 } })).toBeNull();
  });

  it("returns null for a dispatch of another type", () => {
    expect(messageFrom({ op: 0, t: "READY", d: {} })).toBeNull();
  });

  it("returns null for empty content", () => {
    expect(messageFrom(messageCreate({ content: "" }))).toBeNull();
  });

  it("never throws on a broken frame", () => {
    expect(messageFrom(undefined)).toBeNull();
    expect(messageFrom(null)).toBeNull();
    expect(messageFrom("basura")).toBeNull();
    expect(messageFrom(42)).toBeNull();
    expect(messageFrom({})).toBeNull();
    expect(messageFrom({ op: 0, t: "MESSAGE_CREATE" })).toBeNull();
    expect(messageFrom({ op: 0, t: "MESSAGE_CREATE", d: null })).toBeNull();
    expect(messageFrom({ op: 0, t: "MESSAGE_CREATE", d: "basura" })).toBeNull();
    expect(messageFrom({ op: 0, t: "MESSAGE_CREATE", d: { content: "hola" } })).toBeNull();
  });
});
