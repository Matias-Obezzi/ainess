// Answering from a chat by pressing a button instead of typing an id.
//
// Two halves. Going out, a token has to fit Telegram's 64 bytes of callback data whatever the
// option says, which is why what travels is `q:3f2a1b2c:2` and not the answer. Coming back, the
// token arrives from the network: `parseActionToken` is the boundary, and everything it carries is
// looked up on this side rather than believed.
import { describe, it, expect } from "vitest";
import {
  actionToken,
  approvalButtons,
  MAX_OPTION_BUTTONS,
  parseActionToken,
  questionButtons,
} from "@/lib/bridge/actions";
import { componentsFor, pressFrom as discordPress } from "@/lib/bridge/discord-events";
import { blocksFor, pressFrom as slackPress } from "@/lib/bridge/slack-events";
import { inlineKeyboard, updatesFrom } from "@/lib/bridge/telegram";
import type { AgentQuestion } from "@/types";

const question = (over: Partial<AgentQuestion> = {}): AgentQuestion => ({
  id: "3f2a1b2c-0000-4000-8000-000000000000",
  projectId: "p1", agentId: "a1", runId: "r1", rootRunId: "r1", round: 0,
  question: "¿Uso Postgres?", options: ["Postgres", "SQLite"], multiple: false, allowOther: true,
  status: "pending", createdAt: 1,
  ...over,
});

describe("tokens", () => {
  it("fits in Telegram's 64 bytes however long the option is", () => {
    const long = question({ options: ["x".repeat(500)] });
    for (const button of questionButtons(long)) {
      expect(button.token.length).toBeLessThanOrEqual(64);
    }
  });

  it("survives the round trip", () => {
    const id = "3f2a1b2c-0000-4000-8000-000000000000";
    expect(parseActionToken(actionToken({ kind: "approve", id }))).toEqual({ kind: "approve", id: "3f2a1b2c" });
    expect(parseActionToken(actionToken({ kind: "reject", id }))).toEqual({ kind: "reject", id: "3f2a1b2c" });
    expect(parseActionToken(actionToken({ kind: "answer", id, option: 2 })))
      .toEqual({ kind: "answer", id: "3f2a1b2c", option: 2 });
  });

  it("refuses anything it did not mint", () => {
    for (const token of ["", "a", "a:", "x:3f2a1b2c", "a:3f2a1b2c:1", "q:3f2a1b2c", "q:zzz:0", "a:../../etc"]) {
      expect({ token, parsed: parseActionToken(token) }).toEqual({ token, parsed: null });
    }
  });

  it("refuses an option index outside what a message can hold", () => {
    expect(parseActionToken("q:3f2a1b2c:-1")).toBeNull();
    expect(parseActionToken(`q:3f2a1b2c:${MAX_OPTION_BUTTONS}`)).toBeNull();
    expect(parseActionToken("q:3f2a1b2c:1e3")).toBeNull();
  });
});

describe("buttons", () => {
  it("gives an approval a yes and a no, and marks which is which", () => {
    const buttons = approvalButtons("3f2a1b2c-0000-4000-8000-000000000000", { approve: "Aprobar", reject: "Rechazar" });
    expect(buttons.map(b => b.label)).toEqual(["Aprobar", "Rechazar"]);
    expect(buttons.map(b => b.style)).toEqual(["primary", "danger"]);
  });

  it("gives a question one button per option", () => {
    expect(questionButtons(question()).map(b => b.label)).toEqual(["Postgres", "SQLite"]);
  });

  it("gives none to a question that takes several answers", () => {
    // One press is one option, which is a different answer from the one being asked for.
    expect(questionButtons(question({ multiple: true }))).toEqual([]);
  });

  it("stops at what a message can hold", () => {
    const many = question({ options: Array.from({ length: 30 }, (_, i) => `op${i}`) });
    expect(questionButtons(many)).toHaveLength(MAX_OPTION_BUTTONS);
  });

  it("cuts a label short enough for every platform", () => {
    const [button] = questionButtons(question({ options: ["y".repeat(200)] }));
    expect(button.label.length).toBeLessThanOrEqual(60);
    expect(button.label.endsWith("…")).toBe(true);
  });

  it("flattens a label that runs onto another line", () => {
    const [button] = questionButtons(question({ options: ["dos\nlíneas"] }));
    expect(button.label).toBe("dos líneas");
  });
});

