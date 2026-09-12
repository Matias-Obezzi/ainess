// "The chat goes black when I send a message", reported four times, never reproduced, never logged.
//
// The thread follows its own tail every 150 ms while an answer is being written, and it did that
// with `scrollIntoView` — which does not scroll *a* container, it scrolls **every** scroll container
// between the element and the root. `overflow: hidden` does not opt a box out of being one: it only
// takes away the scrollbar, so a box scrolled that way has no way back. These are the rules of the
// replacement, which touches the container it is given and nothing above it.
import { describe, it, expect, vi } from "vitest";
import { stickToBottom, isAtBottom, resetScrolledAncestors } from "@/lib/stick-to-bottom";

/** Enough of an element for these three functions, which read numbers and set two of them. */
function box(over: Partial<{ scrollTop: number; scrollLeft: number; scrollHeight: number; clientHeight: number; parentElement: unknown; className: string }> = {}) {
  return {
    scrollTop: 0,
    scrollLeft: 0,
    scrollHeight: 1000,
    clientHeight: 400,
    parentElement: null,
    className: "",
    tagName: "DIV",
    scrollTo: vi.fn(),
    ...over,
  };
}

const asEl = (b: unknown) => b as unknown as HTMLElement;

describe("stickToBottom", () => {
  it("scrolls the container it was given to its end", () => {
    const el = box();
    stickToBottom(asEl(el));
    expect(el.scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "auto" });
  });

  it("can do it smoothly", () => {
    const el = box();
    stickToBottom(asEl(el), "smooth");
    expect(el.scrollTo).toHaveBeenCalledWith({ top: 1000, behavior: "smooth" });
  });

  it("does nothing without a container", () => {
    expect(() => stickToBottom(null)).not.toThrow();
  });
});

describe("isAtBottom", () => {
  it("is true at the end", () => {
    expect(isAtBottom(asEl(box({ scrollTop: 600 })))).toBe(true);
  });

  // Sub-pixel layout leaves a fraction behind; a thread one pixel short is at the bottom.
  it("is true within the slack", () => {
    expect(isAtBottom(asEl(box({ scrollTop: 598 })))).toBe(true);
  });

  it("is false when the user has scrolled up", () => {
    expect(isAtBottom(asEl(box({ scrollTop: 0 })))).toBe(false);
  });

  it("treats a missing container as being at the bottom, so nothing tries to chase it", () => {
    expect(isAtBottom(null)).toBe(true);
  });
});

describe("resetScrolledAncestors", () => {
  it("finds nothing when nothing above has moved", () => {
    const parent = box();
    const el = box({ parentElement: parent });
    expect(resetScrolledAncestors(asEl(el), "thread")).toBe(0);
  });

  // The bug itself: a box with `overflow: hidden` that something scrolled, which the user cannot
  // scroll back because it has no scrollbar.
  it("puts back an ancestor that was scrolled, and counts it", () => {
    const grandparent = box({ scrollTop: 120 });
    const parent = box({ parentElement: grandparent });
    const el = box({ parentElement: parent });

    expect(resetScrolledAncestors(asEl(el), "thread")).toBe(1);
    expect(grandparent.scrollTop).toBe(0);
  });

  it("walks the whole way up, not just one level", () => {
    const top = box({ scrollTop: 40 });
    const middle = box({ scrollTop: 10, parentElement: top });
    const el = box({ parentElement: middle });

    expect(resetScrolledAncestors(asEl(el), "thread")).toBe(2);
    expect(top.scrollTop).toBe(0);
    expect(middle.scrollTop).toBe(0);
  });

  it("puts back a sideways scroll too", () => {
    const parent = box({ scrollLeft: 300 });
    const el = box({ parentElement: parent });
    expect(resetScrolledAncestors(asEl(el), "thread")).toBe(1);
    expect(parent.scrollLeft).toBe(0);
  });

  // It never touches the container it was handed: that one is supposed to be scrolled.
  it("leaves the feed itself alone", () => {
    const el = box({ scrollTop: 900, parentElement: box() });
    resetScrolledAncestors(asEl(el), "thread");
    expect(el.scrollTop).toBe(900);
  });

  it("does nothing without a container", () => {
    expect(resetScrolledAncestors(null, "thread")).toBe(0);
  });
});
