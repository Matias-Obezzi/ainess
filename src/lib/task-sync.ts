// Keeps the task board in step with what the orchestrator is actually doing: a prompt sent to the
// planner becomes a root task, every delegation becomes a task that depends on it, and each run's
// outcome moves its task along. Called from src/lib/orchestrator.ts.
//
// The board is a view of the work, never a gate on it: every entry point swallows its own errors so
// a broken task file can never stop a run from starting or finishing.
import { useAppStore, selectProjectAgents } from "@/store";
import { truncate } from "@/lib/format";
import type { Run, Task, VerifyCommand } from "@/types";
import { briefOutput, type Verdict } from "@/lib/verify-commands";
import { translateNow } from "@/i18n/useT";
import { parseReviewVerdict } from "@/lib/review";
import { emitHookEvent } from "@/lib/hooks";
import type { ParsedTaskOp } from "@/lib/providers";

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
          const project = store.config.projects.find(p => p.id === run.projectId);
          const agent = (project?.agents ?? []).find(a => a.id === run.agentId);
          const rootRun = store.runs[run.rootRunId];
          const taskPrompt = rootRun ? rootRun.prompt : run.prompt;
          const ctx = {
            project,
            agent,
            runId: run.id,
            round: run.round,
            prompt: run.prompt,
            output: run.output,
            taskPrompt,
            error: "",
          };
          void emitHookEvent("review.changes", { task: reviewedTask.title }, ctx);
        }
      }
      return;
    }

    if (!run.parentRunId) return;
    const task = findByRun(run.projectId, run.id);
    if (!task) return;
    const failed = run.status === "error" || run.status === "killed";
    // A project with verification commands has a reviewer that is a machine, and the card waits for
    // it exactly as it waits for a person. `taskOnVerified` is what settles it afterwards.
    const checking = !failed && verificationFor(run).length > 0;
    useAppStore.getState().updateTask(task.id, {
      status: failed ? "needs-you" : checking || hasReviewer(run.projectId) ? "in-review" : "ready",
      detail: failed ? [task.detail, `Error: ${run.output || "la corrida terminó sin salida"}`].filter(Boolean).join("\n\n") : task.detail,
    });
  });
}

/**
 * The commands this run's work has to survive before its card may move on.
 *
 * Only delegated work: a chat with the planner is a conversation, and running a test suite because
 * someone asked a question would be a surprise. Empty when the project declared none, which is how
 * every project behaved before there was a way to declare any.
 */
export function verificationFor(run: Run): VerifyCommand[] {
  if (!run.parentRunId) return [];
  if (run.status !== "done") return [];
  const project = useAppStore.getState().config.projects.find(p => p.id === run.projectId);
  return project?.verify ?? [];
}

/** What the project's own commands said. Settles the card `taskOnRunFinished` left in review. */
export function taskOnVerified(run: Run, verdict: Verdict): void {
  guard(() => {
    const task = findByRun(run.projectId, run.id);
    if (!task) return;
    if (verdict.ok) {
      useAppStore.getState().updateTask(task.id, {
        status: hasReviewer(run.projectId) ? "in-review" : "ready",
      });
      return;
    }
    const failed = verdict.failed;
    useAppStore.getState().updateTask(task.id, {
      status: "needs-you",
      detail: [
        task.detail,
        translateNow("verify.failedDetail", {
          label: failed ? failed.label : "",
          output: briefOutput(failed ? failed.output : ""),
        }),
      ].filter(Boolean).join("\n\n"),
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

/**
 * Applies task operations emitted by an agent while working (e.g. updating its own card status/detail
 * or creating a new backlog card for out-of-scope work).
 *
 * The status written here reflects work in progress — e.g. saying "needs-you" when stuck.
 * When the run finishes, `taskOnRunFinished` still moves the card to in-review or ready as usual.
 */
export function applyTaskOps(run: Run, ops: ParsedTaskOp[]): ParsedTaskOp[] {
  const applied: ParsedTaskOp[] = [];
  guard(() => {
    const store = useAppStore.getState();
    for (const op of ops) {
      if (op.kind === "update") {
        const task = findByRun(run.projectId, run.id);
        if (!task) continue;
        const patch: Partial<Task> = {};
        if (op.status) {
          patch.status = op.status;
        }
        if (op.detail) {
          patch.detail = [task.detail, op.detail].filter(Boolean).join("\n\n");
        }
        if (Object.keys(patch).length > 0) {
          store.updateTask(task.id, patch);
          applied.push(op);
        }
      } else if (op.kind === "create") {
        const agentName = selectProjectAgents(useAppStore.getState(), run.projectId).find(a => a.id === run.agentId)?.name ?? run.agentId;
        const attribution = translateNow("task.proposedBy", { agent: agentName });
        const detail = [attribution, op.detail].filter(Boolean).join("\n\n");
        store.addTask(run.projectId, {
          title: op.title,
          detail,
          status: "backlog",
          priority: op.priority,
          dependsOn: [],
        });
        applied.push(op);
      }
    }
  });
  return applied;
}


/**
 * The card the run about to start is going to continue — looked up before that run exists.
 *
 * A card points at the run that was working on it, and every continuation (another round, a
 * question that got answered, a retry on a different model) is a *new* run with a new id. So the
 * card of the run being started is the one an earlier run of the same lineage is holding: same
 * agent, same root. A first run has none, which is right — its card is opened once it is under way.
 *
 * Two cards of the same agent under the same root, and it answers with nothing: naming the wrong
 * card in an agent's own prompt is worse than not naming one.
 */
export function cardForNextRun(opts: { projectId: string; agentId: string; rootRunId?: string }): Task | undefined {
  if (!opts.rootRunId) return undefined;
  const runs = useAppStore.getState().runs;
  const hits = tasksOf(opts.projectId).filter(task => {
    if (task.archived || !task.runId) return false;
    const run = runs[task.runId];
    return !!run && run.rootRunId === opts.rootRunId && run.agentId === opts.agentId;
  });
  return hits.length === 1 ? hits[0] : undefined;
}
