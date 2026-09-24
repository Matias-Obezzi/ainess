// A root run's prompt is not always something the user typed. Maintenance runs — `/compact`
// rewriting an agent's history file, or a planner answering a question one of its own children
// asked — are started with a prompt the app wrote for itself, with no card and nothing to show the
// user. Drawing them in a project's thread would make an app-authored prompt look like a message
// the person typed.
import type { Run } from "@/types";

/** True for the turns a project's thread should draw: a plain user prompt, `kind` unset or `"task"`. */
export function isThreadTurn(run: Pick<Run, "kind">): boolean {
  const kind = run.kind ?? "task";
  switch (kind) {
    case "task":
      return true;
    case "chat":
    case "compact":
    case "answer":
      return false;
    default: {
      // A kind was added to Run["kind"] without a decision here — fails the build until one is made.
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}
