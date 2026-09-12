// How much work went through the app in a window, across every project.
//
// The home screen had no idea what had already happened: closing an app that had spent an afternoon
// working left no sign of the afternoon. This is that afternoon as three numbers, under the box.
//
// Pure module over the runs already in the store. `lib/attention` is its sibling and covers the
// present tense — what is waiting and what is running — which is what the bridge reports.
import type { Project, Run } from "@/types";
import { isLiveRun } from "@/lib/run-queue";

/** When a run counts as having happened: its end, or failing that its start. */
function endOf(run: Run): number {
  return run.endedAt ?? run.startedAt;
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
 * The window as three numbers.
 *
 * Only roots: a delegation is part of the task above it, not a separate thing that was done. Only
 * what has stopped, because a run still going has not cost its afternoon yet. A project that has
 * been deleted takes its runs with it.
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
    if (run.parentRunId !== null || isLiveRun(run.status)) continue;
    if (!alive.has(run.projectId) || endOf(run) < since) continue;
    tasks++;
    if (run.status === "error" || run.status === "killed") failed++;
    touched.add(run.projectId);
  }

  return { tasks, failed, projects: touched.size };
}
