// Everything one turn asked is answered once.
//
// The bug: an agent that asked three things had its run resumed three times, once per answer —
// three runs off one turn, three cards on the board, three agents in the same workspace, over a
// question the user answered in one sitting. The agent asked once; it gets one reply.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/store";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import type { AgentQuestion, Run } from "@/types";

const RUN: Run = {
  id: "run-1", projectId: "p1", agentId: "a1", parentRunId: null, rootRunId: "run-1",
  prompt: "hacé algo", status: "done", startedAt: 1, output: "", rawLines: [],
  childRunIds: [], round: 0,
};

const question = (id: string, text: string): AgentQuestion => ({
  id,
  runId: "run-1",
  projectId: "p1",
  agentId: "a1",
  rootRunId: "run-1",
  round: 0,
  question: text,
  options: ["A", "B"],
  multiple: false,
  allowOther: true,
  status: "pending",
  createdAt: 10,
});

/** Runs started since the answer went in. */
const startedRuns = () => Object.values(useAppStore.getState().runs).filter(r => r.id !== "run-1");

beforeEach(() => {
  setTransport({ ...nullTransport } as never);
  useAppStore.setState({
    runs: { "run-1": RUN },
    messages: [],
    questions: {
      q1: question("q1", "¿Uso Postgres?"),
      q2: question("q2", "¿Corro los tests?"),
      q3: question("q3", "¿Abro el PR?"),
    },
    config: {
      ...useAppStore.getState().config,
      projects: [{
        id: "p1", name: "P", workspaceDir: "C:/p", createdAt: 1,
        agents: [{ id: "a1", name: "Uno", provider: "claude", role: "implementer", parentId: null, autoApprove: true }],
      }],
    },
  } as never);
});

describe("answering everything a turn asked", () => {
  it("starts one run, not one per question", () => {
    useAppStore.getState().answerQuestions([
      { questionId: "q1", answer: ["sí"] },
      { questionId: "q2", answer: ["no"] },
      { questionId: "q3", answer: ["después"] },
    ]);

    expect(startedRuns()).toHaveLength(1);
  });

  it("marks all three answered", () => {
    useAppStore.getState().answerQuestions([
      { questionId: "q1", answer: ["sí"] },
      { questionId: "q2", answer: ["no"] },
      { questionId: "q3", answer: ["después"] },
    ]);

    const { questions } = useAppStore.getState();
    expect([questions.q1.status, questions.q2.status, questions.q3.status])
      .toEqual(["answered", "answered", "answered"]);
  });

  it("carries every question and its answer in the one prompt", () => {
    useAppStore.getState().answerQuestions([
      { questionId: "q1", answer: ["sí"] },
      { questionId: "q3", answer: ["después"] },
    ]);

    const prompt = startedRuns()[0].prompt;
    // The second answer is no use to the agent without knowing which question it belongs to.
    expect(prompt).toContain("¿Uso Postgres?");
    expect(prompt).toContain("sí");
    expect(prompt).toContain("¿Abro el PR?");
    expect(prompt).toContain("después");
  });

  it("writes one message into the feed, not three", () => {
    useAppStore.getState().answerQuestions([
      { questionId: "q1", answer: ["sí"] },
      { questionId: "q2", answer: ["no"] },
    ]);

    expect(useAppStore.getState().messages.filter(m => m.kind === "instruction")).toHaveLength(1);
  });

  it("ignores a question that was already settled", () => {
    useAppStore.setState(state => ({
      questions: { ...state.questions, q2: { ...state.questions.q2, status: "answered" as const } },
    }));

    useAppStore.getState().answerQuestions([
      { questionId: "q1", answer: ["sí"] },
      { questionId: "q2", answer: ["tarde"] },
    ]);

    expect(startedRuns()).toHaveLength(1);
    // The one already answered keeps the answer it had, not the one that arrived late.
    expect(useAppStore.getState().questions.q2.answer).toBeUndefined();
  });

  it("does nothing at all when none of them are still pending", () => {
    const spy = vi.spyOn(useAppStore, "setState");
    useAppStore.getState().answerQuestions([{ questionId: "gone", answer: ["sí"] }]);
    expect(startedRuns()).toHaveLength(0);
    spy.mockRestore();
  });

  it("still works for a single question, which is a group of one", () => {
    useAppStore.getState().answerQuestion("q1", ["sí"]);
    expect(startedRuns()).toHaveLength(1);
    expect(useAppStore.getState().questions.q1.status).toBe("answered");
  });
});
