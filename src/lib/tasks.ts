// Pure task logic: creation defaults, column ordering, dependency checks and the layered layout
// used by the dependency graph. Nothing here touches the store or the disk, so it is all testable
// (see src/lib/__tests__/tasks.test.ts). Persistence lives in src/lib/task-store.ts.
import type { Task, TaskPriority, TaskStatus } from "@/types";
import { translateNow } from "@/i18n/useT";

/** Columns of the board, left to right. */
export const TASK_STATUSES: TaskStatus[] = ["backlog", "working", "needs-you", "in-review", "ready", "done"];

/** Priorities offered in the UI, from the calmest to the most urgent. */
export const TASK_PRIORITIES: TaskPriority[] = ["low", "normal", "high"];

/**
 * What a form actually stores for a priority. "normal" is what every task is unless someone says
 * otherwise, so writing it would only add a field that says nothing to every task file.
 */
export function storedPriority(priority: TaskPriority): TaskPriority | undefined {
  return priority === "normal" ? undefined : priority;
}

/** A dependency is satisfied once its task reached one of these. */
const SATISFIED: TaskStatus[] = ["ready", "done"];

export function createTask(partial: Partial<Task> & { projectId: string }): Task {
  const now = Date.now();
  return {
    id: partial.id ?? crypto.randomUUID(),
    projectId: partial.projectId,
    title: (partial.title ?? translateNow("task.untitled")).trim() || translateNow("task.untitled"),
    detail: partial.detail,
    status: partial.status ?? "backlog",
    priority: TASK_PRIORITIES.includes(partial.priority as TaskPriority) ? partial.priority : undefined,
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

/**
 * Urgent first, everything else next. "low" is not pushed down: it is a note for the reader, not a
 * way of hiding work at the bottom of the column.
 */
function priorityRank(task: Task): number {
  return task.priority === "high" ? 0 : 1;
}

/** The live (non archived) tasks of one column, in board order: high priority first, then `order`. */
export function sortColumn(tasks: Task[], status: TaskStatus): Task[] {
  return tasks
    .filter(t => !t.archived && t.status === status)
    .sort((a, b) => (priorityRank(a) - priorityRank(b)) || (a.order - b.order) || (a.createdAt - b.createdAt));
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

/**
 * Everything `id` is tied to by a chain of dependencies: what it waits for, what waits for it, and
 * so on in both directions, plus the task itself. Returned in the order `tasks` came in.
 *
 * Note what is NOT here: a task that merely shares a prerequisite. That is a sibling, not family —
 * its work neither blocks this one nor waits on it, and knowing about it tells you nothing about
 * this task. Pulling those in is what made the whole-board graph grow sideways until it could not
 * be read, which is the entire reason this function exists.
 *
 * The two directions are walked separately and never mixed: stepping down from an ancestor is
 * exactly how the siblings would get back in.
 */
export function taskFamily(tasks: Task[], id: string): Task[] {
  const byId = new Map(tasks.map(t => [t.id, t]));
  if (!byId.has(id)) return [];

  const family = new Set<string>([id]);

  // Upwards: what it depends on, and what those depend on.
  const up = [id];
  while (up.length > 0) {
    const current = byId.get(up.pop()!);
    if (!current) continue;
    for (const depId of current.dependsOn) {
      if (!byId.has(depId) || family.has(depId)) continue;
      family.add(depId);
      up.push(depId);
    }
  }

  // Downwards: what depends on it, and what depends on those.
  const down = [id];
  while (down.length > 0) {
    const currentId = down.pop()!;
    for (const task of tasks) {
      if (family.has(task.id) || !task.dependsOn.includes(currentId)) continue;
      family.add(task.id);
      down.push(task.id);
    }
  }

  return tasks.filter(task => family.has(task.id));
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

// ---- Board filter ----

/** What the board bar is filtering by. An empty query and no agent means "show everything". */
export interface TaskFilter {
  /** Free text matched against the title and the detail. */
  query: string;
  /** Agent id, or null for every agent. */
  agentId: string | null;
}

export const EMPTY_TASK_FILTER: TaskFilter = { query: "", agentId: null };

/** Lowercase and without accents, so "migracion" finds "migración". */
function normalize(text: string): string {
  return text.toLowerCase().normalize("NFD").replace(/\p{Diacritic}/gu, "");
}

export function isFiltering(filter: TaskFilter): boolean {
  return filter.query.trim().length > 0 || filter.agentId !== null;
}

/** The tasks the board and the graph should draw. A view level filter: nothing is persisted. */
export function filterTasks(tasks: Task[], filter: TaskFilter): Task[] {
  if (!isFiltering(filter)) return tasks;
  const needle = normalize(filter.query.trim());
  return tasks.filter(task => {
    if (filter.agentId !== null && task.agentId !== filter.agentId) return false;
    if (!needle) return true;
    return normalize(`${task.title} ${task.detail ?? ""}`).includes(needle);
  });
}

// ---- Automatic archiving ----

const DAY_MS = 24 * 60 * 60 * 1000;

/**
 * The done tasks nobody touched for `days` days, which the board archives on its own. Anything in
 * another column, or already archived, is left alone; `days` null or below one turns it off. A task
 * that is exactly at the limit still counts as fresh, so the sweep only ever acts on older work.
 */
export function tasksToAutoArchive(tasks: Task[], days: number | null | undefined, now: number): Task[] {
  if (days === null || days === undefined || !Number.isFinite(days) || days < 1) return [];
  const cutoff = now - days * DAY_MS;
  return tasks.filter(t => t.status === "done" && !t.archived && t.updatedAt < cutoff);
}

// ---- Task from a message ----

/** Title of a task written from a message: its first non empty line, trimmed to `max` characters. */
export function taskTitleFromText(text: string, max = 80): string {
  const line = text.split("\n").map(l => l.trim()).find(l => l.length > 0) ?? "";
  const clean = line.replace(/^[#>*\-\s]+/, "").trim();
  if (!clean) return "";
  return clean.length > max ? `${clean.slice(0, max - 1).trimEnd()}…` : clean;
}

// ---- Export ----

/** Everything `boardMarkdown` needs to write in the user's language without importing the i18n layer. */
export interface BoardMarkdownLabels {
  /** Name of a column, as its header. */
  status(status: TaskStatus): string;
  /** Name of the agent in charge, or undefined when it is gone or unassigned. */
  agent(agentId: string): string | undefined;
  /** Word before the list of unfinished dependencies, without the colon ("bloqueada por"). */
  blockedBy: string;
}

/**
 * The live board as a markdown checklist, one section per column. Done tasks are ticked, empty
 * columns are skipped and archived work is left out: what you copy is what you see.
 */
export function boardMarkdown(tasks: Task[], labels: BoardMarkdownLabels): string {
  const sections: string[] = [];
  for (const status of TASK_STATUSES) {
    const items = sortColumn(tasks, status);
    if (items.length === 0) continue;
    const lines = items.map(task => {
      const agent = task.agentId ? labels.agent(task.agentId) : undefined;
      const extras: string[] = [];
      if (task.branch) extras.push(task.branch);
      const missing = blockedBy(task, tasks);
      if (missing.length > 0) extras.push(`${labels.blockedBy}: ${missing.map(m => m.title).join(", ")}`);
      const tail = extras.length > 0 ? ` — ${extras.join(" — ")}` : "";
      return `- [${status === "done" ? "x" : " "}] ${task.title}${agent ? ` (${agent})` : ""}${tail}`;
    });
    sections.push(`## ${labels.status(status)}\n${lines.join("\n")}`);
  }
  return sections.join("\n\n");
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