describe("telegram", () => {
  const press = (data: string) => JSON.stringify({
    result: [{ update_id: 7, callback_query: { id: "cb1", data, from: { username: "matias" }, message: { chat: { id: 42 } } } }],
  });

  it("reads a press as a message carrying its token", () => {
    const { messages } = updatesFrom(press("a:3f2a1b2c"));
    expect(messages).toEqual([{ chatId: "42", text: "a:3f2a1b2c", from: "matias", action: "a:3f2a1b2c" }]);
  });

  it("keeps the press id, which Telegram wants acknowledged", () => {
    expect(updatesFrom(press("a:3f2a1b2c")).callbackIds).toEqual(["cb1"]);
  });

  it("still advances the offset past a press, so it is not replayed forever", () => {
    expect(updatesFrom(press("a:3f2a1b2c")).nextOffset).toBe(8);
  });

  it("says nothing about presses when there are none", () => {
    const body = JSON.stringify({ result: [{ update_id: 1, message: { text: "hola", chat: { id: 9 } } }] });
    expect(updatesFrom(body).callbackIds).toEqual([]);
  });

  it("draws one button per row, which is how a sentence fits on a phone", () => {
    const keyboard = inlineKeyboard(questionButtons(question()));
    expect(keyboard.inline_keyboard).toEqual([
      [{ text: "Postgres", callback_data: "q:3f2a1b2c:0" }],
      [{ text: "SQLite", callback_data: "q:3f2a1b2c:1" }],
    ]);
  });
});

describe("discord", () => {
  const frame = (over: Record<string, unknown> = {}) => ({
    op: 0,
    t: "INTERACTION_CREATE",
    d: {
      id: "i1", token: "tok", type: 3, channel_id: "c9",
      data: { custom_id: "a:3f2a1b2c" },
      member: { user: { username: "matias" } },
      ...over,
    },
  });

  it("reads a component interaction as a press", () => {
    const press = discordPress(frame());
    expect(press?.message).toEqual({ chatId: "c9", text: "a:3f2a1b2c", from: "matias", action: "a:3f2a1b2c" });
    expect(press).toMatchObject({ interactionId: "i1", interactionToken: "tok" });
  });

  it("leaves interactions that are not ours alone", () => {
    // 2 is a slash command; reading it as a button press would answer something nobody asked.
    expect(discordPress(frame({ type: 2 }))).toBeNull();
    expect(discordPress({ op: 0, t: "MESSAGE_CREATE", d: {} })).toBeNull();
    expect(discordPress(null)).toBeNull();
  });

  it("packs buttons into rows of five", () => {
    const many = question({ options: Array.from({ length: 7 }, (_, i) => `op${i}`) });
    const rows = componentsFor(questionButtons(many));
    expect(rows.map(r => r.components.length)).toEqual([5, 2]);
  });
});

describe("slack", () => {
  const envelope = (over: Record<string, unknown> = {}) => ({
    type: "interactive",
    envelope_id: "e1",
    payload: {
      type: "block_actions",
      actions: [{ action_id: "a:3f2a1b2c", value: "a:3f2a1b2c" }],
      channel: { id: "C9" },
      user: { username: "matias" },
      ...over,
    },
  });

  it("reads a block action as a press", () => {
    expect(slackPress(envelope())).toEqual({ chatId: "C9", text: "a:3f2a1b2c", from: "matias", action: "a:3f2a1b2c" });
  });

  it("leaves other interactive payloads alone", () => {
    expect(slackPress(envelope({ type: "view_submission" }))).toBeNull();
    expect(slackPress({ type: "events_api", payload: {} })).toBeNull();
  });

  it("keeps the plain text beside the blocks, which is what a notification reads out", () => {
    const blocks = blocksFor("¿Uso Postgres?", questionButtons(question())) as Array<Record<string, never>>;
    expect(blocks).toHaveLength(2);
    expect(blocks[0]).toMatchObject({ type: "section" });
    expect(blocks[1]).toMatchObject({ type: "actions" });
  });
});
