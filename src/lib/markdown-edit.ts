// What the composer does to its text on a keystroke that means formatting: carrying a list on to
// the next line, wrapping a selection in bold, italic or code, turning it into a link. Pure
// functions over the text and the selection, so the box only has to put the result back.

export interface TextEdit {
  text: string;
  /** Where the selection goes afterwards. Equal when it is a bare caret. */
  start: number;
  end: number;
}

const LIST_LINE = /^(\s*)([-*+]|\d+[.)])(\s+)(\[[ xX]\]\s+)?(.*)$/;

/**
 * The next line of a list, when the line the caret is on is an item of one.
 *
 * `- ` and `* ` carry the same bullet, `3.` becomes `4.`, a `[x]` becomes an empty `[ ]`. An item
 * with nothing on it is the end of the list: the marker goes and the line is left plain. Null when
 * the line is not a list item, which is when a newline is just a newline.
 */
export function continueList(text: string, start: number, end: number): TextEdit | null {
  const lineStart = text.lastIndexOf("\n", start - 1) + 1;
  const nextBreak = text.indexOf("\n", start);
  const lineEnd = nextBreak === -1 ? text.length : nextBreak;
  const line = text.slice(lineStart, lineEnd);
  const match = LIST_LINE.exec(line);
  if (!match) return null;
  const [, indent, marker, gap, checkbox, rest] = match;

  if (rest.trim() === "" && start === lineEnd && start === end) {
    // Enter on an empty item: out of the list.
    return { text: text.slice(0, lineStart) + text.slice(lineEnd), start: lineStart, end: lineStart };
  }

  const number = /^\d+/.exec(marker);
  const nextMarker = number ? `${Number(number[0]) + 1}${marker.slice(number[0].length)}` : marker;
  const insert = `\n${indent}${nextMarker}${gap}${checkbox ? "[ ] " : ""}`;
  const caret = start + insert.length;
  // Splitting an item in two: the space that separated the halves does not open the second one.
  const after = text.slice(end).replace(/^[ \t]+/, "");
  return { text: text.slice(0, start) + insert + after, start: caret, end: caret };
}

/**
 * The selection wrapped in `marker` on both sides — or unwrapped, when it already is: the same
 * key that made it bold makes it plain again. With nothing selected the markers are put down
 * around the caret, ready to be typed into.
 */
export function wrapSelection(text: string, start: number, end: number, marker: string): TextEdit {
  const selected = text.slice(start, end);
  const n = marker.length;
  // Wrapped from outside: the markers sit just beyond the selection.
  if (start >= n && text.slice(start - n, start) === marker && text.slice(end, end + n) === marker) {
    return { text: text.slice(0, start - n) + selected + text.slice(end + n), start: start - n, end: end - n };
  }
  // Wrapped from inside: the selection itself carries the markers.
  if (selected.length >= 2 * n && selected.startsWith(marker) && selected.endsWith(marker)) {
    const inner = selected.slice(n, selected.length - n);
    return { text: text.slice(0, start) + inner + text.slice(end), start, end: start + inner.length };
  }
  return {
    text: text.slice(0, start) + marker + selected + marker + text.slice(end),
    start: start + n,
    end: end + n,
  };
}

/**
 * The selection as a markdown link. A selected address becomes the target with the caret in the
 * empty text; selected words become the text with the caret where the address goes; nothing
 * selected leaves both empty, caret in the text.
 */
export function linkSelection(text: string, start: number, end: number): TextEdit {
  const selected = text.slice(start, end);
  const before = text.slice(0, start);
  const after = text.slice(end);
  if (/^https?:\/\/\S+$/.test(selected)) {
    return { text: `${before}[](${selected})${after}`, start: start + 1, end: start + 1 };
  }
  const caret = start + selected.length + 3;
  return { text: `${before}[${selected}]()${after}`, start: selected ? caret : start + 1, end: selected ? caret : start + 1 };
}

/** A line that reads as code rather than prose: indented, punctuated like code, or starting like it. */
const CODE_LINE = [
  /^\s{2,}\S/, // indented
  /[;{}]\s*$/, // ends the way statements and blocks do
  /^\s*(import|export|const|let|var|function|class|def|return|if|else|for|while|fn|pub|use|struct|impl|package|public|private|static|#include|from|async|await|try|catch|match|SELECT|FROM|WHERE)\b/,
  /=>|::|->|\(\)|===|!==|\+\+|\$\{|<\/|\/>/, // the operators prose does not use
  /^\s*[#$>] \S/, // a shell prompt, a comment
];

const LIST_OR_QUOTE = /^\s*([-*+]|\d+[.)]|>)\s/;

/**
 * Whether pasted text is code — several lines, most of them shaped like code and not like a
 * list. Prose is left alone: a wrong guess here wraps somebody's paragraph in a fence.
 */
export function looksLikeCode(text: string): boolean {
  if (text.includes("```")) return false;
  const lines = text.split("\n").filter(line => line.trim() !== "");
  if (lines.length < 2) return false;
  if (lines.filter(line => LIST_OR_QUOTE.test(line)).length * 2 > lines.length) return false;
  const codey = lines.filter(line => CODE_LINE.some(re => re.test(line))).length;
  return codey * 2 >= lines.length;
}

/** `code` put down at the selection inside a ``` fence on lines of its own, caret after the fence. */
export function pasteAsCode(text: string, start: number, end: number, code: string): TextEdit {
  const before = text.slice(0, start);
  const after = text.slice(end);
  const lead = before === "" || before.endsWith("\n") ? "" : "\n";
  const trail = after === "" || after.startsWith("\n") ? "" : "\n";
  const block = `${lead}\`\`\`\n${code.replace(/\s+$/, "")}\n\`\`\`${trail}`;
  const caret = start + block.length - trail.length;
  return { text: before + block + after, start: caret, end: caret };
}
