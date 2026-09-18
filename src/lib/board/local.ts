// The board a project keeps on this machine: <configDir>/tasks/<projectId>.json. This is the only
// provider implemented today and the fallback for every other one (see ./registry.ts). The copy the
// agents read in the project's own folder is not written here: it is the projection of whichever
// board the project uses, so it belongs to src/lib/task-store.ts.
//
// Everything that touches the file lives here; src/lib/task-store.ts keeps what is proper to
// persistence and not to a provider: the store subscription, the debounce, which projects are
// loaded and which are dirty.
import { getTransport } from "@/lib/transport";
import { createTask } from "@/lib/tasks";
import type { BoardProvider } from "@/lib/board/provider";
import type { Task, TaskStatus } from "@/types";

interface TaskFile {
  version: 1;
  tasks: Task[];
}

/** Hard cap per project; over it, the oldest archived tasks are dropped first. */
const MAX_TASKS = 500;

const VALID_STATUSES: TaskStatus[] = ["backlog", "working", "needs-you", "in-review", "ready", "done"];

/**
 * Projects whose file this provider has already read. A card that is on disk and not in the list
 * being saved was deleted on purpose only if we had read the file first; before that, it is a card
 * we simply never saw. Kept here rather than read from the task store because it is what *this*
 * provider last saw, which is exactly what `save` has to diff against.
 */
const seenProjects = new Set<string>();

export const taskFilePath = (projectId: string) => `tasks/${projectId}.json`;

/** The mirrored card of a remote board, when the file holds a whole one. */
function sanitizeExternal(raw: Task["external"]): Task["external"] {
  if (!raw || typeof raw.provider !== "string" || typeof raw.id !== "string" || !raw.id) return undefined;
  return { provider: raw.provider, id: raw.id, url: typeof raw.url === "string" ? raw.url : undefined };
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
      // Which card on a remote board this one mirrors survives the round trip: without it the next
      // save would take it for a card the remote never saw and open a duplicate of it there. Half
      // of one (a provider with no id) is worse than none, so it is kept only whole.
      external: sanitizeExternal(t.external),
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

/** The file as the board can render it, or an empty list when there is nothing readable. */
async function readFromDisk(projectId: string): Promise<Task[]> {
  let raw: string | null = null;
  try { raw = await getTransport().readTextFile(taskFilePath(projectId)); } catch { return []; }
  if (!raw) return [];
  try {
    return sanitize((JSON.parse(raw) as Partial<TaskFile>)?.tasks, projectId);
  } catch {
    return [];
  }
}

/**
 * The app and a `ainess` process can have the same board open. Writing our copy flat would drop what
 * the other one added, so the file is re-read first: cards only we know about are kept, cards only
 * it knows about come along, and for the ones both have the newer `updatedAt` wins.
 */
async function mergeWithDisk(projectId: string, mine: Task[]): Promise<Task[]> {
  let onDisk: Task[] = [];
  try {
    const raw = await getTransport().readTextFile(taskFilePath(projectId));
    if (raw) onDisk = sanitize((JSON.parse(raw) as Partial<TaskFile>)?.tasks, projectId);
  } catch {
    return mine;
  }
  if (onDisk.length === 0) return mine;

  const byId = new Map(mine.map(t => [t.id, t]));
  for (const task of onDisk) {
    const ours = byId.get(task.id);
    // A card we deleted in this process is gone on purpose: `load` already put the file's cards in
    // memory, so anything missing here was removed rather than never seen.
    if (!ours) {
      if (!seenProjects.has(projectId)) byId.set(task.id, task);
      continue;
    }
    if (task.updatedAt > ours.updatedAt) byId.set(task.id, task);
  }
  return trimTasks([...byId.values()]);
}

export const localBoardProvider: BoardProvider = {
  id: "local",

  async load(projectId: string): Promise<Task[]> {
    const tasks = await readFromDisk(projectId);
    seenProjects.add(projectId);
    return tasks;
  },

  async save(projectId: string, tasks: Task[]): Promise<Task[]> {
    const file: TaskFile = { version: 1, tasks: await mergeWithDisk(projectId, tasks) };
    try {
      await getTransport().writeTextFile(taskFilePath(projectId), JSON.stringify(file));
    } catch { /* the null transport (browser preview) cannot write; ignore */ }
    // The merged list, not the one that came in: another process may have added cards.
    return file.tasks;
  },
};

/** Called when a project is deleted: forget what we read of it and empty its file. */
export function forgetLocalBoard(projectId: string): void {
  seenProjects.delete(projectId);
  void getTransport().deleteFile(taskFilePath(projectId)).catch(() => {});
}
