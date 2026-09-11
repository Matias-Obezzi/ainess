// Keeping a feed pinned to its last line, without moving anything else.
//
// This exists because of `scrollIntoView`, which is the obvious way to do it and is the wrong one.
// It does not scroll *a* container: it walks up from the element and scrolls **every scroll
// container on the way**, as far as each one needs, until the element is in view.
//
// And `overflow: hidden` does not opt an element out of being a scroll container. It removes the
// scrollbar and stops the user scrolling it with a wheel; the box still has `scrollTop`, and
// anything that sets it programmatically still works. The app shell is `h-screen overflow-hidden`
// and so are several boxes between it and the thread, so a shell whose content is a few pixels
// taller than its box — a grown composer, a title row, a rounding at some zoom level — could be
// scrolled by `scrollIntoView`, and then stay scrolled: no scrollbar, no wheel, nothing to put it
// back. The content slides up out of sight and the panel reads as blank until something forces a
// relayout, which is exactly what opening a sidebar or switching project does.
//
// The thread follows its own tail every 150 ms while a run is going, which is why this only ever
// showed up on sending a message, and why a harness that could not actually start a run never saw
// it once.
//
// So: never `scrollIntoView` for this. The container is known, its bottom is `scrollHeight`, and
// setting `scrollTop` touches that element and nothing above it.
import { log } from "@/lib/logger";

/** Puts a scroll container at its last line. */
export function stickToBottom(el: HTMLElement | null, behavior: ScrollBehavior = "auto"): void {
  if (!el) return;
  el.scrollTo({ top: el.scrollHeight, behavior });
}

/** Whether the container is already at the end, within a pixel or two of rounding. */
export function isAtBottom(el: HTMLElement | null, slack = 4): boolean {
  if (!el) return true;
  return el.scrollHeight - el.scrollTop - el.clientHeight < slack;
}

/**
 * Puts back any ancestor that got scrolled, and says so.
 *
 * Nothing above a feed is meant to scroll — the shell sizes itself to the window and hides its
 * overflow. An ancestor with a non-zero offset is therefore a bug somewhere having moved it, and
 * because those boxes have no scrollbar the user cannot undo it. This is both the repair and the
 * evidence: it is the line in the log that a blank panel never used to leave.
 *
 * Returns how many ancestors had to be put back.
 */
export function resetScrolledAncestors(el: HTMLElement | null, where: string): number {
  if (!el) return 0;
  // No document under the test runner, and none in any build that is not the window.
  const body = typeof document === "undefined" ? null : document.body;
  let fixed = 0;
  let node = el.parentElement;
  while (node && node !== body) {
    if (node.scrollTop !== 0 || node.scrollLeft !== 0) {
      log.warn("ui", `${where}: an ancestor had been scrolled to ${node.scrollTop},${node.scrollLeft} and was put back (${describe(node)})`);
      node.scrollTop = 0;
      node.scrollLeft = 0;
      fixed++;
    }
    node = node.parentElement;
  }
  // The document itself, which `body { overflow: hidden }` is supposed to make impossible.
  for (const root of (typeof document === "undefined" ? [] : [document.body, document.documentElement])) {
    if (root.scrollTop !== 0 || root.scrollLeft !== 0) {
      log.warn("ui", `${where}: ${root.tagName.toLowerCase()} had been scrolled to ${root.scrollTop},${root.scrollLeft} and was put back`);
      root.scrollTop = 0;
      root.scrollLeft = 0;
      fixed++;
    }
  }
  return fixed;
}

/** Enough of an element to find it in the source, without dumping the whole class list. */
function describe(el: HTMLElement): string {
  const classes = el.className && typeof el.className === "string" ? el.className.split(/\s+/).slice(0, 6).join(" ") : "";
  return `${el.tagName.toLowerCase()}${classes ? " ." + classes : ""}`;
}
