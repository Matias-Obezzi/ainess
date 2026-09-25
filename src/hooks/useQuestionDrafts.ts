// What was marked and typed for pending questions, kept where typing it is cheap.
//
// Like the composer's draft text (see useDraft.ts), the in-progress answer belongs to the question
// rather than the component. If the question group unmounts — switching screens, toggling
// "write instead", or scrolling past the tail of the thread — what was selected and typed must not
// be thrown away.
//
// Multiple copies of the same question can also be on screen at once (the composer copy and the
// orchestrator thread copy). Both need to stay in agreement without waiting for a remount: marking
// an option writes to the store immediately (a rare event), while typing in the free-text box writes
// debounced (400 ms) and flushes on unmount or when the question ids change. A subscription to the
// store adopts changes made by another instance as long as there is no local keystroke timer in
// flight.
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store";
import { EMPTY_CHOICE, type QuestionChoice } from "@/lib/question-choice";

/**
 * How long the store waits while the user is typing in "other".
 * Same timing as the composer draft in useDraft.ts.
 */
const SAVE_AFTER_MS = 400;

function sameChoice(a: QuestionChoice, b: QuestionChoice): boolean {
  if (a.other !== b.other) return false;
  if (a.chosen.length !== b.chosen.length) return false;
  for (let i = 0; i < a.chosen.length; i++) {
    if (a.chosen[i] !== b.chosen[i]) return false;
  }
  return true;
}

function isEmptyChoice(choice: QuestionChoice): boolean {
  return choice.chosen.length === 0 && !choice.other;
}

export function useQuestionDrafts(ids: string[] = []): {
  choices: Record<string, QuestionChoice>;
  setChoice(id: string, next: (current: QuestionChoice) => QuestionChoice): void;
} {
  // Read initial local state from the store for those question ids
  const [choices, setChoices] = useState<Record<string, QuestionChoice>>(() => {
    const stored = useAppStore.getState().questionDrafts;
    const initial: Record<string, QuestionChoice> = {};
    for (const id of ids) {
      if (stored[id]) initial[id] = stored[id];
    }
    return initial;
  });

  const liveChoices = useRef<Record<string, QuestionChoice>>(choices);
  liveChoices.current = choices;

  const timers = useRef<Map<string, ReturnType<typeof setTimeout>>>(new Map());
  const idsKey = ids.join("\0");

  const flushAll = useCallback(() => {
    const store = useAppStore.getState();
    for (const [id, timer] of timers.current.entries()) {
      clearTimeout(timer);
      // If the question was already answered, do not revive the draft on exit.
      const q = store.questions[id];
      if (q && q.status !== "pending") continue;

      const choice = liveChoices.current[id];
      if (choice) {
        store.setQuestionDraft(id, isEmptyChoice(choice) ? null : choice);
      }
    }
    timers.current.clear();
  }, []);

  // Flush any pending keystrokes on unmount and before question ids change.
  useEffect(() => {
    return () => {
      flushAll();
    };
  }, [idsKey, flushAll]);

  // When question ids change, load stored values for the new ones.
  useEffect(() => {
    const stored = useAppStore.getState().questionDrafts;
    const next: Record<string, QuestionChoice> = {};
    for (const id of ids) {
      if (stored[id]) next[id] = stored[id];
    }
    liveChoices.current = next;
    setChoices(next);
  }, [idsKey]);

  // Keep instances synchronized: subscribe to store changes for these ids and adopt
  // changes written elsewhere when this component is not in the middle of typing.
  useEffect(() => {
    const unsubscribe = useAppStore.subscribe(state => {
      let changed = false;
      const updated = { ...liveChoices.current };
      for (const id of ids) {
        // A pending local timer means the user is actively typing in this instance.
        if (timers.current.has(id)) continue;

        const stored = state.questionDrafts[id];
        const current = liveChoices.current[id] ?? EMPTY_CHOICE;

        if (stored) {
          if (!sameChoice(stored, current)) {
            updated[id] = stored;
            changed = true;
          }
        } else {
          // The draft was cleared or the question answered.
          if (!isEmptyChoice(current)) {
            delete updated[id];
            changed = true;
          }
        }
      }
      if (changed) {
        liveChoices.current = updated;
        setChoices(updated);
      }
    });

    return unsubscribe;
  }, [idsKey]);

  const setChoice = useCallback((id: string, next: (current: QuestionChoice) => QuestionChoice) => {
    const prev = liveChoices.current[id] ?? EMPTY_CHOICE;
    const nextChoice = next(prev);

    const updated = { ...liveChoices.current, [id]: nextChoice };
    liveChoices.current = updated;
    setChoices(updated);

    const textChanged = prev.other !== nextChoice.other;
    const chosenChanged =
      prev.chosen.length !== nextChoice.chosen.length ||
      prev.chosen.some((c, i) => c !== nextChoice.chosen[i]);

    // An option click (no text change) is an immediate save: infrequent event, and choices
    // between instances should reflect immediately.
    if (!textChanged && chosenChanged) {
      const existing = timers.current.get(id);
      if (existing) {
        clearTimeout(existing);
        timers.current.delete(id);
      }
      useAppStore.getState().setQuestionDraft(id, isEmptyChoice(nextChoice) ? null : nextChoice);
      return;
    }

    // An emptied answer is written immediately, so a cleared question is clean right away.
    if (isEmptyChoice(nextChoice)) {
      const existing = timers.current.get(id);
      if (existing) {
        clearTimeout(existing);
        timers.current.delete(id);
      }
      useAppStore.getState().setQuestionDraft(id, null);
      return;
    }

    // Free text typing is debounced so rapid typing does not trigger store updates on every keystroke.
    const existing = timers.current.get(id);
    if (existing) clearTimeout(existing);

    const timer = setTimeout(() => {
      timers.current.delete(id);
      const latest = liveChoices.current[id] ?? EMPTY_CHOICE;
      useAppStore.getState().setQuestionDraft(id, isEmptyChoice(latest) ? null : latest);
    }, SAVE_AFTER_MS);

    timers.current.set(id, timer);
  }, []);

  return { choices, setChoice };
}
