// A root run's prompt is not always something the user typed. Maintenance runs — `/compact`
// rewriting an agent's history file, or a planner answering a question one of its own children
// asked — are started with a prompt the app wrote for itself.
//
// Two questions, not one. "Does the thread draw this turn?" and "did a person write this prompt?"
// used to have the same answer, so one predicate covered both; a compaction now has to be drawn
// (an automatic one restarts the agent's session on its own, and hiding it left the user with no
// sign that anything had happened) while its prompt is still app-written — so it is drawn as a
// maintenance note, never as a bubble, and never re-offered as something to send again.
import type { Run } from "@/types";

/**
 * True for the turns a project's thread should draw: a user prompt (`kind` unset or `"task"`) and
 * the compaction notes between them. Not a `chat` run, which has its own thread, and not the
 * `answer` a planner gives a child of its own, which is traffic between agents.
 */
export function isThreadTurn(run: Pick<Run, "kind">): boolean {
  const kind = run.kind ?? "task";
  switch (kind) {
    case "task":
    case "compact":
      return true;
    case "chat":
    case "answer":
      return false;
    default: {
      // A kind was added to Run["kind"] without a decision here — fails the build until one is made.
      const exhaustive: never = kind;
      return exhaustive;
    }
  }
}

/**
 * True when `run.prompt` is text a person typed. Use this wherever a prompt is shown as the user's
 * own words or offered back to them to send again — an app-written prompt there reads as a message
 * the user wrote, or gets re-sent as one.
 */
export function isTypedPrompt(run: Pick<Run, "kind">): boolean {
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
