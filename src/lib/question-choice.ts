// What is marked on a question before it is sent.
//
// Answering used to be a single click on a single-answer question: the click was the answer, so
// there was no in-between state to have rules about. Now both kinds wait for a send button, and the
// in-between state does: what a second click on the same option means, and what happens when the
// options and the free-text box would contradict each other.
//
// Pure module, no React, so those rules can be read and tested on their own.

/** The marks made so far: options ticked, plus whatever was typed in "other". */
export interface QuestionChoice {
  chosen: string[];
  other: string;
}

export const EMPTY_CHOICE: QuestionChoice = { chosen: [], other: "" };

/**
 * Ticking an option.
 *
 * Multiple: a toggle, as many as you like. Single: it replaces whatever was ticked, ticking the
 * same one again unticks it, and it clears the free text — a question with one answer cannot come
 * back with an option AND a sentence saying something else, and silently sending both would be the
 * app deciding which one you meant.
 */
export function pickOption(choice: QuestionChoice, option: string, multiple: boolean): QuestionChoice {
  if (multiple) {
    return {
      ...choice,
      chosen: choice.chosen.includes(option)
        ? choice.chosen.filter(o => o !== option)
        : [...choice.chosen, option],
    };
  }
  return {
    chosen: choice.chosen.includes(option) ? [] : [option],
    other: "",
  };
}

/**
 * Typing in the free-text box. The same rule as `pickOption`, from the other side: on a
 * single-answer question, writing your own answer unticks the option it would have contradicted.
 * Clearing the box again leaves nothing ticked, which is exactly where you were before typing.
 */
export function typeOther(choice: QuestionChoice, text: string, multiple: boolean): QuestionChoice {
  if (multiple || !text.trim()) return { ...choice, other: text };
  return { chosen: [], other: text };
}

/**
 * What would be sent. Empty means the send button stays disabled — there is nothing to say yet, and
 * an empty answer handed to an agent waiting on one is worse than making the user pick.
 */
export function answerOf(choice: QuestionChoice): string[] {
  const typed = choice.other.trim();
  return typed ? [...choice.chosen, typed] : [...choice.chosen];
}
