// Puts the board back in step with the runs behind it.
//
// A card moves along when its run ends (see src/lib/task-sync.ts), so a run that ends while nobody
// is listening leaves the card where it was: the app closed mid-run, the process was killed, the
// exit never arrived. What the user sees then is a column of tasks "en curso" with nothing running
// under them, and no way to tell which ones are real.
//
// This is the same set of rules as task-sync, applied after the fact instead of on the event.
import { useAppStore, selectProjectAgents } from "@/store";
import type { Run, Task, TaskStatus } from "@/types";
import { parseReviewVerdict } from "@/lib/review";
import { pendingApprovals } from "@/lib/approvals";
import { isLiveRun } from "@/lib/run-queue";

export interface BoardFix {
  taskId: string;
  /** Where the card should be, going by the run it is waiting on. */
  status: TaskStatus;
}

/**
 * The cards whose status the runs contradict.
 *
 * "working", "in-review" and "needs-you" are judged: the statuses the board cannot be left holding
 * on its own. A card parked in any other column is the user's business, and one with no run behind
 * it was put there by hand — neither is this function's to move.
 *
 * @param opts.pendingApprovalIds the approvals still waiting for an answer. Handed in instead of
 * read from the store so this stays pure; left out means "not known", and then a card waiting on
 * an approval stays where it is.
 */
export function boardFixes(
  tasks: Task[],
  runs: Record<string, Run>,
  opts: { hasReviewer: boolean; pendingApprovalIds?: ReadonlySet<string> },
): BoardFix[] {
  const fixes: BoardFix[] = [];
  for (const task of tasks) {
    if (task.archived || !task.runId) continue;
    if (task.status !== "working" && task.status !== "in-review" && task.status !== "needs-you") continue;

    const run = runs[task.runId];

    // "Necesita tu atención" only earns its name while everything in it needs somebody, so it is
    // emptied of exactly the cards that provably need nobody: run finished well, and whatever
    // approval it was waiting on already answered. A failed run, a live one, a missing one or an
    // approval still pending all stay. The rule is narrow on purpose — moving one card too few is
    // dull, moving one too many hides from the user the very thing this column is for.
    if (task.status === "needs-you") {
      if (!run || run.status !== "done") continue;
      if (task.approvalId && (opts.pendingApprovalIds?.has(task.approvalId) ?? true)) continue;
      fixes.push({ taskId: task.id, status: run.parentRunId && opts.hasReviewer ? "in-review" : "ready" });
      continue;
    }

    if (task.status === "in-review") {
      if (!run) {
        fixes.push({ taskId: task.id, status: "needs-you" });
        continue;
      }
      if (!run.review) continue;
      if (isLiveRun(run.status)) continue;
      if (run.status === "error" || run.status === "killed") {
        fixes.push({ taskId: task.id, status: "needs-you" });
        continue;
      }
      const verdict = parseReviewVerdict(run.output);
      fixes.push({ taskId: task.id, status: verdict === "approved" ? "ready" : "needs-you" });
      continue;
    }

    // The run is not in memory at all: trimmed, or from a history that is no longer there. Either
    // way nothing is going to move this card, and a person has to look at it.
    if (!run) {
      fixes.push({ taskId: task.id, status: "needs-you" });
      continue;
    }
    if (isLiveRun(run.status)) continue;
    if (run.status === "error" || run.status === "killed") {
      fixes.push({ taskId: task.id, status: "needs-you" });
      continue;
    }
    // Finished well: a delegated task waits for whoever reviews, the user's own request is ready.
    const status: TaskStatus = run.parentRunId && opts.hasReviewer ? "in-review" : "ready";
    fixes.push({ taskId: task.id, status });
  }
  return fixes;
}

/**
 * Applies those fixes to one project's board. Returns how many cards moved, for the toast.
 *
 * Safe to call whenever: with the board already in step it changes nothing. It does need the
 * project's history in memory to judge, so it runs after the history and the tasks are loaded.
 */
export function reconcileProject(projectId: string): number {
  const store = useAppStore.getState();
  const tasks = store.tasks[projectId] ?? [];
  if (tasks.length === 0) return 0;
  const hasReviewer = selectProjectAgents(store, projectId).some(a => a.role === "reviewer");
  const pendingApprovalIds = new Set(pendingApprovals(store.approvals, store.config.projects, projectId).map(a => a.id));
  const fixes = boardFixes(tasks, store.runs, { hasReviewer, pendingApprovalIds });
  for (const fix of fixes) store.updateTask(fix.taskId, { status: fix.status });
  return fixes.length;
}
