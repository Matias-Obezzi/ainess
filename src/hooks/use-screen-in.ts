import { useLayoutEffect, useRef, useSyncExternalStore } from "react";
import { useAppStore } from "@/store";
import { useReducedMotion } from "@/hooks/use-reduced-motion";
import { appReturnTick, subscribeAppReturn } from "@/lib/app-return";
import { SCREEN_IN_CLASS, shouldAnimateScreen } from "@/lib/screen-in";

/** How many times the window has been come back to, as something React re-renders on. */
function useAppReturn(): number {
  return useSyncExternalStore(subscribeAppReturn, appReturnTick, () => 0);
}

/**
 * Plays the arrival animation on the element the returned ref is put on, every time `deps` change
 * — and every time the app is come back to (see `lib/app-return.ts`).
 *
 * The class is taken off, a reflow is forced, and it is put back: the animation has to start over
 * without the element being replaced. The obvious alternative — a `key` that changes — remounts the
 * subtree, and remounting a thread throws away the scroll position and every bit of state its
 * children were holding, which is a much bigger thing than an animation.
 *
 * Put it on a wrapper *inside* whatever scrolls, never on the scrolling element itself: a transform
 * on a scroll container makes it the containing block for what is inside it, which breaks sticky
 * headers and scroll anchoring for as long as the animation lasts.
 */
export function useScreenIn<T extends HTMLElement = HTMLDivElement>(deps: unknown[] = []) {
  const ref = useRef<T>(null);
  const setting = useAppStore(state => state.config.screenAnimations);
  const reducedMotion = useReducedMotion();
  const returned = useAppReturn();
  const animate = shouldAnimateScreen(setting, reducedMotion);

  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    if (!animate) {
      el.classList.remove(SCREEN_IN_CLASS);
      return;
    }
    el.classList.remove(SCREEN_IN_CLASS);
    // Reading the layout is what makes the removal take effect before the class goes back on.
    // Without it the browser collapses the two into no change at all and nothing plays again.
    void el.offsetWidth;
    el.classList.add(SCREEN_IN_CLASS);
    // The dependency list is the caller's, spread in: every call site passes one of a fixed length.
  }, [animate, returned, ...deps]);

  return ref;
}
