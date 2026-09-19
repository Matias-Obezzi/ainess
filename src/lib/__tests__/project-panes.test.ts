// How many projects fit side by side, and which ones are drawn when more are open than fit.
import { describe, it, expect } from "vitest";
import { panesThatFit, visiblePanes, PROJECT_PANE_MIN_WIDTH, MAX_PROJECT_PANES } from "@/lib/project-panes";

describe("how many panes fit", () => {
  it("never goes below one, however little room there is", () => {
    expect(panesThatFit(0)).toBe(1);
    expect(panesThatFit(120)).toBe(1);
    expect(panesThatFit(PROJECT_PANE_MIN_WIDTH - 1)).toBe(1);
  });

  it("gives back one for a width that is not a width", () => {
    expect(panesThatFit(Number.NaN)).toBe(1);
    expect(panesThatFit(-800)).toBe(1);
    expect(panesThatFit(Number.POSITIVE_INFINITY)).toBe(1);
  });

  it("takes the next pane exactly when the whole of it fits", () => {
    expect(panesThatFit(2 * PROJECT_PANE_MIN_WIDTH - 1)).toBe(1);
    expect(panesThatFit(2 * PROJECT_PANE_MIN_WIDTH)).toBe(2);
    expect(panesThatFit(3 * PROJECT_PANE_MIN_WIDTH - 1)).toBe(2);
    expect(panesThatFit(3 * PROJECT_PANE_MIN_WIDTH)).toBe(3);
  });

  it("stops at four, whatever the screen is", () => {
    expect(panesThatFit(4 * PROJECT_PANE_MIN_WIDTH)).toBe(MAX_PROJECT_PANES);
    expect(panesThatFit(10_000)).toBe(MAX_PROJECT_PANES);
    expect(panesThatFit(100_000)).toBe(MAX_PROJECT_PANES);
  });

  it("answers for the minimum it is given, not only for the standard one", () => {
    expect(panesThatFit(600, 300)).toBe(2);
    expect(panesThatFit(600, 700)).toBe(1);
    expect(panesThatFit(600, 0)).toBe(1);
  });
});

describe("which panes are drawn", () => {
  it("draws everything that is open when it all fits", () => {
    expect(visiblePanes(["a", "b"], "a", 3)).toEqual(["a", "b"]);
    expect(visiblePanes([], null, 2)).toEqual([]);
  });

  it("draws the first ones when more are open than fit", () => {
    expect(visiblePanes(["a", "b", "c"], "a", 2)).toEqual(["a", "b"]);
  });

  it("never leaves the focused one out: it takes the last slot", () => {
    expect(visiblePanes(["a", "b", "c"], "c", 2)).toEqual(["a", "c"]);
    expect(visiblePanes(["a", "b", "c", "d"], "d", 1)).toEqual(["d"]);
  });

  it("leaves the order alone when the focused one was already showing", () => {
    expect(visiblePanes(["a", "b", "c"], "b", 2)).toEqual(["a", "b"]);
  });

  it("ignores a focus that is not open at all", () => {
    expect(visiblePanes(["a", "b", "c"], "gone", 2)).toEqual(["a", "b"]);
    expect(visiblePanes(["a", "b", "c"], null, 2)).toEqual(["a", "b"]);
  });
});
