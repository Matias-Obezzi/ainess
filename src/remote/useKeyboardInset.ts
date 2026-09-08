// How much of the window the on-screen keyboard is covering.
//
// The page does not resize when the keyboard opens (`interactive-widget=resizes-content` is
// deliberately not set: resizing on every keyboard toggle moved the thread off its bottom anchor
// and the conversation jumped around mid-task). The cost was that the box you were typing in ended
// up behind the keyboard. So the shell is shortened by hand instead, from what the visual viewport
// says is left.
import { useEffect } from "react";

/** How far the keyboard reaches into the window, in px, or 0 when there is none. */
export function keyboardInset(layoutHeight: number, viewport: { height: number; offsetTop: number }): number {
  const covered = layoutHeight - viewport.height - viewport.offsetTop;
  // Small differences are the URL bar and rounding, not a keyboard.
  return covered > 80 ? Math.round(covered) : 0;
}

/** Publishes it as `--kb` on the root, which the shell subtracts from its height. */
export function useKeyboardInset(): void {
  useEffect(() => {
    const viewport = window.visualViewport;
    if (!viewport) return;

    const apply = () => {
      const inset = keyboardInset(window.innerHeight, viewport);
      document.documentElement.style.setProperty("--kb", `${inset}px`);
    };
    apply();
    viewport.addEventListener("resize", apply);
    // The page scrolls under the keyboard when a field near the bottom takes focus.
    viewport.addEventListener("scroll", apply);
    return () => {
      viewport.removeEventListener("resize", apply);
      viewport.removeEventListener("scroll", apply);
      document.documentElement.style.removeProperty("--kb");
    };
  }, []);
}
