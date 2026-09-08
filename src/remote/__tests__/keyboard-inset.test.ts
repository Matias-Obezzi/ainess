// What the keyboard covers, from what the visual viewport says is left.
import { describe, it, expect } from "vitest";
import { keyboardInset } from "@/remote/useKeyboardInset";

describe("keyboardInset", () => {
  it("is the part of the window the keyboard took", () => {
    expect(keyboardInset(844, { height: 500, offsetTop: 0 })).toBe(344);
  });

  it("counts the page being scrolled under it", () => {
    // A field near the bottom takes focus and the browser scrolls the visual viewport down.
    expect(keyboardInset(844, { height: 500, offsetTop: 44 })).toBe(300);
  });

  it("is nothing with no keyboard, and ignores the URL bar", () => {
    expect(keyboardInset(844, { height: 844, offsetTop: 0 })).toBe(0);
    expect(keyboardInset(844, { height: 800, offsetTop: 0 })).toBe(0);
  });
});
