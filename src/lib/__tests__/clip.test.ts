// `clip` and `truncate` differ in exactly one thing, and it is the thing that matters.
//
// `truncate` folds every run of whitespace into one space — right for a single line in a narrow
// row, wrong for anything shown as it was written. A step's tooltip is the second case: it exists
// to show the multi-line command or the stack trace the row had to cut short, and running it
// through `truncate` would deliver one long grey line instead.
import { describe, it, expect } from "vitest";
import { clip, truncate } from "@/lib/format";

const MULTILINE = "npm run build\n\nError: it did not work\n  at line 3";

describe("clip", () => {
  it("keeps the line breaks that truncate would flatten", () => {
    expect(clip(MULTILINE, 100)).toBe(MULTILINE);
    expect(truncate(MULTILINE, 100)).not.toContain("\n");
  });

  it("returns short text untouched, with no ellipsis", () => {
    expect(clip("ls -la", 100)).toBe("ls -la");
  });

  it("trims the edges without touching the middle", () => {
    expect(clip("  git status\n  --short  ", 100)).toBe("git status\n  --short");
  });

  it("cuts at the cap and says it was cut", () => {
    const cut = clip("abcdefghij", 4);
    expect(cut).toBe("abcd…");
  });

  it("does not leave a space dangling before the ellipsis", () => {
    expect(clip("ab cdefg", 3)).toBe("ab…");
  });
});
