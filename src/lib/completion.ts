// What the caret is completing inside the composer box: a `{{variable}}`, an `@agent`, a `#file`
// or a `/command`, whichever trigger sits closest behind the caret. Pure and React-free, like
// `template-vars.ts`, which this reuses for the variable case rather than duplicating its rules.
import { activeVarQuery } from "./template-vars";
import { insideFence } from "./fences";

export type CompletionKind = "command" | "agent" | "file" | "variable";

export interface CompletionRequest {
  kind: CompletionKind;
  /** What has been typed after the trigger. */
  query: string;
  /** Index of the first character of the trigger, for replacing. */
  start: number;
}

/** How many characters the trigger itself takes ("{{" vs a single "@"/"#"/"/"). */
function triggerLength(kind: CompletionKind): number {
  return kind === "variable" ? 2 : 1;
}

/** Whether the character right before `index` is nothing (start of text) or whitespace. */
function precededByBoundary(text: string, index: number): boolean {
  return index === 0 || /\s/.test(text[index - 1]);
}

/**
 * A trigger that starts at the last occurrence of `char` before the caret, valid only when that
 * `char` sits at the start of the text or right after whitespace, and when nothing typed since it
 * contains whitespace (a finished word, a mail address, or a line already moved past it).
 */
function boundaryTrigger(text: string, beforeCaret: string, char: string, kind: CompletionKind): CompletionRequest | null {
  const start = beforeCaret.lastIndexOf(char);
  if (start === -1 || !precededByBoundary(text, start)) return null;
  const query = beforeCaret.slice(start + 1);
  if (/\s/.test(query)) return null;
  return { kind, query, start };
}

/** What the caret is in the middle of completing, if anything. */
export function activeCompletion(text: string, caret: number): CompletionRequest | null {
  if (insideFence(text, caret)) return null;

  const varQuery = activeVarQuery(text, caret);
  if (varQuery) return { kind: "variable", query: varQuery.query, start: varQuery.start };

  const beforeCaret = text.slice(0, caret);

  const agent = boundaryTrigger(text, beforeCaret, "@", "agent");
  if (agent) return agent;

  const file = boundaryTrigger(text, beforeCaret, "#", "file");
  if (file) return file;

  // A command only ever starts at the very first character of the whole box, never mid-text
  // (that is a path, not a command).
  if (text[0] === "/") {
    const query = beforeCaret.slice(1);
    if (!/\s/.test(query)) return { kind: "command", query, start: 0 };
  }

  return null;
}

/** Puts `value` in place of the trigger and its query, and says where the caret goes after. */
export function applyCompletion(text: string, req: CompletionRequest, value: string): { text: string; caret: number } {
  const end = req.start + triggerLength(req.kind) + req.query.length;
  const replacement =
    req.kind === "variable" ? `{{${value}}}` :
    req.kind === "agent" ? `@${value} ` :
    req.kind === "file" ? `#${value} ` :
    `/${value}`;
  const newText = text.slice(0, req.start) + replacement + text.slice(end);
  return { text: newText, caret: req.start + replacement.length };
}
