import { describe, it, expect } from "vitest";
import { fenceRegions, fenceSegments, insideFence, lineIndent } from "../fences";

describe("fences", () => {
  it("fenceRegions is empty with no fences", () => {
    expect(fenceRegions("hola\nmundo")).toEqual([]);
  });

  it("insideFence is false anywhere with no fences", () => {
    const text = "hola\nmundo";
    for (let i = 0; i <= text.length; i++) {
      expect(insideFence(text, i)).toBe(false);
    }
  });

  it("covers a closed fence from the opening line to the closing line, both included", () => {
    const text = "before\n```\ncode\n```\nafter";
    const openStart = text.indexOf("```");
    const closeEnd = text.indexOf("```", openStart + 3) + 3;
    expect(fenceRegions(text)).toEqual([{ start: openStart, end: closeEnd, closed: true }]);
  });

  it("an unclosed fence reaches to the end of the text", () => {
    const text = "before\n```\ncode still going";
    const openStart = text.indexOf("```");
    expect(fenceRegions(text)).toEqual([{ start: openStart, end: text.length, closed: false }]);
  });

  it("two fences in the same text give two regions", () => {
    const text = "a\n```\none\n```\nb\n```\ntwo\n```\nc";
    expect(fenceRegions(text)).toHaveLength(2);
  });

  it("a fence with a language after the backticks opens all the same", () => {
    const text = "```ts\nconst x = 1;\n```";
    expect(fenceRegions(text)).toEqual([{ start: 0, end: text.length, closed: true }]);
  });

  it("backticks in the middle of a line do not open anything", () => {
    const text = "use `code` inline, nothing opens";
    expect(fenceRegions(text)).toEqual([]);
  });

  it("insideFence at the edge: right before the opening fence is false, right after is true", () => {
    const text = "```\ncode\n```";
    expect(insideFence(text, 0)).toBe(false);
    expect(insideFence(text, 1)).toBe(true);
  });

  // Where the caret actually is for the whole time somebody is writing code: at the end of a fence
  // they have not closed yet. Reading that as "outside" is Enter sending the half-written message.
  it("insideFence counts the end of a fence that is still open", () => {
    const text = "```\nconst x = 1";
    expect(insideFence(text, text.length)).toBe(true);
    expect(insideFence("```", 3)).toBe(true);
  });

  it("insideFence stops at the end of a fence that is closed", () => {
    const text = "```\ncode\n```";
    expect(insideFence(text, text.length)).toBe(false);
  });

  it("insideFence is true at the end of an inner line either way", () => {
    const open = "```\nconst x = 1\nconst y = 2";
    const closed = "```\nconst x = 1\nconst y = 2\n```";
    const caret = "```\nconst x = 1".length;
    expect(insideFence(open, caret)).toBe(true);
    expect(insideFence(closed, caret)).toBe(true);
  });

  it("lineIndent returns the current line's leading whitespace", () => {
    const text = "no indent\n    four spaces\n\tone tab";
    expect(lineIndent(text, text.indexOf("four spaces") + 4)).toBe("    ");
    expect(lineIndent(text, text.length)).toBe("\t");
  });

  it("lineIndent is empty when the line has none", () => {
    const text = "plain line";
    expect(lineIndent(text, 5)).toBe("");
  });

  it("lineIndent works on the first line of the text", () => {
    const text = "  indented first line";
    expect(lineIndent(text, 4)).toBe("  ");
  });
});

// The layer draws each fence as a block. A block takes the newline after it with it: outside, that
// newline is a line of its own under the box, and every line after it lands one row too low.
describe("fenceSegments", () => {
  const segments = (text: string) => fenceSegments(text, fenceRegions(text));
  const joined = (text: string) => segments(text).map(s => s.text).join("");

  it("is the text plus the trailing newline, in one plain piece, with no fences", () => {
    expect(segments("hola\nmundo")).toEqual([{ kind: "plain", text: "hola\nmundo\n" }]);
  });

  it("cuts a closed fence into opener, body and closer, the closer taking the newline after it", () => {
    expect(segments("a\n```ts\ncode\n```\nb")).toEqual([
      { kind: "plain", text: "a\n" },
      { kind: "opener", text: "```ts\n", fence: 0 },
      { kind: "body", text: "code\n", fence: 0 },
      { kind: "closer", text: "```\n", fence: 0 },
      { kind: "plain", text: "b\n" },
    ]);
  });

  it("gives an open fence no closer, and the trailing newline goes into the box", () => {
    expect(segments("```\ncode")).toEqual([
      { kind: "opener", text: "```\n", fence: 0 },
      { kind: "body", text: "code\n", fence: 0 },
    ]);
    expect(segments("```")).toEqual([{ kind: "opener", text: "```\n", fence: 0 }]);
  });

  it("keeps a fence with nothing in it to its two lines", () => {
    expect(segments("```\n```")).toEqual([
      { kind: "opener", text: "```\n", fence: 0 },
      { kind: "closer", text: "```\n", fence: 0 },
    ]);
  });

  it("never loses or invents a character, whatever the text", () => {
    for (const text of ["", "a", "a\n", "```\na\n```\n\n```\nb\n```", "x\n```\n", "```\n```\n```"]) {
      expect(joined(text)).toBe(text + "\n");
    }
  });

  it("numbers the fences so two of them do not share a box", () => {
    const two = segments("```\na\n```\n```\nb\n```");
    expect(two.filter(s => s.fence === 0)).toHaveLength(3);
    expect(two.filter(s => s.fence === 1)).toHaveLength(3);
  });
});
