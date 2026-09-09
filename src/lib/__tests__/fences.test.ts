import { describe, it, expect } from "vitest";
import { fenceRegions, insideFence, lineIndent } from "../fences";

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
