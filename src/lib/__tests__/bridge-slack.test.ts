import { describe, it, expect } from "vitest";
import { messageFrom, envelopeIdOf } from "@/lib/bridge/slack-events";

const eventsApi = (overrides: Record<string, unknown> = {}) => ({
  envelope_id: "env-1",
  type: "events_api",
  payload: {
    event: {
      type: "message",
      channel: "C123",
      text: "hola",
      user: "U456",
      ...overrides,
    },
  },
});

describe("messageFrom", () => {
  it("reads the channel, the text and the author from a real events_api envelope", () => {
    expect(messageFrom(eventsApi())).toEqual({
      chatId: "C123",
      text: "hola",
      from: "U456",
    });
  });

  it("returns null for a message from the bot itself, or the reply would answer itself forever", () => {
    expect(messageFrom(eventsApi({ bot_id: "B999" }))).toBeNull();
  });

  it("returns null for a subtype like an edit", () => {
    expect(messageFrom(eventsApi({ subtype: "message_changed" }))).toBeNull();
  });

  it("returns null for hello", () => {
    expect(messageFrom({ type: "hello" })).toBeNull();
  });

  it("returns null for disconnect", () => {
    expect(messageFrom({ type: "disconnect" })).toBeNull();
  });

  it("returns null for empty text", () => {
    expect(messageFrom(eventsApi({ text: "" }))).toBeNull();
  });

  it("never throws on a broken frame", () => {
    expect(messageFrom(undefined)).toBeNull();
    expect(messageFrom(null)).toBeNull();
    expect(messageFrom("basura")).toBeNull();
    expect(messageFrom(42)).toBeNull();
    expect(messageFrom({})).toBeNull();
    expect(messageFrom({ type: "events_api" })).toBeNull();
    expect(messageFrom({ type: "events_api", payload: null })).toBeNull();
    expect(messageFrom({ type: "events_api", payload: {} })).toBeNull();
    expect(messageFrom({ type: "events_api", payload: { event: { type: "reaction_added" } } })).toBeNull();
  });
});

describe("envelopeIdOf", () => {
  it("reads the id off a real envelope", () => {
    expect(envelopeIdOf(eventsApi())).toBe("env-1");
  });

  it("still returns the id when messageFrom discards the frame — or Slack resends it", () => {
    expect(envelopeIdOf(eventsApi({ bot_id: "B999" }))).toBe("env-1");
    expect(envelopeIdOf(eventsApi({ subtype: "message_changed" }))).toBe("env-1");
    expect(envelopeIdOf({ envelope_id: "env-2", type: "events_api", payload: { event: { type: "reaction_added" } } })).toBe("env-2");
  });

  it("returns null when there is none", () => {
    expect(envelopeIdOf({ type: "hello" })).toBeNull();
    expect(envelopeIdOf(undefined)).toBeNull();
    expect(envelopeIdOf(null)).toBeNull();
    expect(envelopeIdOf("basura")).toBeNull();
  });
});
