export const TEMPLATE_VARS: string[] = [
  "event", "time", "project", "workspace", "agent", "agentRole", "runId", "round",
  "prompt", "output", "error", "taskPrompt", "toAgent", "task", "model", "summary", "question",
  "approvalId"
];

/**
 * Returns where an open `{{` right before the caret starts, and what has been typed since.
 * Rules: look for the last `{{` before the caret; if between that `{{` and the caret there is a `}}`, a line break, a `|`, or another `{`, return null; otherwise `start` is the index of the first `{` of that `{{` and `query` is text.slice(start + 2, caret).
 */
export function activeVarQuery(text: string, caret: number): { start: number; query: string } | null {
  const beforeCaret = text.slice(0, caret);
  const lastOpen = beforeCaret.lastIndexOf("{{");
  if (lastOpen === -1) return null;
  const between = beforeCaret.slice(lastOpen + 2);
  if (between.includes("}}") || between.includes("\n") || between.includes("|") || between.includes("{")) {
    return null;
  }
  return { start: lastOpen, query: between };
}

export function applyVarSuggestion(text: string, start: number, caret: number, name: string): { text: string; caret: number } {
  const replacement = "{{" + name + "}}";
  const newText = text.slice(0, start) + replacement + text.slice(caret);
  return { text: newText, caret: start + replacement.length };
}
