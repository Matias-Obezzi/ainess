// What was typed into an agent's question survives navigation and synchronizes across instances.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useAppStore, flushStringMapSaves } from "@/store";
import { useQuestionDrafts } from "@/hooks/useQuestionDrafts";
import { pickOption, typeOther } from "@/lib/question-choice";
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

beforeEach(() => {
  useAppStore.setState({
    questions: { q1: question() },
    questionDrafts: {},
  });
});

afterEach(() => {
  vi.clearAllTimers();
  vi.useRealTimers();
  flushStringMapSaves();
});

describe("useQuestionDrafts", () => {
  it("survives unmount and remount when 'other' text was typed", () => {
    vi.useFakeTimers();
    const { result, unmount } = renderHook(() => useQuestionDrafts(["q1"]));

    act(() => {
      result.current.setChoice("q1", c => typeOther(c, "Use SQLite for now", false));
    });

    // Local state reflects typing immediately
    expect(result.current.choices.q1).toEqual({ chosen: [], other: "Use SQLite for now" });

    // Unmount before the 400ms debounce fires: should flush on unmount
    unmount();

    expect(useAppStore.getState().questionDrafts.q1).toEqual({ chosen: [], other: "Use SQLite for now" });

    // Remounting for the same question id recovers the draft
    const { result: remounted } = renderHook(() => useQuestionDrafts(["q1"]));
    expect(remounted.current.choices.q1).toEqual({ chosen: [], other: "Use SQLite for now" });
  });

  it("survives unmount and remount when an option was marked", () => {
    const { result, unmount } = renderHook(() => useQuestionDrafts(["q1"]));

    act(() => {
      result.current.setChoice("q1", c => pickOption(c, "Postgres", false));
    });

    // An option click writes immediately to the store
    expect(useAppStore.getState().questionDrafts.q1).toEqual({ chosen: ["Postgres"], other: "" });

    unmount();

    // Remounting retains the marked option
    const { result: remounted } = renderHook(() => useQuestionDrafts(["q1"]));
    expect(remounted.current.choices.q1).toEqual({ chosen: ["Postgres"], other: "" });
  });

  it("removes the draft when the question is answered", () => {
    useAppStore.setState({
      questions: { q1: question() },
      questionDrafts: { q1: { chosen: ["Postgres"], other: "" } },
    });

    const { result } = renderHook(() => useQuestionDrafts(["q1"]));
    expect(result.current.choices.q1).toEqual({ chosen: ["Postgres"], other: "" });

    act(() => {
      useAppStore.getState().answerQuestions([{ questionId: "q1", answer: ["Postgres"] }]);
    });

    // The draft is cleared from the store
    expect(useAppStore.getState().questionDrafts.q1).toBeUndefined();
    // And cleared from the hook instance via subscription
    expect(result.current.choices.q1).toBeUndefined();
  });

  it("drops drafts whose question is gone or answered on pruning/load", () => {
    useAppStore.setState({
      questions: {
        q1: question({ id: "q1", status: "pending" }),
        q2: question({ id: "q2", status: "answered" }),
      },
      questionDrafts: {
        q1: { chosen: ["Postgres"], other: "" },
        q2: { chosen: ["SQLite"], other: "" },
        q3: { chosen: [], other: "orphaned draft" },
      },
    });

    act(() => {
      // Every project's history is in: an unknown id is not a question still waiting to load.
      useAppStore.getState().pruneQuestionDrafts(true);
    });

    // q2 was answered, q3 was gone from questions: both are pruned
    expect(useAppStore.getState().questionDrafts).toEqual({
      q1: { chosen: ["Postgres"], other: "" },
    });
  });

  it("adopts changes from a second instance in the first instance", () => {
    vi.useFakeTimers();
    const { result: instance1 } = renderHook(() => useQuestionDrafts(["q1"]));
    const { result: instance2 } = renderHook(() => useQuestionDrafts(["q1"]));

    // Instance 2 picks an option (immediate write)
    act(() => {
      instance2.current.setChoice("q1", c => pickOption(c, "SQLite", false));
    });

    // Instance 1 adopts it immediately without a remount
    expect(instance1.current.choices.q1).toEqual({ chosen: ["SQLite"], other: "" });

    // Instance 2 types in "other" (debounced)
    act(() => {
      instance2.current.setChoice("q1", c => typeOther(c, "Neither", false));
    });

    // Before timer fires, instance 1 still has the previous value
    expect(instance1.current.choices.q1).toEqual({ chosen: ["SQLite"], other: "" });

    // After 400ms debounce fires in instance 2
    act(() => {
      vi.advanceTimersByTime(400);
    });

    // Instance 1 adopts the debounced write
    expect(instance1.current.choices.q1).toEqual({ chosen: [], other: "Neither" });
  });
});
