import { describe, it, expect } from "vitest";
import { questionForComposer } from "../pending-question";
import type { AgentQuestion, Run } from "@/types";

describe("questionForComposer", () => {
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
    expect(questionForComposer({}, {}, { projectId: "p1", chatId: null, chatAgentIds: [] })).toBeNull();
  });

  it("ignores answered questions", () => {
    const q = { ...baseQuestion, status: "answered" as const };
    expect(questionForComposer({ q }, { r1: baseRun }, { projectId: "p1", chatId: null, chatAgentIds: [] })).toBeNull();
  });

  it("ignores questions from another project", () => {
    expect(questionForComposer({ q1: baseQuestion }, { r1: baseRun }, { projectId: "p2", chatId: null, chatAgentIds: [] })).toBeNull();
  });

  it("in orchestrator thread (chatId = null), ignores chat runs", () => {
    const chatRun = { ...baseRun, kind: "chat" as const };
    expect(questionForComposer({ q1: baseQuestion }, { r1: chatRun }, { projectId: "p1", chatId: null, chatAgentIds: [] })).toBeNull();
  });

  it("in a chat, ignores orchestrator thread runs", () => {
    expect(questionForComposer({ q1: baseQuestion }, { r1: baseRun }, { projectId: "p1", chatId: "c1", chatAgentIds: ["a1"] })).toBeNull();
  });

  it("in a chat, ignores questions from an agent not participating", () => {
    const chatRun = { ...baseRun, kind: "chat" as const };
    expect(questionForComposer({ q1: baseQuestion }, { r1: chatRun }, { projectId: "p1", chatId: "c1", chatAgentIds: ["a2"] })).toBeNull();
  });

  it("returns the oldest question and correct count", () => {
    const q1 = { ...baseQuestion, id: "q1", createdAt: 200 };
    const q2 = { ...baseQuestion, id: "q2", createdAt: 100 }; // oldest
    const q3 = { ...baseQuestion, id: "q3", createdAt: 300 };
    
    const runs = { r1: baseRun };
    const opts = { projectId: "p1", chatId: null, chatAgentIds: [] };

    const result = questionForComposer({ q1, q2, q3 }, runs, opts);
    expect(result?.question.id).toBe("q2");
    expect(result?.pending).toBe(3);
  });
});
