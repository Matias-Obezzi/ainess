// Per-project persistence of the task board. Files live at <configDir>/tasks/<projectId>.json and
// are written with a debounce from a single store subscription, the same shape as src/lib/history.ts,
// so neither the board nor the orchestrator needs to know when a save happens.
import { useAppStore } from "@/store";
import { getTransport } from "@/lib/transport";
import { createTask } from "@/lib/tasks";
import type { Task, TaskStatus } from "@/types";

interface TaskFile {
  version: 1;
  tasks: Task[];
}

/** Hard cap per project; over it, the oldest archived tasks are dropped first. */
const MAX_TASKS = 500;
const SAVE_DELAY_MS = 500;

const VALID_STATUSES: TaskStatus[] = ["backlog", "working", "needs-you", "in-review", "ready", "done"];

const loadedProjects = new Set<string>();
const dirtyProjects = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let subscribed = false;

const filePath = (projectId: string) => `tasks/${projectId}.json`;

/** Subscribe once to the store and persist whichever project's tasks changed. */
export function attachTaskPersistence(): void {
  if (subscribed) return;
  subscribed = true;
  useAppStore.subscribe((state, prev) => {
    if (state.tasks === prev.tasks) return;
    for (const [projectId, list] of Object.entries(state.tasks)) {
      if (prev.tasks[projectId] !== list) scheduleSave(projectId);
    }
  });
}

function scheduleSave(projectId: string): void {
  if (!loadedProjects.has(projectId)) return;
  dirtyProjects.add(projectId);
  if (timers.has(projectId)) return;
  timers.set(projectId, setTimeout(() => {
    timers.delete(projectId);
    void saveTasks(projectId);
  }, SAVE_DELAY_MS));
}

/** Drops anything a hand-edited (or older) file could hold that the board cannot render. */
function sanitize(raw: unknown, projectId: string): Task[] {
  if (!Array.isArray(raw)) return [];
  const seen = new Set<string>();
  const out: Task[] = [];
  for (const item of raw) {
    const t = item as Partial<Task>;
    if (!t || typeof t.id !== "string" || typeof t.title !== "string") continue;
    if (seen.has(t.id)) continue;
    seen.add(t.id);
    out.push(createTask({
      ...t,
      projectId,
      status: VALID_STATUSES.includes(t.status as TaskStatus) ? t.status : "backlog",
      dependsOn: Array.isArray(t.dependsOn) ? t.dependsOn.filter(d => typeof d === "string") : [],
    }));
  }
  // A dependency on a task that is no longer in the file would block its column forever.
  const ids = new Set(out.map(t => t.id));
  return out.map(t => (t.dependsOn.every(d => ids.has(d)) ? t : { ...t, dependsOn: t.dependsOn.filter(d => ids.has(d)) }));
}

/** Over the cap, archived tasks go first (oldest first), then the oldest of the rest. */
export function trimTasks(tasks: Task[]): Task[] {
  if (tasks.length <= MAX_TASKS) return tasks;
  const doomed = new Set<string>();
  const byAge = [...tasks].sort((a, b) => a.updatedAt - b.updatedAt);
  for (const t of byAge) {
    if (tasks.length - doomed.size <= MAX_TASKS) break;
    if (t.archived) doomed.add(t.id);
  }
  for (const t of byAge) {
    if (tasks.length - doomed.size <= MAX_TASKS) break;
    doomed.add(t.id);
  }
  return tasks
    .filter(t => !doomed.has(t.id))
    .map(t => (t.dependsOn.some(d => doomed.has(d)) ? { ...t, dependsOn: t.dependsOn.filter(d => !doomed.has(d)) } : t));
}

export async function saveTasks(projectId: string): Promise<void> {
  dirtyProjects.delete(projectId);
  const state = useAppStore.getState();
  if (!state.config.projects.some(p => p.id === projectId)) return;
  const file: TaskFile = { version: 1, tasks: trimTasks(state.tasks[projectId] ?? []) };
  try {
    await getTransport().writeTextFile(filePath(projectId), JSON.stringify(file));
  } catch { /* the null transport (browser preview) cannot write; ignore */ }
}

/** Read a project's tasks from disk into the store. Safe to call repeatedly. */
export async function loadTasks(projectId: string): Promise<void> {
  if (loadedProjects.has(projectId)) return;
  let raw: string | null = null;
  try { raw = await getTransport().readTextFile(filePath(projectId)); } catch { raw = null; }
  let tasks: Task[] = [];
  if (raw) {
    try {
      const parsed = JSON.parse(raw) as Partial<TaskFile>;
      tasks = sanitize(parsed?.tasks, projectId);
    } catch { tasks = []; }
  }
  loadedProjects.add(projectId);
  // Anything the orchestrator created while the file was being read stays: disk only fills the gaps.
  useAppStore.setState(state => {
    const inMemory = state.tasks[projectId] ?? [];
    if (inMemory.length === 0) return { tasks: { ...state.tasks, [projectId]: tasks } };
    const known = new Set(inMemory.map(t => t.id));
    const merged = [...tasks.filter(t => !known.has(t.id)), ...inMemory];
    return { tasks: { ...state.tasks, [projectId]: merged } };
  });
}

/** Write every pending project now (call before a CLI process exits). */
export async function flushTasks(): Promise<void> {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  const pending = [...dirtyProjects];
  dirtyProjects.clear();
  await Promise.all(pending.map(saveTasks));
}

/** Called when a project is deleted: forget it and empty its file. */
export function forgetTasks(projectId: string): void {
  loadedProjects.delete(projectId);
  dirtyProjects.delete(projectId);
  const t = timers.get(projectId);
  if (t) { clearTimeout(t); timers.delete(projectId); }
  void getTransport().writeTextFile(filePath(projectId), "{}").catch(() => {});
}
