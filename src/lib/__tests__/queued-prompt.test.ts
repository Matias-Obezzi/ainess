// Three lines typed while an agent was busy are one message, not three turns.
//
// The order is the whole content of this module: a queue that reorders what you wrote hands the
// agent a correction before the thing it corrects.
import { describe, it, expect } from "vitest";
import { interruptedPrompt, joinQueued } from "@/lib/queued-prompt";

describe("joinQueued", () => {
  it("keeps the order they were written in", () => {
    expect(joinQueued(["primero", "segundo", "tercero"])).toBe("primero\n\nsegundo\n\ntercero");
  });

  it("leaves a single message exactly as it was", () => {
    expect(joinQueued(["arreglá el build"])).toBe("arreglá el build");
  });

  it("keeps the line breaks inside a message", () => {
    expect(joinQueued(["uno\ndos", "tres"])).toBe("uno\ndos\n\ntres");
  });

  it("drops what is blank rather than leaving a gap", () => {
    expect(joinQueued(["uno", "   ", "", "dos"])).toBe("uno\n\ndos");
  });

  it("trims each one, so a stray newline does not become a paragraph", () => {
    expect(joinQueued(["uno\n", "  dos  "])).toBe("uno\n\ndos");
  });

  it("is empty for an empty queue", () => {
    expect(joinQueued([])).toBe("");
    expect(joinQueued(["", "  "])).toBe("");
  });
});

describe("interruptedPrompt", () => {
  it("says it interrupted, then everything that was waiting", () => {
    expect(interruptedPrompt("(te corté)", ["uno", "dos"])).toBe("(te corté)\n\nuno\n\ndos");
  });

  it("says nothing at all when there was nothing to deliver", () => {
    // A note with nothing under it interrupts to report only that it interrupted.
    expect(interruptedPrompt("(te corté)", [])).toBe("");
    expect(interruptedPrompt("(te corté)", ["  "])).toBe("");
  });
});
