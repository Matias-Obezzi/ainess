// What is typed, kept where typing it is cheap.
//
// The draft belongs to the conversation, not to the component: going to the board and coming back
// has to find the box as it was left. So it lives in the store — and it was written there on every
// keystroke. Zustand runs every subscriber's selector on every `set`, so each character re-ran the
// selectors of every mounted screen and re-rendered whatever they fed. Typing fast made the whole
// app work for each letter, which is what a fast typist feels as the box falling behind.
//
// The box is local now and the store is written behind it: debounced while typing, and at once when
// there is something that must not be lost — an emptied box, a change of conversation, unmounting.
// Nothing else writes these drafts (`setDraft` has one caller), so local can be the live copy
// without two writers disagreeing.
import { useCallback, useEffect, useRef, useState } from "react";
import { useAppStore } from "@/store";

/**
 * How long the store waits.
 *
 * Long enough that a burst of typing is one write, short enough that it is already saved by the
 * time anyone navigates away by hand. The paths that cannot afford to wait do not: they flush.
 */
const SAVE_AFTER_MS = 400;

export interface Draft {
  text: string;
  setText: (value: string | ((prev: string) => string)) => void;
}

export function useDraft(draftKey: string): Draft {
  const [text, setLocal] = useState<string>(() => useAppStore.getState().drafts[draftKey] ?? "");

  // The live copy, for the functional form of `setText` and for the save on the way out. Reading
  // state in those places would read the render's value, which by then is one keystroke old.
  const liveText = useRef(text);
  const liveKey = useRef(draftKey);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const save = useCallback(() => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
    if (!liveKey.current) return;
    useAppStore.getState().setDraft(liveKey.current, liveText.current);
  }, []);

  // Leaving this conversation — or the screen — writes what is in the box under the key it was
  // typed for. The cleanup runs before the effect below loads the next one, so the two never race
  // for the same box.
  useEffect(() => save, [draftKey, save]);

  useEffect(() => {
    liveKey.current = draftKey;
    const stored = useAppStore.getState().drafts[draftKey] ?? "";
    liveText.current = stored;
    setLocal(stored);
  }, [draftKey]);

  const setText = useCallback((value: string | ((prev: string) => string)) => {
    const next = typeof value === "function" ? value(liveText.current) : value;
    liveText.current = next;
    setLocal(next);

    // An empty box is the one state worth writing immediately: it is what a message having been
    // sent looks like, and a stale draft coming back after a send is the bug this whole thing is
    // meant to avoid.
    if (!next) {
      save();
      return;
    }
    if (timer.current) clearTimeout(timer.current);
    timer.current = setTimeout(save, SAVE_AFTER_MS);
  }, [save]);

  return { text, setText };
}
