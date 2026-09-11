// Stopping an agent that asks the same thing forever.
//
// Answering a question resumes the agent in the same round it was already in — `round` is what
// `maxRounds` counts, and a question does not advance it — so an agent that answers every answer
// with another question has nothing bounding it at all. Autonomous mode noticed this and grew its
// own ceiling (`MAX_AUTO_ANSWERS`), but only for the questions it answers itself. When the person
// answering is you, there was no ceiling anywhere: you answer, it asks again, and the only thing
// that ends it is you giving up.
//
// Two rules, and they are separate on purpose. Repeating a question that was already answered is
// not a judgement call: the answer is on record, so it is handed straight back instead of being
// asked again. Asking a great many *different* questions might be legitimate, so that one is not
// second-guessed, only capped.
import type { ParsedQuestion } from "@/lib/providers";

/**
 * Question turns one task may have before the questions stop.
 *
 * High enough that a genuinely uncertain task can hold a real conversation, low enough that a loop
 * costs a dozen turns and not a night. Same spirit as `MAX_AUTO_ANSWERS`, which is the autonomous
 * half of the same problem.
 */
export const MAX_QUESTION_TURNS = 12;

/** A question this task already asked and already got an answer to. */
export interface AnsweredBefore {
  key: string;
  question: string;
  answer: string[];
}

/**
 * What two askings of the same question have in common.
 *
 * Case, surrounding space and trailing punctuation are dropped: an agent re-asking rarely
 * reproduces its own wording to the character, and "¿Con cuál seguimos?" and "con cual seguimos"
 * are the same question being asked twice.
 */
export function questionKey(text: string): string {
  return text
    .toLowerCase()
    .normalize("NFD")
    // Combining marks: the accents left behind by the decomposition above.
    .replace(/[̀-ͯ]/g, "")
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .trim();
}

export interface LoopDecision {
  /** Questions to put to the user, as they were parsed. */
  ask: ParsedQuestion[];
  /**
   * Questions this task already answered, to hand straight back to the agent.
   *
   * Only ever filled when *every* question of the turn is a repeat: with something new in the turn
   * the whole turn goes to the user, because an answer is worth less split across two moments.
   */
  repeat: AnsweredBefore[];
  /** The task has asked too many times. Nothing is asked and it waits for a person. */
  capped: boolean;
}

/**
 * What to do with the questions a turn just asked.
 *
 * `answered` is what this task has already asked and had answered; `turnsUsed` is how many turns of
 * this task have asked anything at all.
 */
export function decideQuestions(
  parsed: ParsedQuestion[],
  answered: AnsweredBefore[],
  turnsUsed: number,
): LoopDecision {
  if (parsed.length === 0) return { ask: [], repeat: [], capped: false };
  if (turnsUsed >= MAX_QUESTION_TURNS) return { ask: [], repeat: [], capped: true };

  const before = new Map(answered.map(a => [a.key, a]));
  const repeat: AnsweredBefore[] = [];
  for (const q of parsed) {
    const match = before.get(questionKey(q.question));
    if (match) repeat.push(match);
  }

  // Every one of them already answered: this is the loop, and the user has already said what they
  // think. Handing the same answer back costs one turn and either moves the agent on or reaches the
  // ceiling above, which ends it.
  if (repeat.length === parsed.length) return { ask: [], repeat, capped: false };

  return { ask: parsed, repeat: [], capped: false };
}
