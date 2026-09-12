// The box helps you write markdown: a list carries on when you ask for a new line, and the keys
// every editor uses for bold, italic, code and links do that to the selection.
import { describe, it, expect } from "vitest";
import { continueList, linkSelection, wrapSelection } from "@/lib/markdown-edit";

describe("continueList", () => {
  it("carries a bullet on to the next line, indentation and all", () => {
    const text = "  - first";
    expect(continueList(text, text.length, text.length)).toEqual({ text: "  - first\n  - ", start: 14, end: 14 });
  });

  it("keeps whichever bullet was used", () => {
    expect(continueList("* a", 3, 3)?.text).toBe("* a\n* ");
    expect(continueList("+ a", 3, 3)?.text).toBe("+ a\n+ ");
  });

  it("counts a numbered list up, keeping its delimiter", () => {
    expect(continueList("1. one", 6, 6)?.text).toBe("1. one\n2. ");
    expect(continueList("9) nine", 7, 7)?.text).toBe("9) nine\n10) ");
  });

  it("gives a task list a fresh box, even after a ticked one", () => {
    expect(continueList("- [x] done", 10, 10)?.text).toBe("- [x] done\n- [ ] ");
  });

  it("ends the list on an empty item", () => {
    const text = "- a\n- ";
    expect(continueList(text, text.length, text.length)).toEqual({ text: "- a\n", start: 4, end: 4 });
  });

  it("splits an item where the caret is", () => {
    const text = "- one two";
    expect(continueList(text, 5, 5)).toEqual({ text: "- one\n- two", start: 8, end: 8 });
  });

  it("is nothing on a line that is not a list", () => {
    expect(continueList("plain words", 5, 5)).toBeNull();
    expect(continueList("-not a list", 3, 3)).toBeNull();
    expect(continueList("2 apples", 3, 3)).toBeNull();
  });
});

describe("wrapSelection", () => {
  it("wraps the selection and keeps it selected", () => {
    expect(wrapSelection("make this bold", 5, 9, "**")).toEqual({ text: "make **this** bold", start: 7, end: 11 });
  });

  it("puts the markers down around a bare caret", () => {
    expect(wrapSelection("say ", 4, 4, "`")).toEqual({ text: "say ``", start: 5, end: 5 });
  });

  it("unwraps what is already wrapped, whether the markers are inside or outside the selection", () => {
    expect(wrapSelection("make **this** bold", 7, 11, "**")).toEqual({ text: "make this bold", start: 5, end: 9 });
    expect(wrapSelection("make **this** bold", 5, 13, "**")).toEqual({ text: "make this bold", start: 5, end: 9 });
  });
});

describe("linkSelection", () => {
  it("makes selected words the text and leaves the caret where the address goes", () => {
    expect(linkSelection("see the docs", 8, 12)).toEqual({ text: "see the [docs]()", start: 15, end: 15 });
  });

  it("makes a selected address the target and leaves the caret in the text", () => {
    expect(linkSelection("go https://x.io", 3, 15)).toEqual({ text: "go [](https://x.io)", start: 4, end: 4 });
  });

  it("puts down an empty link around a bare caret", () => {
    expect(linkSelection("", 0, 0)).toEqual({ text: "[]()", start: 1, end: 1 });
  });
});
