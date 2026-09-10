// Only the current step is on screen, and the rest is one click behind it.
//
// The half that matters most is what does *not* fold. A delegation card carries the approval
// prompt an agent is blocked on, and an error is the reason a run stopped: folding either away to
// keep the thread tidy would hide the thing the user has to act on.
import { describe, it, expect } from "vitest";
import { activityView, isStep } from "@/lib/activity-view";

const rows = (kinds: string[]) => kinds.map((kind, i) => ({ kind, id: String(i) }));

describe("isStep", () => {
  it("folds the running commentary", () => {
    expect(isStep("tool")).toBe(true);
    expect(isStep("system")).toBe(true);
  });

  it("leaves the answer, the delegations and the failures alone", () => {
    for (const kind of ["text", "delegation", "error", "stderr"]) {
      expect({ kind, folds: isStep(kind) }).toEqual({ kind, folds: false });
    }
  });
});

describe("activityView collapsed", () => {
  it("shows the last step and nothing else of the steps", () => {
    const view = activityView(rows(["tool", "tool", "tool"]), false);
    expect(view.current?.id).toBe("2");
    expect(view.rows).toEqual([]);
    expect(view.hidden).toBe(2);
  });

  it("keeps the text, the delegations and the errors on screen", () => {
    const view = activityView(rows(["text", "tool", "delegation", "tool", "error"]), false);
    expect(view.rows.map(r => r.kind)).toEqual(["text", "delegation", "error"]);
    expect(view.current?.id).toBe("3");
  });

  it("has nothing to show for a run that has not called anything yet", () => {
    const view = activityView(rows(["text"]), false);
    expect(view.current).toBeNull();
    expect(view.hidden).toBe(0);
    expect(view.rows.map(r => r.kind)).toEqual(["text"]);
  });

  it("counts nothing behind a run whose only step is the current one", () => {
    expect(activityView(rows(["tool"]), false).hidden).toBe(0);
  });

  it("is empty for an empty run", () => {
    expect(activityView([], false)).toEqual({ rows: [], current: null, hidden: 0 });
  });
});

describe("activityView expanded", () => {
  it("brings the folded steps back, in the order they happened", () => {
    const view = activityView(rows(["tool", "text", "tool", "tool"]), true);
    expect(view.rows.map(r => r.id)).toEqual(["0", "1", "2"]);
    expect(view.current?.id).toBe("3");
  });

  it("never draws the current step twice", () => {
    const view = activityView(rows(["tool", "tool"]), true);
    expect(view.rows.map(r => r.id)).toEqual(["0"]);
    expect(view.current?.id).toBe("1");
  });

  it("still counts what the ticker stands for, so the count does not jump when it opens", () => {
    expect(activityView(rows(["tool", "tool", "tool"]), true).hidden).toBe(2);
  });

  it("takes the last step even when the run said something after it", () => {
    // The agent streams prose after its last call: the ticker is about calls, so it keeps that one.
    const view = activityView(rows(["tool", "text"]), true);
    expect(view.current?.id).toBe("0");
    expect(view.rows.map(r => r.kind)).toEqual(["text"]);
  });
});
