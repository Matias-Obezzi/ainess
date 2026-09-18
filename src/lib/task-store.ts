// Per-project persistence of the task board: when a save happens, what it is allowed to drop and
// who gets told. *Where* the cards actually live is the board provider's business — today always
// the local file at <configDir>/tasks/<projectId>.json, see src/lib/board/. What does not belong to
// a provider is the copy the agents read in the project's own folder: that one is written here,
// after every save, whichever board answered it. The write is debounced
// from a single store subscription, the same shape as src/lib/history.ts, so neither the board nor
// the orchestrator needs to know when a save happens.
import { useAppStore } from "@/store";
import { boardProviderFor } from "@/lib/board/registry";
import { forgetLocalBoard, trimTasks } from "@/lib/board/local";
import { writeProjectFolder } from "@/lib/project-folder";
import type { Task } from "@/types";

export { trimTasks };

const SAVE_DELAY_MS = 500;

const loadedProjects = new Set<string>();
const dirtyProjects = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let subscribed = false;

/** The project a board belongs to, or undefined while it is being created or already deleted. */
const projectOf = (projectId: string) =>
  useAppStore.getState().config.projects.find(p => p.id === projectId);

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

export async function saveTasks(projectId: string): Promise<void> {
  dirtyProjects.delete(projectId);
  const state = useAppStore.getState();
  const project = state.config.projects.find(p => p.id === projectId);
  if (!project) return;
  const mine = trimTasks(state.tasks[projectId] ?? []);

  // Two try/catch and not one: the board and its projection fail apart from each other. A remote
  // board that rejects the write must not cost the agents their `.ainess/BOARD.md`, and a
  // workspace that cannot be written to must not look like a board that refused the cards.
  let saved = mine;
  try {
    saved = await boardProviderFor(project).save(projectId, mine);
  } catch {
    // A board that refuses the write is a stale board, never a stopped app: the cards stay in
    // memory and the next change schedules another save.
  }
  try {
    // The projection runs for every provider, not just the local one: `.ainess/BOARD.md` is what
    // the agents read in their prompt, so it cannot depend on where the board lives. It is written
    // from what the provider gave back, which is the board after the merge with whatever another
    // process added — not only what this one had in memory.
    await writeProjectFolder(project, saved, project.agents);
  } catch {
    // The project folder is a courtesy to the agents, never a step of the run.
  }
}

/** Read a project's tasks from its board into the store. Safe to call repeatedly. */
export async function loadTasks(projectId: string): Promise<void> {
  if (loadedProjects.has(projectId)) return;
  let tasks: Task[] = [];
  try {
    tasks = await boardProviderFor(projectOf(projectId)).load(projectId);
  } catch {
    tasks = [];
  }
  loadedProjects.add(projectId);
  // Anything the orchestrator created while the board was being read stays: it only fills the gaps.
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

/** Called when a project is deleted: forget it and empty its board. */
export function forgetTasks(projectId: string): void {
  loadedProjects.delete(projectId);
  dirtyProjects.delete(projectId);
  const t = timers.get(projectId);
  if (t) { clearTimeout(t); timers.delete(projectId); }
  forgetLocalBoard(projectId);
}
