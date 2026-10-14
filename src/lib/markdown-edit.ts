// What the composer does to its text on a keystroke that means formatting: carrying a list on to
// the next line, wrapping a selection in bold, italic or code, turning it into a link. Pure
// functions over the text and the selection, so the box only has to put the result back.

import { fenceRegions } from "./fences";

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

/**
 * The way out of a ``` block that ends the message.
 *
 * A block closed on the last line of the box has nothing under it, so the arrow that would walk
 * out of it has nowhere to land and the code is the last thing you can write. This makes the line:
 * a newline after the closing fence, caret on it, outside the block.
 *
 * Null wherever the arrow already goes somewhere — a line below the caret, the caret outside every
 * block, a selection rather than a bare caret — and in a fence still open, where the way out is
 * closing it (Enter does that for you) rather than walking past a closer that is not there.
 */
export function exitCodeBlock(text: string, start: number, end: number): TextEdit | null {
  if (start !== end) return null;
  if (text.indexOf("\n", start) !== -1) return null;
  const inClosedFence = fenceRegions(text).some(r => r.closed && start > r.start && start <= r.end);
  if (!inClosedFence) return null;
  const caret = text.length + 1;
  return { text: `${text}\n`, start: caret, end: caret };
}

/**
 * The closing ``` for a fence just opened by typing its third backtick, and a line after it, so
 * the down arrow walks out of the block and there is somewhere to keep writing. The caret goes to
 * an empty line inside, where the code is what gets typed next — left on the opener, the first
 * word read as the language and was drawn grey. Null for anything else, a closing ``` included.
 */
