// What was worked on lately, across every project, and how much of it there was.
//
// The home screen knew what needed the user and what was running right now, and nothing at all
// about what had already happened: closing an app that had spent an afternoon working left no sign
// of the afternoon. These are the two halves of that — the last things done, one row each, and the
// same window as a count.
//
// Pure module over the runs already in the store. `lib/attention` is its sibling and covers the
// present tense; between them nothing on that screen reaches for the store twice.
import type { Project, Run, RunStatus } from "@/types";

export interface RecentItem {
  runId: string;
  projectId: string;
  agentId: string;
  /** What was asked. The row shows it: it is the only thing that says what the work *was*. */
  prompt: string;
  /** When it ended, or when it started for one that never reported an end. */
  at: number;
  status: RunStatus;
  kind: "task" | "chat";
  /** Set for a chat run, so clicking the row lands in the conversation it happened in. */
  chatId?: string;
}

/** When a run counts as having happened: its end, or failing that its start. */
function endOf(run: Run): number {
  return run.endedAt ?? run.startedAt;
}

/**
 * The last pieces of work, newest first.
 *
 * Only roots: a delegation is part of the task above it, not a separate thing that was done. Only
 * what has stopped, because what is still going is in the "working" list right above this one and a
 * run in both places reads as two runs. A project that has been deleted takes its runs with it.
 */
export function recentWork(runs: Record<string, Run>, projects: Project[], limit: number): RecentItem[] {
  const alive = new Set(projects.map(p => p.id));
  return Object.values(runs)
    .filter(run => run.parentRunId === null && run.status !== "running" && alive.has(run.projectId))
    .sort((a, b) => endOf(b) - endOf(a))
    .slice(0, Math.max(0, limit))
    .map(run => ({
      runId: run.id,
      projectId: run.projectId,
      agentId: run.agentId,
      prompt: run.prompt,
      at: endOf(run),
      status: run.status,
      kind: run.kind === "chat" ? "chat" as const : "task" as const,
      chatId: run.chatId,
    }));
}

export interface WorkSummary {
  /** Roots that finished in the window, whatever became of them. */
  tasks: number;
  /** How many of those did not get there. */
  failed: number;
  /** Projects they were spread across. */
  projects: number;
}

/**
 * The same window as three numbers.
 *
 * `failed` is counted rather than left out: "eleven tasks this week" reads as eleven that worked,
 * and a week where four of them failed is a different week.
 */
export function workSince(runs: Record<string, Run>, projects: Project[], since: number): WorkSummary {
  const alive = new Set(projects.map(p => p.id));
  const touched = new Set<string>();
  let tasks = 0;
  let failed = 0;

  for (const run of Object.values(runs)) {
    if (run.parentRunId !== null || run.status === "running") continue;
    if (!alive.has(run.projectId) || endOf(run) < since) continue;
    tasks++;
    if (run.status === "error" || run.status === "killed") failed++;
    touched.add(run.projectId);
  }

  return { tasks, failed, projects: touched.size };
}
