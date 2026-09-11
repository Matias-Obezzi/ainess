// An agent that answers every answer with another question had nothing stopping it: answering
// resumes the same round, and the round is what `maxRounds` counts.
import { describe, it, expect } from "vitest";
import { decideQuestions, questionKey, MAX_QUESTION_TURNS, type AnsweredBefore } from "@/lib/question-loop";
import type { ParsedQuestion } from "@/lib/providers";

const q = (question: string): ParsedQuestion => ({
  question,
  options: ["sí", "no"],
  multiple: false,
  allowOther: true,
});

const answered = (question: string, answer = "sí"): AnsweredBefore => ({
  key: questionKey(question),
  question,
  answer: [answer],
});

describe("questionKey", () => {
  it("sees past case, spacing and punctuation", () => {
    expect(questionKey("¿Con cuál seguimos?")).toBe(questionKey("con cual seguimos"));
    expect(questionKey("  Borro la tabla?  ")).toBe(questionKey("Borro la tabla"));
  });

  // An agent re-asking rarely reproduces its own wording to the character.
  it("sees past accents", () => {
    expect(questionKey("¿Migramos la sesión?")).toBe(questionKey("migramos la sesion"));
  });

  it("still tells different questions apart", () => {
    expect(questionKey("¿Borro la tabla?")).not.toBe(questionKey("¿Borro el índice?"));
  });
});

describe("decideQuestions", () => {
  it("asks a new question", () => {
    const decision = decideQuestions([q("¿Postgres o SQLite?")], [], 0);
    expect(decision.ask).toHaveLength(1);
    expect(decision.repeat).toEqual([]);
    expect(decision.capped).toBe(false);
  });

  // The loop itself: the user already said what they think, so the answer goes back rather than
  // the question coming out again.
  it("hands back the answer when every question was already answered", () => {
    const decision = decideQuestions(
      [q("¿Con cuál seguimos?")],
      [answered("¿Con cuál seguimos?", "Postgres")],
      1,
    );
    expect(decision.ask).toEqual([]);
    expect(decision.repeat).toHaveLength(1);
    expect(decision.repeat[0].answer).toEqual(["Postgres"]);
  });

  it("recognises a repeat that was reworded slightly", () => {
    const decision = decideQuestions([q("Con cual seguimos")], [answered("¿Con cuál seguimos?")], 1);
    expect(decision.repeat).toHaveLength(1);
  });

  // An answer is worth less split across two moments, so anything new sends the whole turn over.
  it("asks the whole turn when even one question is new", () => {
    const decision = decideQuestions(
      [q("¿Con cuál seguimos?"), q("¿Y el índice?")],
      [answered("¿Con cuál seguimos?")],
      1,
    );
    expect(decision.ask).toHaveLength(2);
    expect(decision.repeat).toEqual([]);
  });

  it("does not count a question that was asked but never answered", () => {
    const decision = decideQuestions([q("¿Con cuál seguimos?")], [], 1);
    expect(decision.ask).toHaveLength(1);
  });

  it("stops asking past the ceiling", () => {
    const decision = decideQuestions([q("¿Otra más?")], [], MAX_QUESTION_TURNS);
    expect(decision.capped).toBe(true);
    expect(decision.ask).toEqual([]);
    expect(decision.repeat).toEqual([]);
  });

  it("is still asking one turn below the ceiling", () => {
    expect(decideQuestions([q("¿Otra más?")], [], MAX_QUESTION_TURNS - 1).capped).toBe(false);
  });

  // The ceiling is about turns, not about how many questions a turn carries: three at once is one
  // conversation, not three.
  it("does not cap a single turn that asks several things", () => {
    const decision = decideQuestions([q("una"), q("dos"), q("tres")], [], 0);
    expect(decision.ask).toHaveLength(3);
    expect(decision.capped).toBe(false);
  });

  it("says nothing at all when the turn asked nothing", () => {
    expect(decideQuestions([], [], 99)).toEqual({ ask: [], repeat: [], capped: false });
  });
});
