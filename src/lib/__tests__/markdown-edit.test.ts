// The box helps you write markdown: a list carries on when you ask for a new line, and the keys
// every editor uses for bold, italic, code and links do that to the selection.
import { describe, it, expect } from "vitest";
import { closeFence, continueList, guardFenceKey, snapOutOfFence, exitCodeBlock, linkSelection, looksLikeCode, pasteAsCode, wrapSelection } from "@/lib/markdown-edit";

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

describe("looksLikeCode", () => {
  it("knows code when it sees several lines of it", () => {
    expect(looksLikeCode("function a() {\n  return 1;\n}")).toBe(true);
    expect(looksLikeCode("import x from 'y';\nconst z = x();")).toBe(true);
    expect(looksLikeCode("def f(x):\n    return x * 2")).toBe(true);
    expect(looksLikeCode("SELECT id\nFROM users\nWHERE id = 1;")).toBe(true);
  });

  it("leaves prose, lists and single lines alone", () => {
    expect(looksLikeCode("Hola, ¿cómo va?\nTe paso lo que encontré ayer.")).toBe(false);
    expect(looksLikeCode("- una cosa\n- otra cosa\n- la tercera")).toBe(false);
    expect(looksLikeCode("const x = 1;")).toBe(false);
    expect(looksLikeCode("1. primero\n2. segundo")).toBe(false);
  });

  it("does not fence what is fenced already", () => {
    expect(looksLikeCode("```\nconst a = 1;\nconst b = 2;\n```")).toBe(false);
  });
});

describe("pasteAsCode", () => {
  it("puts the block on lines of its own, caret after the fence", () => {
    const edit = pasteAsCode("mirá esto:", 10, 10, "const a = 1;\n");
    expect(edit.text).toBe("mirá esto:\n```\nconst a = 1;\n```");
    expect(edit.start).toBe(edit.text.length);
  });

  it("adds no blank lines when the paste already sits on its own line", () => {
    expect(pasteAsCode("a\n", 2, 2, "x = 1;\ny = 2;").text).toBe("a\n```\nx = 1;\ny = 2;\n```");
  });

  it("keeps what follows on its own line too, and replaces a selection", () => {
    const edit = pasteAsCode("before SEL after", 7, 10, "a;\nb;");
    expect(edit.text).toBe("before \n```\na;\nb;\n```\n after");
    expect(edit.text.slice(edit.start)).toBe("\n after");
  });
});

describe("exitCodeBlock", () => {
  it("makes the line the closing fence has nothing under", () => {
    const text = "hi\n```\ncode\n```";
    expect(exitCodeBlock(text, text.length, text.length)).toEqual({
      text: "hi\n```\ncode\n```\n",
      start: 16,
      end: 16,
    });
  });

  it("works anywhere on the closing line, not just at its end", () => {
    const text = "```\ncode\n```";
    // Right after the first backtick of the closer.
    expect(exitCodeBlock(text, 10, 10)?.text).toBe("```\ncode\n```\n");
  });

  it("leaves the arrow alone when there is already a line after the block", () => {
    const text = "```\ncode\n```\nafter";
    expect(exitCodeBlock(text, text.length, text.length)).toBeNull();
    // And on the closing line itself, which has the line below it the arrow wants.
    expect(exitCodeBlock(text, 12, 12)).toBeNull();
  });

  it("leaves the arrow alone inside the block, where the closing line is below", () => {
    const text = "```\ncode\n```";
    expect(exitCodeBlock(text, 8, 8)).toBeNull();
  });

  it("is nothing outside every block", () => {
    const text = "just words";
    expect(exitCodeBlock(text, text.length, text.length)).toBeNull();
    const after = "```\ncode\n```\nplain";
    expect(exitCodeBlock(after, after.length, after.length)).toBeNull();
  });

  it("is nothing in a fence that was never closed", () => {
    const text = "```\ncode";
    expect(exitCodeBlock(text, text.length, text.length)).toBeNull();
  });

  it("is nothing with a selection: this is a caret's move", () => {
    const text = "```\ncode\n```";
    expect(exitCodeBlock(text, 4, text.length)).toBeNull();
  });

  it("leaves the second of two blocks, not the first", () => {
    const text = "```\na\n```\n```\nb\n```";
    expect(exitCodeBlock(text, text.length, text.length)?.text).toBe(`${text}\n`);
  });
});

describe("closeFence", () => {
  it("writes the closer and a line after it when the third backtick opens a fence", () => {
    expect(closeFence("hola\n``", "hola\n```", 8)).toEqual({ text: "hola\n```\n\n```\n", start: 9, end: 9 });
  });

  it("leaves a closer, a deletion and a backtick in the middle of a line alone", () => {
    const open = "```ts\nconst a = 1;\n``";
    expect(closeFence(open, open + "`", open.length + 1)).toBeNull();
    expect(closeFence("````", "```", 3)).toBeNull();
    expect(closeFence("a ``", "a ```", 5)).toBeNull();
  });
});

describe("the caret and a code block", () => {
  const text = "hola\n```\ncodigo\n```\nchau";
  // hola 0-4 | ``` 5-8 | codigo 9-15 | ``` 16-19 | chau 20-24
  it("leaves the block upwards or downwards instead of stopping on a fence line", () => {
    expect(snapOutOfFence(text, 8, 12)).toEqual({ text, start: 4, end: 4 });
    expect(snapOutOfFence(text, 18, 12)).toEqual({ text, start: 20, end: 20 });
    expect(snapOutOfFence(text, 6, 2)).toEqual({ text, start: 9, end: 9 });
    expect(snapOutOfFence(text, 17, 22)).toEqual({ text, start: 15, end: 15 });
    expect(snapOutOfFence(text, 12, 11)).toBeNull();
  });

  it("makes the line it leaves to when there is none", () => {
    expect(snapOutOfFence("```\na\n```", 2, 4)).toEqual({ text: "\n```\na\n```", start: 0, end: 0 });
    expect(snapOutOfFence("```\na\n```", 7, 5)).toEqual({ text: "```\na\n```\n", start: 10, end: 10 });
  });

  it("only lets an empty block go, from its line, with Backspace", () => {
    expect(guardFenceKey(text, 9, "Backspace")).toBe("stop");
    expect(guardFenceKey("hola\n```\n\n```\nchau", 9, "Backspace")).toEqual({ text: "hola\nchau", start: 4, end: 4 });
    expect(guardFenceKey("```\n\n```\nchau", 4, "Backspace")).toEqual({ text: "chau", start: 0, end: 0 });
    expect(guardFenceKey(text, 20, "Backspace")).toEqual({ text, start: 15, end: 15 });
    expect(guardFenceKey(text, 15, "Delete")).toBe("stop");
    expect(guardFenceKey(text, 4, "Delete")).toBe("stop");
    expect(guardFenceKey(text, 12, "Backspace")).toBeNull();
  });
});
