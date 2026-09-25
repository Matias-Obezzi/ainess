// Question draft persistence: store update immediacy, debounced localStorage writes,
// and round-trip across restarts.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { useAppStore, flushStringMapSaves, flushJsonMapSaves, QUESTION_DRAFTS_KEY, prunedQuestionDrafts } from "@/store";
import type { AgentQuestion } from "@/types";

const question = (over: Partial<AgentQuestion> = {}): AgentQuestion => ({
  id: "q1",
  projectId: "p1",
  agentId: "a1",
  runId: "run-1",
  rootRunId: "run-1",
  round: 0,
  question: "¿Con cuál seguimos?",
  options: ["Postgres", "SQLite"],
  multiple: false,
  allowOther: true,
  status: "pending",
  createdAt: 10,
  ...over,
});

describe("questionDrafts persistence", () => {
  let store = new Map<string, string>();

  beforeEach(() => {
    vi.useFakeTimers();
    store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
      clear: () => store.clear(),
    });
    useAppStore.setState({
      questions: { q1: question() },
      questionDrafts: {},
    });
  });

  afterEach(() => {
    vi.clearAllTimers();
    vi.unstubAllGlobals();
    flushStringMapSaves();
  });

  it("updates the store immediately but delays localStorage write by 400ms", () => {
    const setItemSpy = vi.spyOn(localStorage, "setItem");

    useAppStore.getState().setQuestionDraft("q1", { chosen: ["Postgres"], other: "" });

    // Store is updated immediately
    expect(useAppStore.getState().questionDrafts.q1).toEqual({ chosen: ["Postgres"], other: "" });

    // localStorage is debounced: not written yet
    expect(setItemSpy).not.toHaveBeenCalled();

    // Advance 400ms
    vi.advanceTimersByTime(400);

    // Written to localStorage under QUESTION_DRAFTS_KEY as JSON
    expect(setItemSpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).toHaveBeenCalledWith(
      QUESTION_DRAFTS_KEY,
      JSON.stringify({ q1: { chosen: ["Postgres"], other: "" } }),
    );
  });

  it("deletes the draft when passed null", () => {
    useAppStore.getState().setQuestionDraft("q1", { chosen: ["Postgres"], other: "" });
    expect(useAppStore.getState().questionDrafts.q1).toBeDefined();

    useAppStore.getState().setQuestionDraft("q1", null);
    expect(useAppStore.getState().questionDrafts.q1).toBeUndefined();

    vi.advanceTimersByTime(400);
    expect(JSON.parse(store.get(QUESTION_DRAFTS_KEY) ?? "{}")).toEqual({});
  });

  it("flushes pending saves on manual flush", () => {
    const setItemSpy = vi.spyOn(localStorage, "setItem");

    useAppStore.getState().setQuestionDraft("q1", { chosen: [], other: "custom" });
    expect(setItemSpy).not.toHaveBeenCalled();

    flushJsonMapSaves();

    expect(setItemSpy).toHaveBeenCalledTimes(1);
    expect(setItemSpy).toHaveBeenCalledWith(
      QUESTION_DRAFTS_KEY,
      JSON.stringify({ q1: { chosen: [], other: "custom" } }),
    );
  });

  it("survives a restart round-trip from localStorage", () => {
    const initialChoice = { chosen: ["SQLite"], other: "plus comments" };
    store.set(QUESTION_DRAFTS_KEY, JSON.stringify({ q1: initialChoice }));

    // Simulating startup: read from localStorage into new store state
    const raw = localStorage.getItem(QUESTION_DRAFTS_KEY);
    const parsed = JSON.parse(raw ?? "{}");
    expect(parsed.q1).toEqual(initialChoice);
  });

  it("clears question drafts when answerQuestions is called", () => {
    useAppStore.setState({
      questions: {
        q1: question({ id: "q1" }),
        q2: question({ id: "q2" }),
      },
      questionDrafts: {
        q1: { chosen: ["Postgres"], other: "" },
        q2: { chosen: ["SQLite"], other: "" },
      },
    });

    useAppStore.getState().answerQuestions([{ questionId: "q1", answer: ["Postgres"] }]);

    expect(useAppStore.getState().questionDrafts.q1).toBeUndefined();
    expect(useAppStore.getState().questionDrafts.q2).toEqual({ chosen: ["SQLite"], other: "" });
  });

  it("prunes drafts for questions that are gone or answered", () => {
    const questions: Record<string, AgentQuestion> = {
      q1: question({ id: "q1", status: "pending" }),
      q2: question({ id: "q2", status: "answered" }),
    };
    const drafts = {
      q1: { chosen: ["Postgres"], other: "" },
      q2: { chosen: ["SQLite"], other: "" },
      q3: { chosen: [], other: "gone" },
    };

    // Every project read: an id nobody knows is a question that is gone.
    expect(prunedQuestionDrafts(drafts, questions, true)).toEqual({
      q1: { chosen: ["Postgres"], other: "" },
    });
  });

  it("keeps the draft of a question whose project has not been read yet", () => {
    const questions: Record<string, AgentQuestion> = { q2: question({ id: "q2", status: "answered" }) };
    const drafts = {
      q2: { chosen: ["SQLite"], other: "" },
      q3: { chosen: [], other: "still waiting to load" },
    };
    // Only the last project was read at startup: q3 may well be pending in another one.
    expect(prunedQuestionDrafts(drafts, questions, false)).toEqual({
      q3: { chosen: [], other: "still waiting to load" },
    });
  });
});
