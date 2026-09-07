// One table for how a task status looks and reads, so the board, the cards and the graph can never
// drift apart. `color` is a plain hex because React Flow paints edges and borders with inline SVG.
import { useAppStore } from "@/store";
import type { Task, TaskPriority, TaskStatus } from "@/types";

export interface TaskStatusMeta {
  /** Dictionary key of the column name; render it with `t(meta.labelKey)`. */
  labelKey: string;
  /** Tailwind classes for the little dot on a card. */
  dot: string;
  /** Hex used for graph node borders and edges. */
  color: string;
}

export const taskStatusMeta: Record<TaskStatus, TaskStatusMeta> = {
  backlog: { labelKey: "task.status.backlog", dot: "bg-slate-400", color: "#94a3b8" },
  working: { labelKey: "task.status.working", dot: "bg-emerald-500 animate-pulse", color: "#22c55e" },
  "needs-you": { labelKey: "task.status.needsYou", dot: "bg-amber-500", color: "#f59e0b" },
  "in-review": { labelKey: "task.status.inReview", dot: "bg-violet-500", color: "#8b5cf6" },
  ready: { labelKey: "task.status.ready", dot: "bg-sky-500", color: "#38bdf8" },
  done: { labelKey: "task.status.done", dot: "bg-slate-500", color: "#64748b" },
};

/** Dictionary key of each priority, so the card, the detail and the menus read the same. */
export const taskPriorityLabelKey: Record<TaskPriority, string> = {
  low: "task.priority.low",
  normal: "task.priority.normal",
  high: "task.priority.high",
};

/**
 * Whether a card has a conversation behind it: the run that produced it, or the delegation waiting
 * for a yes. A card the user typed in has neither and stands on its own.
 */
export function hasOrigin(task: Pick<Task, "runId" | "approvalId">): boolean {
  return !!task.runId || !!task.approvalId;
}

/**
 * Takes the user to that conversation. Answering a delegation, reading what an agent said, or
 * carrying on from where a card came from all live in the project's thread, and the board gave no
 * way there: a task could say "requiere tu atención" while the button to act on it was elsewhere.
 */
export function goToTaskOrigin(task: Pick<Task, "projectId">): void {
  const store = useAppStore.getState();
  store.openProject(task.projectId, null);
  store.setProjectMode("chat");
}
