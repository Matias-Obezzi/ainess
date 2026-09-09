// Answering a question closes it, whichever box you typed the answer into.
//
// The bug this pins: writing the answer in the composer instead of the question's own field left
// the question pending for good. It came back into the composer every time you re-entered the
// chat, it stayed in the bell, on Home and in `/status`, and the run that asked it went on waiting
// for an answer it had already been given.
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { questionForComposer } from "@/lib/pending-question";
import type { AgentQuestion, Run } from "@/types";

const RUN: Run = {
  id: "run-1",
  projectId: "p1",
  agentId: "a1",
  parentRunId: null,
  rootRunId: "run-1",
  prompt: "hacé algo",
  status: "done",
  startedAt: 1,
  output: "",
  rawLines: [],
  childRunIds: [],
  round: 0,
};

const QUESTION: AgentQuestion = {
  id: "q1",
  runId: "run-1",
  projectId: "p1",
  agentId: "a1",
  rootRunId: "run-1",
  round: 0,
  question: "¿Con cuál seguimos?",
  options: ["Postgres", "SQLite"],
  multiple: false,
  allowOther: true,
  status: "pending",
  createdAt: 10,
};

const composerSees = () => {
  const s = useAppStore.getState();
  return questionForComposer(s.questions, s.runs, { projectId: "p1", chatId: null, chatAgentIds: [] });
};

describe("a question the composer answered", () => {
  beforeEach(() => {
    useAppStore.setState({ questions: { q1: QUESTION }, runs: { "run-1": RUN } });
  });

  it("takes over the composer while it is pending", () => {
    expect(composerSees()?.question.id).toBe("q1");
  });

  it("lets go once answered, and does not come back", () => {
    useAppStore.getState().answerQuestion("q1", ["ninguna de las dos, usemos SQLite por ahora"]);

    expect(useAppStore.getState().questions.q1.status).toBe("answered");
    expect(useAppStore.getState().questions.q1.answer).toEqual(["ninguna de las dos, usemos SQLite por ahora"]);
    // Re-entering the chat asks the same question of the same state, and gets nothing.
    expect(composerSees()).toBeNull();
  });

  it("keeps the next one when there was more than one waiting", () => {
    const second: AgentQuestion = { ...QUESTION, id: "q2", createdAt: 20 };
    useAppStore.setState({ questions: { q1: QUESTION, q2: second } });

    expect(composerSees()?.pending).toBe(2);
    useAppStore.getState().answerQuestion("q1", ["la primera"]);

    const left = composerSees();
    expect(left?.question.id).toBe("q2");
    expect(left?.pending).toBe(1);
  });

  it("does nothing to a question that was already answered", () => {
    useAppStore.getState().answerQuestion("q1", ["primera respuesta"]);
    useAppStore.getState().answerQuestion("q1", ["segunda respuesta"]);
    expect(useAppStore.getState().questions.q1.answer).toEqual(["primera respuesta"]);
  });
});
