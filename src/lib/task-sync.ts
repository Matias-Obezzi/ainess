// Keeps the task board in step with what the orchestrator is actually doing: a prompt sent to the
// planner becomes a root task, every delegation becomes a task that depends on it, and each run's
// outcome moves its task along. Called from src/lib/orchestrator.ts.
//
// The board is a view of the work, never a gate on it: every entry point swallows its own errors so
// a broken task file can never stop a run from starting or finishing.
import { useAppStore, selectProjectAgents } from "@/store";
import { truncate } from "@/lib/format";
import type { Run, Task } from "@/types";
import { translateNow } from "@/i18n/useT";
import { parseReviewVerdict } from "@/lib/review";

/** Title of a task: its first meaningful line, without markdown decoration. */
function titleFrom(text: string): string {
  const line = text.split("\n").map(l => l.trim()).find(l => l.length > 0) ?? "";
  return truncate(line.replace(/^[#>*\-\s]+/, ""), 120) || "Tarea sin título";
}

function tasksOf(projectId: string): Task[] {
  return useAppStore.getState().tasks[projectId] ?? [];
}

function findByRun(projectId: string, runId: string): Task | undefined {
  return tasksOf(projectId).find(t => t.runId === runId);
}

export function taskForRun(projectId: string, runId: string): Task | undefined {
  return findByRun(projectId, runId);
}

/** The card a planner named, matched on the short id it was shown (see `shortTaskId`). */
function findByShortId(projectId: string, shortId: string): Task | undefined {
  const wanted = shortId.replace(/[^a-z0-9]/gi, "").toLowerCase();
  if (!wanted) return undefined;
  return tasksOf(projectId).find(t => {
    if (t.archived) return false;
    const id = t.id.replace(/-/g, "").toLowerCase();
    return id === wanted || id.startsWith(wanted);
  });
}

/** Whether a delegation is just the card's own text handed down unchanged. */
function sameWork(task: Task, text: string): boolean {
  const normalize = (s: string) => s.trim().toLowerCase().replace(/\s+/g, " ");
  const delegated = normalize(text);
  return delegated === normalize(task.title) || delegated === normalize(task.detail ?? "");
}

/** True when this project has someone who reviews, so finished work waits for a look. */
function hasReviewer(projectId: string): boolean {
  return selectProjectAgents(useAppStore.getState(), projectId).some(a => a.role === "reviewer");
}

function guard(fn: () => void): void {
  try {
    fn();
  } catch {
    // The board is never allowed to break a run.
  }
}

/** The user sent a prompt to the orchestrator: that whole task gets a card. */
export function taskForPrompt(opts: { projectId: string; agentId: string; runId: string; prompt: string }): void {
  guard(() => {
    useAppStore.getState().addTask(opts.projectId, {
      title: titleFrom(opts.prompt),
      detail: opts.prompt,
      status: "working",
      agentId: opts.agentId,
      runId: opts.runId,
    });
  });
}

/**
 * A planner delegated a task. It hangs off the root task of the same user request, so the graph
 * shows what came from where. Waiting for approval means it starts in "needs-you".
 */
export function taskForDelegation(opts: {
  projectId: string;
  agentId: string;
  task: string;
  rootRunId: string;
  runId?: string;
  approvalId?: string;
  /** Short id of the card the planner picked off the board, when it was working off one. */
  taskId?: string;
}): void {
  guard(() => {
    const store = useAppStore.getState();
    const root = findByRun(opts.projectId, opts.rootRunId);
    const status = opts.approvalId ? "needs-you" : "working";

    // The planner named a card: that card is the work, so it moves. Opening another one is how
    // the board ended up with the same title four times.
    const claimed = opts.taskId ? findByShortId(opts.projectId, opts.taskId) : undefined;
    if (claimed) {
      store.updateTask(claimed.id, {
        status,
        agentId: opts.agentId,
        runId: opts.runId,
        approvalId: opts.approvalId,
      });
      return;
    }

    // No id, but the same words the user typed: the planner handed the request straight down and
    // the root card already stands for it.
    if (root && !opts.taskId && sameWork(root, opts.task)) {
      store.updateTask(root.id, {
        status,
        agentId: opts.agentId,
        runId: opts.runId,
        approvalId: opts.approvalId,
      });
      return;
    }

    store.addTask(opts.projectId, {
      title: titleFrom(opts.task),
      detail: opts.task,
      status,
      agentId: opts.agentId,
      runId: opts.runId,
      approvalId: opts.approvalId,
      dependsOn: root ? [root.id] : [],
    });
  });
}

/** The user decided on a gated delegation: it either starts working or goes back to the backlog. */
export function taskOnApprovalSettled(approvalId: string, approved: boolean, runId?: string): void {
  guard(() => {
    const store = useAppStore.getState();
    const task = Object.values(store.tasks).flat().find(t => t.approvalId === approvalId);
    if (!task) return;
    store.updateTask(task.id, approved
      ? { status: "working", runId, approvalId: undefined }
      : { status: "backlog", approvalId: undefined, detail: [task.detail, "[rechazada por el usuario]"].filter(Boolean).join("\n\n") });
  });
}

export function taskOnReviewStarted(taskId: string, reviewRunId: string): void {
  guard(() => {
    useAppStore.getState().updateTask(taskId, { status: "in-review", runId: reviewRunId });
  });
}

/**
 * A delegated run ended: to review when somebody reviews around here, ready otherwise. A failure
 * goes back to the user with the error in the detail. Root runs are left alone: their task closes
 * when the whole user request does (see `taskOnRootFinished`).
 */
export function taskOnRunFinished(run: Run): void {
  guard(() => {
    if (run.review) {
      const store = useAppStore.getState();
      const reviewedTask = (store.tasks[run.projectId] || []).find(t => t.id === run.review!.taskId);
      if (!reviewedTask) return;
      if (run.status === "error" || run.status === "killed") {
        store.updateTask(run.review.taskId, { 
          status: "needs-you", 
          detail: [reviewedTask.detail, translateNow("review.failed", { error: run.output })].filter(Boolean).join("\n\n") 
        });
      } else {
        const verdict = parseReviewVerdict(run.output);
        if (verdict === "approved") {
          store.updateTask(run.review.taskId, { status: "ready" });
        } else {
          store.updateTask(run.review.taskId, { 
            status: "needs-you", 
            detail: [reviewedTask.detail, translateNow("review.changes", { output: run.output })].filter(Boolean).join("\n\n") 
          });
        }
      }
      return;
    }

    if (!run.parentRunId) return;
    const task = findByRun(run.projectId, run.id);
    if (!task) return;
    const failed = run.status === "error" || run.status === "killed";
    useAppStore.getState().updateTask(task.id, {
      status: failed ? "needs-you" : hasReviewer(run.projectId) ? "in-review" : "ready",
      detail: failed ? [task.detail, `Error: ${run.output || "la corrida terminó sin salida"}`].filter(Boolean).join("\n\n") : task.detail,
    });
  });
}

/** The user's request is over (every round and every child included). */
export function taskOnRootFinished(projectId: string, rootRunId: string, failed: boolean, error?: string): void {
  guard(() => {
    const task = findByRun(projectId, rootRunId);
    if (!task) return;
    useAppStore.getState().updateTask(task.id, {
      status: failed ? "needs-you" : "ready",
      detail: failed && error ? [task.detail, `Error: ${error}`].filter(Boolean).join("\n\n") : task.detail,
    });
  });
}
