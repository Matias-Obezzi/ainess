// Pure task logic: creation defaults, column ordering, dependency checks and the layered layout
// used by the dependency graph. Nothing here touches the store or the disk, so it is all testable
// (see src/lib/__tests__/tasks.test.ts). Persistence lives in src/lib/task-store.ts.
import type { Task, TaskStatus } from "@/types";

/** Columns of the board, left to right. */
export const TASK_STATUSES: TaskStatus[] = ["backlog", "working", "needs-you", "in-review", "ready", "done"];

/** A dependency is satisfied once its task reached one of these. */
const SATISFIED: TaskStatus[] = ["ready", "done"];

export function createTask(partial: Partial<Task> & { projectId: string }): Task {
  const now = Date.now();
  return {
    id: partial.id ?? crypto.randomUUID(),
    projectId: partial.projectId,
    title: (partial.title ?? "Tarea sin título").trim() || "Tarea sin título",
    detail: partial.detail,
    status: partial.status ?? "backlog",
    agentId: partial.agentId,
    dependsOn: partial.dependsOn ? [...partial.dependsOn] : [],
    runId: partial.runId,
    approvalId: partial.approvalId,
    branch: partial.branch,
    createdAt: partial.createdAt ?? now,
    updatedAt: partial.updatedAt ?? now,
    order: partial.order ?? 0,
    archived: partial.archived ?? false,
  };
}

/** The live (non archived) tasks of one column, in board order. */
export function sortColumn(tasks: Task[], status: TaskStatus): Task[] {
  return tasks
    .filter(t => !t.archived && t.status === status)
    .sort((a, b) => (a.order - b.order) || (a.createdAt - b.createdAt));
}

/**
 * Moves `id` to `status` at `index` and renumbers `order` in both the column it left and the one
 * it landed on, so every visible column stays 0..n-1. `index` counts the target column *without*
 * the moved task; out of range values are clamped.
 */
export function moveTask(tasks: Task[], id: string, status: TaskStatus, index: number): Task[] {
  const moved = tasks.find(t => t.id === id);
  if (!moved) return tasks;

  const from = moved.status;
  const target = sortColumn(tasks, status).filter(t => t.id !== id);
  const at = Math.max(0, Math.min(index, target.length));
  const updated: Task = { ...moved, status, archived: false, updatedAt: Date.now() };
  target.splice(at, 0, updated);

  const orders = new Map<string, number>();
  target.forEach((t, i) => orders.set(t.id, i));
  if (from !== status) sortColumn(tasks, from).filter(t => t.id !== id).forEach((t, i) => orders.set(t.id, i));

  return tasks.map(t => {
    if (t.id === id) return { ...updated, order: orders.get(id) ?? updated.order };
    const order = orders.get(t.id);
    return order === undefined || order === t.order ? t : { ...t, order };
  });
}

/** The dependencies of `task` that have not finished yet (missing ones are ignored). */
export function blockedBy(task: Task, tasks: Task[]): Task[] {
  if (task.dependsOn.length === 0) return [];
  const byId = new Map(tasks.map(t => [t.id, t]));
  const out: Task[] = [];
  for (const depId of task.dependsOn) {
    const dep = byId.get(depId);
    if (dep && !SATISFIED.includes(dep.status)) out.push(dep);
  }
  return out;
}

/** True when every dependency of `task` is already ready or done. */
export function canStart(task: Task, tasks: Task[]): boolean {
  return blockedBy(task, tasks).length === 0;
}

/**
 * True when making `from` depend on `to` would close a loop — either because they are the same
 * task or because `to` already depends (directly or not) on `from`.
 */
export function hasCycle(tasks: Task[], from: string, to: string): boolean {
  if (from === to) return true;
  const byId = new Map(tasks.map(t => [t.id, t]));
  const seen = new Set<string>();
  const stack = [to];
  while (stack.length > 0) {
    const current = stack.pop() as string;
    if (current === from) return true;
    if (seen.has(current)) continue;
    seen.add(current);
    const task = byId.get(current);
    if (task) stack.push(...task.dependsOn);
  }
  return false;
}

/** Adds `dependsOnId` to `id`, unless it is already there or it would close a loop. */
export function linkDependency(tasks: Task[], id: string, dependsOnId: string): Task[] {
  const task = tasks.find(t => t.id === id);
  if (!task || !tasks.some(t => t.id === dependsOnId)) return tasks;
  if (task.dependsOn.includes(dependsOnId) || hasCycle(tasks, id, dependsOnId)) return tasks;
  return tasks.map(t => (t.id === id ? { ...t, dependsOn: [...t.dependsOn, dependsOnId], updatedAt: Date.now() } : t));
}

export function unlinkDependency(tasks: Task[], id: string, dependsOnId: string): Task[] {
  return tasks.map(t =>
    t.id === id && t.dependsOn.includes(dependsOnId)
      ? { ...t, dependsOn: t.dependsOn.filter(d => d !== dependsOnId), updatedAt: Date.now() }
      : t
  );
}

/** Removes a task and drops its id from everybody else's `dependsOn`. */
export function removeTask(tasks: Task[], id: string): Task[] {
  return tasks
    .filter(t => t.id !== id)
    .map(t => (t.dependsOn.includes(id) ? { ...t, dependsOn: t.dependsOn.filter(d => d !== id) } : t));
}

// ---- Dependency graph layout ----

export const TASK_NODE_WIDTH = 230;
export const TASK_NODE_HEIGHT = 110;
export const TASK_GAP_X = 40;
export const TASK_GAP_Y = 70;

/**
 * Layers by depth: a task with no dependencies sits on row 0, every other one sits one row below
 * the deepest task it depends on. Tasks caught in a cycle (which the UI refuses to create, but a
 * hand-edited file could still hold) fall back to row 0 so nothing disappears from the graph.
 * The result is centered around x = 0, like `layoutAgents`, so `fitView` has nothing to correct.
 */
export function layoutTaskGraph(tasks: Task[]): Record<string, { x: number; y: number }> {
  const byId = new Map(tasks.map(t => [t.id, t]));
  const depth = new Map<string, number>();

  const compute = (id: string, seen: Set<string>): number => {
    const cached = depth.get(id);
    if (cached !== undefined) return cached;
    if (seen.has(id)) return 0;
    seen.add(id);
    const task = byId.get(id);
    let value = 0;
    for (const depId of task?.dependsOn ?? []) {
      if (!byId.has(depId)) continue;
      value = Math.max(value, compute(depId, seen) + 1);
    }
    seen.delete(id);
    depth.set(id, value);
    return value;
  };

  const rows = new Map<number, string[]>();
  for (const task of tasks) {
    const level = compute(task.id, new Set());
    const row = rows.get(level);
    if (row) row.push(task.id);
    else rows.set(level, [task.id]);
  }

  const positions: Record<string, { x: number; y: number }> = {};
  const widest = Math.max(0, ...[...rows.values()].map(r => r.length));
  const fullWidth = widest * TASK_NODE_WIDTH + Math.max(0, widest - 1) * TASK_GAP_X;
  for (const [level, ids] of rows) {
    const width = ids.length * TASK_NODE_WIDTH + Math.max(0, ids.length - 1) * TASK_GAP_X;
    let cursor = -fullWidth / 2 + (fullWidth - width) / 2;
    for (const id of ids) {
      positions[id] = { x: cursor, y: level * (TASK_NODE_HEIGHT + TASK_GAP_Y) };
      cursor += TASK_NODE_WIDTH + TASK_GAP_X;
    }
  }
  return positions;
}
