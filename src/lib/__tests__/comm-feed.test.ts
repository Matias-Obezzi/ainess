import { describe, it, expect } from "vitest";
import { splitChatPrefix, withoutRepeatedResults } from "@/lib/comm-feed";
import type { CommMessage, MessageKind } from "@/types";

const msg = (id: string, kind: MessageKind, text: string, runId?: string): CommMessage => ({
  id, ts: 1, fromAgentId: "a", toAgentId: "user", kind, text, runId,
});

describe("withoutRepeatedResults", () => {
  const full = "Hello there. ".repeat(100);

  it("hides a result identical to its text", () => {
    const out = withoutRepeatedResults([msg("t", "text", full, "r1"), msg("r", "result", full, "r1")]);
    expect(out.map(m => m.id)).toEqual(["t"]);
  });

  it("hides a chat result cut at 500 with its prefix", () => {
    const r = msg("r", "result", `[Chat: Room: dev] ${full.substring(0, 500)}`, "r1");
    expect(withoutRepeatedResults([msg("t", "text", full, "r1"), r]).map(m => m.id)).toEqual(["t"]);
  });

  it("keeps a result that adds something", () => {
    const out = withoutRepeatedResults([msg("t", "text", "short", "r1"), msg("r", "result", "short and more", "r1")]);
    expect(out.map(m => m.id)).toEqual(["t", "r"]);
  });

  it("keeps a result of another run", () => {
    const out = withoutRepeatedResults([msg("t", "text", full, "r1"), msg("r", "result", full, "r2")]);
    expect(out).toHaveLength(2);
  });

  it("keeps a result without runId", () => {
    const out = withoutRepeatedResults([msg("t", "text", full, "r1"), msg("r", "result", full)]);
    expect(out).toHaveLength(2);
  });

  it("keeps the result when the text row is not in the list", () => {
    const out = withoutRepeatedResults([msg("r", "result", full, "r1")]);
    expect(out.map(m => m.id)).toEqual(["r"]);
  });
});

describe("withoutRepeatedResults inheritance", () => {
  const full = "Hello there. ".repeat(100);
  const text = () => ({ ...msg("t", "text", full, "r1"), toAgentId: undefined });

  it("gives the kept text the chat prefix and toAgentId of the hidden result", () => {
    const r = { ...msg("r", "result", `[Chat: Room: dev] ${full.substring(0, 500)}`, "r1"), toAgentId: "user" };
    const out = withoutRepeatedResults([text(), r]);
    expect(out).toHaveLength(1);
    expect(out[0].toAgentId).toBe("user");
    expect(out[0].text).toBe(`[Chat: Room: dev] ${full}`);
  });

  it("passes toAgentId without adding a prefix when the result is not a chat's", () => {
    const out = withoutRepeatedResults([text(), { ...msg("r", "result", full, "r1"), toAgentId: "user" }]);
    expect(out[0].toAgentId).toBe("user");
    expect(out[0].text).toBe(full);
  });

  it("does not mutate its input and returns the same array when nothing is hidden", () => {
    const t = text();
    const r = { ...msg("r", "result", `[Chat: x] ${full}`, "r1"), toAgentId: "user" };
    withoutRepeatedResults([t, r]);
    expect(t.toAgentId).toBeUndefined();
    expect(t.text).toBe(full);
    const same = [t, msg("r2", "result", "other", "r1")];
    expect(withoutRepeatedResults(same)).toBe(same);
  });
});

describe("splitChatPrefix", () => {
  it("splits a prefix", () => {
    expect(splitChatPrefix("[Chat: Room] hi")).toEqual({ chat: "Room", body: "hi" });
  });
  it("keeps a colon in the name", () => {
    expect(splitChatPrefix("[Chat: Room: dev] hi")).toEqual({ chat: "Room: dev", body: "hi" });
  });
  it("leaves text without a prefix", () => {
    expect(splitChatPrefix("hi [Chat: x] there")).toEqual({ body: "hi [Chat: x] there" });
  });
});
