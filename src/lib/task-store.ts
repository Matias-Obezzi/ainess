// Per-project persistence of the task board: when a save happens, what it is allowed to drop and
// who gets told. *Where* the cards actually live is the board provider's business — today always
// the local file at <configDir>/tasks/<projectId>.json, see src/lib/board/. What does not belong to
// a provider is the copy the agents read in the project's own folder: that one is written here,
// after every save, whichever board answered it. The write is debounced
// from a single store subscription, the same shape as src/lib/history.ts, so neither the board nor
// the orchestrator needs to know when a save happens.
import { useAppStore } from "@/store";
import { boardProviderFor } from "@/lib/board/registry";
import type { BoardProvider } from "@/lib/board/provider";
import { forgetLocalBoard, trimTasks } from "@/lib/board/local";
import { writeProjectFolder } from "@/lib/project-folder";
import type { Task } from "@/types";

export { trimTasks };

const SAVE_DELAY_MS = 500;

const loadedProjects = new Set<string>();
const dirtyProjects = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
/** How to stop watching each project whose provider watches. A local board has nobody else
 *  writing to it and never lands here. */
const watchers = new Map<string, () => void>();
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
  const provider = boardProviderFor(projectOf(projectId));
  let tasks: Task[] = [];
  try {
    tasks = await provider.load(projectId);
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
  startWatching(projectId, provider);
}

/**
 * Folds a board somebody else moved into the one in memory.
 *
 * Two things have to survive at once. A card that is not in what the board sent stays exactly where
 * it is — that is the card the orchestrator opened one second ago, and the card a delegation made,
 * which never travels to a remote board at all. And a card that *is* in both keeps everything the
 * remote board has no idea about: who is on it, the run behind it, the branch, what it waits for.
 * Only the four things a collaborator can actually change over there — the title, the detail, the
 * column and where the card lives — come from the other side.
 */
function foldRemote(inMemory: Task[], incoming: Task[]): Task[] {
  const byId = new Map(incoming.map(t => [t.id, t]));
  const merged = inMemory.map(mine => {
    const theirs = byId.get(mine.id);
    if (!theirs) return mine;
    byId.delete(mine.id);
    if (theirs.title === mine.title && theirs.detail === mine.detail && theirs.status === mine.status) return mine;
    return { ...mine, title: theirs.title, detail: theirs.detail, status: theirs.status, external: theirs.external, updatedAt: theirs.updatedAt };
  });
  // Whatever is left is a card opened on the other side since the last read.
  return [...byId.values(), ...merged];
}

/** Starts polling the board when its provider is one that can change without us. */
function startWatching(projectId: string, provider: BoardProvider): void {
  if (!provider.watch || watchers.has(projectId)) return;
  const stop = provider.watch(projectId, incoming => {
    useAppStore.setState(state => ({
      tasks: { ...state.tasks, [projectId]: foldRemote(state.tasks[projectId] ?? [], incoming) },
    }));
  });
  watchers.set(projectId, stop);
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
  // A poll left running against a deleted project would keep spending the token, and would put its
  // cards back into a store that no longer has anywhere to show them.
  const stop = watchers.get(projectId);
  if (stop) { stop(); watchers.delete(projectId); }
  forgetLocalBoard(projectId);
}
