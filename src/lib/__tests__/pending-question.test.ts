import { describe, it, expect } from "vitest";
import { questionsForComposer } from "../pending-question";
import type { AgentQuestion, Run } from "@/types";

describe("questionsForComposer", () => {
  const baseQuestion: AgentQuestion = {
    id: "q1",
    projectId: "p1",
    agentId: "a1",
    runId: "r1",
    rootRunId: "root1",
    round: 1,
    question: "?",
    options: ["1"],
    multiple: false,
    allowOther: false,
    createdAt: 100,
    status: "pending",
  };

  const baseRun: Run = {
    id: "r1",
    projectId: "p1",
    agentId: "a1",
    parentRunId: null,
    rootRunId: "root1",
    prompt: "do",
    status: "running",
    startedAt: 90,
    output: "",
    rawLines: [],
    childRunIds: [],
    round: 1,
    kind: "task",
  };

  it("returns null if no questions match", () => {
    expect(questionsForComposer({}, {}, { projectId: "p1", chatId: null, chatAgentIds: [] })).toBeNull();
  });

  it("ignores answered questions", () => {
    const q = { ...baseQuestion, status: "answered" as const };
    expect(questionsForComposer({ q }, { r1: baseRun }, { projectId: "p1", chatId: null, chatAgentIds: [] })).toBeNull();
  });

  it("ignores questions from another project", () => {
    expect(questionsForComposer({ q1: baseQuestion }, { r1: baseRun }, { projectId: "p2", chatId: null, chatAgentIds: [] })).toBeNull();
  });

  it("in orchestrator thread (chatId = null), ignores chat runs", () => {
    const chatRun = { ...baseRun, kind: "chat" as const };
    expect(questionsForComposer({ q1: baseQuestion }, { r1: chatRun }, { projectId: "p1", chatId: null, chatAgentIds: [] })).toBeNull();
  });

  it("in a chat, ignores orchestrator thread runs", () => {
    expect(questionsForComposer({ q1: baseQuestion }, { r1: baseRun }, { projectId: "p1", chatId: "c1", chatAgentIds: ["a1"] })).toBeNull();
  });

  it("in a chat, ignores questions from an agent not participating", () => {
    const chatRun = { ...baseRun, kind: "chat" as const };
    expect(questionsForComposer({ q1: baseQuestion }, { r1: chatRun }, { projectId: "p1", chatId: "c1", chatAgentIds: ["a2"] })).toBeNull();
  });

  it("groups everything one turn asked, oldest first", () => {
    // All three come from `r1`: one turn, one group, answered together. Answering them one at a
    // time started a run per answer — three tasks on the board off a single question.
    const q1 = { ...baseQuestion, id: "q1", createdAt: 200 };
    const q2 = { ...baseQuestion, id: "q2", createdAt: 100 }; // oldest
    const q3 = { ...baseQuestion, id: "q3", createdAt: 300 };

    const runs = { r1: baseRun };
    const opts = { projectId: "p1", chatId: null, chatAgentIds: [] };

    const result = questionsForComposer({ q1, q2, q3 }, runs, opts);
    expect(result?.group.map(q => q.id)).toEqual(["q2", "q1", "q3"]);
    expect(result?.pending).toBe(3);
  });

  it("leaves another run's questions for their own turn", () => {
    // Two runs asking at once: the group is one turn's worth, and the count is everything waiting.
    const mine = { ...baseQuestion, id: "q1", runId: "r1", createdAt: 100 };
    const theirs = { ...baseQuestion, id: "q2", runId: "r2", createdAt: 200 };
    const runs = { r1: baseRun, r2: { ...baseRun, id: "r2" } };

    const result = questionsForComposer({ q1: mine, q2: theirs }, runs, { projectId: "p1", chatId: null, chatAgentIds: [] });
    expect(result?.group.map(q => q.id)).toEqual(["q1"]);
    expect(result?.pending).toBe(2);
  });
});
