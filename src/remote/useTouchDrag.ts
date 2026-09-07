// Dragging a card with a finger.
//
// The board on the desktop uses the HTML5 drag events, which a touch screen does not have: on a
// phone a card could only change column through the chips, one tap at a time. This is the same
// gesture people expect from every other board — hold, drag, drop — built on pointer events.
//
// It starts on a long press, not on the first movement, because the list under the finger scrolls:
// pressing and pulling has to keep scrolling the list, and only a press that stays put picks a card
// up. Once it does, `setPointerCapture` keeps every later event coming here even when the finger
// leaves the card.
import { useCallback, useEffect, useRef, useState } from "react";

/** How long a finger has to stay put before it is holding a card rather than scrolling. */
const HOLD_MS = 220;
/** How far it may drift in that time and still count as staying put. */
const SLOP_PX = 8;

export interface DragState<T> {
  item: T;
  /** Where the finger is now, in client coordinates: what the floating copy follows. */
  x: number;
  y: number;
  /** What is under it right now, from `data-drop` on the element (a status, a card id). */
  over: string | null;
}

export interface TouchDrag<T> {
  drag: DragState<T> | null;
  /** Put this on every card: it starts the hold. */
  start(event: React.PointerEvent, item: T): void;
}

/**
 * `onDrop` is called with what was dragged and what it was dropped on (the `data-drop` of the
 * element under the finger), or with `null` when it was let go over nothing.
 */
export function useTouchDrag<T>(onDrop: (item: T, over: string | null) => void): TouchDrag<T> {
  const [drag, setDrag] = useState<DragState<T> | null>(null);
  const pending = useRef<{ timer: number; x: number; y: number; item: T; pointerId: number; target: Element } | null>(null);
  const dragRef = useRef<DragState<T> | null>(null);
  dragRef.current = drag;

  const cancelPending = useCallback(() => {
    if (pending.current) {
      window.clearTimeout(pending.current.timer);
      pending.current = null;
    }
  }, []);

  const start = useCallback((event: React.PointerEvent, item: T) => {
    // A secondary button is a context menu, not a drag.
    if (event.button !== 0) return;
    const { clientX: x, clientY: y, pointerId } = event;
    const target = event.currentTarget;
    const timer = window.setTimeout(() => {
      pending.current = null;
      try {
        target.setPointerCapture(pointerId);
      } catch {
        // The pointer is already gone; the drag simply never starts.
        return;
      }
      setDrag({ item, x, y, over: null });
    }, HOLD_MS);
    pending.current = { timer, x, y, item, pointerId, target };
  }, []);

  useEffect(() => {
    const move = (event: PointerEvent) => {
      const waiting = pending.current;
      if (waiting) {
        // Moved before the hold was up: the finger is scrolling the list, not taking a card.
        if (Math.hypot(event.clientX - waiting.x, event.clientY - waiting.y) > SLOP_PX) cancelPending();
        return;
      }
      if (!dragRef.current) return;
      // The page must not scroll under a card being carried across it.
      event.preventDefault();
      const under = document.elementFromPoint(event.clientX, event.clientY);
      const over = under?.closest<HTMLElement>("[data-drop]")?.dataset.drop ?? null;
      setDrag(current => (current ? { ...current, x: event.clientX, y: event.clientY, over } : current));
    };

    const end = (event: PointerEvent) => {
      cancelPending();
      const current = dragRef.current;
      if (!current) return;
      setDrag(null);
      const under = document.elementFromPoint(event.clientX, event.clientY);
      onDrop(current.item, under?.closest<HTMLElement>("[data-drop]")?.dataset.drop ?? null);
    };

    const cancel = () => {
      cancelPending();
      setDrag(null);
    };

    // Not passive: a drag has to be able to stop the list from scrolling.
    window.addEventListener("pointermove", move, { passive: false });
    window.addEventListener("pointerup", end);
    window.addEventListener("pointercancel", cancel);
    window.addEventListener("blur", cancel);
    return () => {
      window.removeEventListener("pointermove", move);
      window.removeEventListener("pointerup", end);
      window.removeEventListener("pointercancel", cancel);
      window.removeEventListener("blur", cancel);
      cancelPending();
    };
  }, [cancelPending, onDrop]);

  return { drag, start };
}
