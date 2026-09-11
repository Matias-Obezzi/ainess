// What the app does with a button press, and which messages get buttons at all.
//
// A press arrives from the network, so nothing in it is taken at face value: the id has to match
// something still pending and the option index has to be inside that question's own list. A token
// for an approval somebody already decided from the desktop resolves to nothing, which is the
// right answer — the alternative is a stale button that decides it a second time.
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { buttonsFor, commandForPress } from "@/lib/bridge";
import type { AgentQuestion, AppNotification } from "@/types";

const QUESTION_ID = "3f2a1b2c-0000-4000-8000-000000000000";

const question = (over: Partial<AgentQuestion> = {}): AgentQuestion => ({
  id: QUESTION_ID,
  projectId: "p1", agentId: "a1", runId: "r1", rootRunId: "r1", round: 0,
  question: "¿Uso Postgres?", options: ["Postgres", "SQLite"], multiple: false, allowOther: true,
  status: "pending", createdAt: 1,
  ...over,
});

const notification = (over: Partial<AppNotification> = {}): AppNotification => ({
  id: "n1", kind: "question", title: "Pregunta", ts: 1, read: false, ...over,
});

const state = () => useAppStore.getState();

beforeEach(() => {
  useAppStore.setState({ questions: { [QUESTION_ID]: question() } } as never);
});

describe("commandForPress", () => {
  it("turns a press into the answer the option says, with the question's full id", () => {
    expect(commandForPress("q:3f2a1b2c:1", state()))
      .toEqual({ kind: "answer", id: QUESTION_ID, text: "SQLite" });
  });

  it("turns the two approval buttons into their commands", () => {
    expect(commandForPress("a:9c8d7e6f", state())).toEqual({ kind: "approve", id: "9c8d7e6f" });
    expect(commandForPress("r:9c8d7e6f", state())).toEqual({ kind: "reject", id: "9c8d7e6f" });
  });

  it("refuses a press for a question that is already answered", () => {
    useAppStore.setState({ questions: { [QUESTION_ID]: question({ status: "answered" }) } } as never);
    expect(commandForPress("q:3f2a1b2c:0", state())).toBeNull();
  });

  it("refuses a press naming a question that does not exist", () => {
    expect(commandForPress("q:deadbeef:0", state())).toBeNull();
  });

  it("refuses an option the question does not have", () => {
    // The list is read here, not sent over the wire: an index past its end names nothing.
    expect(commandForPress("q:3f2a1b2c:5", state())).toBeNull();
  });

  it("refuses a token the app never minted", () => {
    expect(commandForPress("rm -rf /", state())).toBeNull();
    expect(commandForPress("", state())).toBeNull();
  });
});

describe("buttonsFor", () => {
  it("puts the options under a question", () => {
    const buttons = buttonsFor(notification({ questionId: QUESTION_ID }), state());
    expect(buttons?.map(b => b.label)).toEqual(["Postgres", "SQLite"]);
  });

  it("puts a yes and a no under an approval", () => {
    const buttons = buttonsFor(notification({ kind: "approval", approvalId: "9c8d7e6f-0000-4000-8000-000000000000" }), state());
    expect(buttons).toHaveLength(2);
  });

  it("puts none under news, where a button would do nothing", () => {
    expect(buttonsFor(notification({ kind: "info" as never }), state())).toBeUndefined();
  });

  it("puts none under a question that has since been answered", () => {
    useAppStore.setState({ questions: { [QUESTION_ID]: question({ status: "answered" }) } } as never);
    expect(buttonsFor(notification({ questionId: QUESTION_ID }), state())).toBeUndefined();
  });

  it("puts none under a question that takes several answers", () => {
    useAppStore.setState({ questions: { [QUESTION_ID]: question({ multiple: true }) } } as never);
    expect(buttonsFor(notification({ questionId: QUESTION_ID }), state())).toBeUndefined();
  });
});