export function closeFence(prev: string, next: string, caret: number): TextEdit | null {
  if (next.length <= prev.length || prev.slice(0, caret) === next.slice(0, caret)) return null;
  const lineStart = next.lastIndexOf("\n", caret - 1) + 1;
  const breakAt = next.indexOf("\n", caret);
  const lineEnd = breakAt === -1 ? next.length : breakAt;
  if (lineEnd !== caret || !/^\s*```$/.test(next.slice(lineStart, caret))) return null;
  if (!fenceRegions(next).some(r => r.start === lineStart && !r.closed)) return null;
  const indent = /^\s*/.exec(next.slice(lineStart, caret))![0];
  const after = next.slice(caret);
  const text = next.slice(0, caret) + "\n" + indent + "\n" + indent + "```" + (after.startsWith("\n") ? "" : "\n") + after;
  const inside = caret + 1 + indent.length;
  return { text, start: inside, end: inside };
}

/** The lines a closed fence is drawn with: its hidden opener and closer, and the code between. */
function fenceLines(text: string, r: { start: number; end: number }) {
  const openerEnd = text.indexOf("\n", r.start);
  const closerStart = text.lastIndexOf("\n", r.end - 1) + 1;
  return { openerEnd, bodyStart: openerEnd + 1, bodyEnd: closerStart - 1, closerStart };
}

/**
 * Where the caret goes when it lands on a fence's opener or closer, which are not drawn: out of the
 * block the way it was moving — up past the opener, down past the closer — and into the code
 * otherwise. A line is made when there is none to go to. Null when the caret is somewhere it can be.
 */
export function snapOutOfFence(text: string, caret: number, previous: number): TextEdit | null {
  for (const r of fenceRegions(text)) {
    if (caret < r.start || caret > r.end) continue;
    const openerEnd = text.indexOf("\n", r.start);
    if (openerEnd === -1) return null;
    if (caret <= openerEnd) {
      if (previous > caret || previous === -1 && caret === r.start) {
        if (r.start === 0) return { text: `\n${text}`, start: 0, end: 0 };
        return { text, start: r.start - 1, end: r.start - 1 };
      }
      return { text, start: openerEnd + 1, end: openerEnd + 1 };
    }
    if (!r.closed) return null;
    const { bodyEnd, closerStart } = fenceLines(text, r);
    if (caret < closerStart) return null;
    if (previous < caret) {
      if (r.end === text.length) return { text: `${text}\n`, start: text.length + 1, end: text.length + 1 };
      return { text, start: r.end + 1, end: r.end + 1 };
    }
    return { text, start: bodyEnd, end: bodyEnd };
  }
  return null;
}

/**
 * What Backspace or Delete does at the edge of a block: the block is never torn. Backspace at the
 * start of an empty block's line takes the whole block; at the start of a block with code in it,
 * nothing. Backspace right after the closer steps into the code, and Delete at the end of the code
 * or right before the opener does nothing. `"stop"` means swallow the key; null, let it through.
 */
export function guardFenceKey(text: string, caret: number, key: "Backspace" | "Delete"): TextEdit | "stop" | null {
  for (const r of fenceRegions(text)) {
    if (!r.closed) continue;
    const { bodyStart, bodyEnd } = fenceLines(text, r);
    if (key === "Backspace") {
      if (caret === bodyStart) {
        if (bodyEnd > bodyStart) return "stop";
        // The empty block goes, and the newline that put it on a line of its own with it.
        if (r.start > 0) return { text: text.slice(0, r.start - 1) + text.slice(r.end), start: r.start - 1, end: r.start - 1 };
        const after = text[r.end] === "\n" ? r.end + 1 : r.end;
        return { text: text.slice(after), start: 0, end: 0 };
      }
      if (caret === r.end + 1 && text[r.end] === "\n") return { text, start: bodyEnd, end: bodyEnd };
    } else if (caret === bodyEnd || (r.start > 0 && caret === r.start - 1)) {
      return "stop";
    }
  }
  return null;
}

/**
 * Where an arrow key takes the caret when its next stop would be a fence line, decided before the
 * key moves it, so the caret never shows on the hidden opener or closer for a frame. `firstRow` and
 * `lastRow` say whether the caret is on the first or the last row its line wraps into: up and down
 * only leave the line from there. Null when the arrow can do what it always does.
 */
export function fenceArrow(
  text: string,
  caret: number,
  key: "ArrowUp" | "ArrowDown" | "ArrowLeft" | "ArrowRight",
  firstRow: boolean,
  lastRow: boolean,
): TextEdit | null {
  const at = (i: number): TextEdit => ({ text, start: i, end: i });
  const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
  const breakAt = text.indexOf("\n", caret);
  const lineEnd = breakAt === -1 ? text.length : breakAt;
  for (const r of fenceRegions(text)) {
    if (!r.closed) continue;
    const { bodyStart, bodyEnd } = fenceLines(text, r);
    const above = r.start - 1;
    const below = r.end + 1;
    // Out of the block.
    if (key === "ArrowUp" && firstRow && lineStart === bodyStart) {
      return r.start === 0 ? { text: `\n${text}`, start: 0, end: 0 } : at(above);
    }
    if (key === "ArrowDown" && lastRow && lineEnd === bodyEnd) {
      return r.end === text.length ? { text: `${text}\n`, start: text.length + 1, end: text.length + 1 } : at(below);
    }
    if (key === "ArrowLeft" && caret === bodyStart) return r.start === 0 ? { text: `\n${text}`, start: 0, end: 0 } : at(above);
    if (key === "ArrowRight" && caret === bodyEnd) {
      return r.end === text.length ? { text: `${text}\n`, start: text.length + 1, end: text.length + 1 } : at(below);
    }
    // Into it, from the line above or below.
    if (key === "ArrowDown" && lastRow && r.start > 0 && lineEnd === above) return at(bodyStart);
    if (key === "ArrowUp" && firstRow && below <= text.length && lineStart === below) return at(bodyEnd);
    if (key === "ArrowRight" && r.start > 0 && caret === above) return at(bodyStart);
    if (key === "ArrowLeft" && below <= text.length && caret === below) return at(bodyEnd);
  }
  return null;
}
