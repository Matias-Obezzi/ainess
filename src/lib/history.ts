// Per-project persistence of runs and the communication feed.
// Files live at <configDir>/history/<projectId>.json and are written with a debounce
// from a single store subscription, so the orchestrator does not need to know about it.
import { useAppStore } from "@/store";
import { getTransport } from "@/lib/transport";
import type { Run, CommMessage } from "@/types";

interface HistoryFile {
  version: 1;
  runs: Run[];
  messages: CommMessage[];
}

const MAX_RUNS = 300;
const MAX_MESSAGES = 3000;
const MAX_RAW_LINES = 300;
const SAVE_DELAY_MS = 500;

const loadedProjects = new Set<string>();
const dirtyProjects = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let subscribed = false;

const filePath = (projectId: string) => `history/${projectId}.json`;

/** Subscribe once to the store and persist whichever project's runs/messages changed. */
export function attachHistoryPersistence(): void {
  if (subscribed) return;
  subscribed = true;
  useAppStore.subscribe((state, prev) => {
    if (state.runs === prev.runs && state.messages === prev.messages) return;
    const changed = new Set<string>();
    if (state.runs !== prev.runs) {
      for (const [id, run] of Object.entries(state.runs)) {
        if (prev.runs[id] !== run) changed.add(run.projectId);
      }
    }
    if (state.messages !== prev.messages) {
      const p = prev.messages;
      for (let i = 0; i < state.messages.length; i++) {
        const m = state.messages[i];
        if (p[i] !== m && m.projectId) changed.add(m.projectId);
      }
    }
    for (const projectId of changed) scheduleSave(projectId);
  });
}

function scheduleSave(projectId: string): void {
  dirtyProjects.add(projectId);
  if (timers.has(projectId)) return;
  timers.set(projectId, setTimeout(() => {
    timers.delete(projectId);
    void saveHistory(projectId);
  }, SAVE_DELAY_MS));
}

export async function saveHistory(projectId: string): Promise<void> {
  dirtyProjects.delete(projectId);
  const state = useAppStore.getState();
  if (!state.config.projects.some(p => p.id === projectId)) return;
  const runs = Object.values(state.runs)
    .filter(r => r.projectId === projectId)
    .sort((a, b) => a.startedAt - b.startedAt)
    .slice(-MAX_RUNS)
    .map(r => ({ ...r, rawLines: r.rawLines.slice(-MAX_RAW_LINES) }));
  const messages = state.messages.filter(m => m.projectId === projectId).slice(-MAX_MESSAGES);
  const file: HistoryFile = { version: 1, runs, messages };
  try {
    await getTransport().writeTextFile(filePath(projectId), JSON.stringify(file));
  } catch { /* the null transport (browser preview) cannot write; ignore */ }
}

/** Write every pending project now (call before a CLI process exits). */
export async function flushHistory(): Promise<void> {
  for (const t of timers.values()) clearTimeout(t);
  timers.clear();
  const pending = [...dirtyProjects];
  dirtyProjects.clear();
  await Promise.all(pending.map(saveHistory));
}

/** Load a project's history into the store without overwriting what is already in memory. */
export async function loadHistory(projectId: string): Promise<void> {
  if (loadedProjects.has(projectId)) return;
  loadedProjects.add(projectId);
  let raw: string | null = null;
  try { raw = await getTransport().readTextFile(filePath(projectId)); } catch { return; }
  if (!raw) return;
  let parsed: HistoryFile;
  try { parsed = JSON.parse(raw) as HistoryFile; } catch { return; }
  if (!parsed || !Array.isArray(parsed.runs) || !Array.isArray(parsed.messages)) return;

  const now = Date.now();
  // Runs that were still running when the previous process died can never finish.
  const runs = parsed.runs.map(r =>
    r.status === "running"
      ? { ...r, status: "error" as const, output: "[interrumpido: la aplicación se cerró]", endedAt: now }
      : r,
  );
  useAppStore.setState(state => {
    const newRuns = { ...state.runs };
    for (const r of runs) if (!newRuns[r.id]) newRuns[r.id] = r;
    const known = new Set(state.messages.map(m => m.id));
    const added = parsed.messages.filter(m => !known.has(m.id));
    const messages = added.length ? [...added, ...state.messages].sort((a, b) => a.ts - b.ts) : state.messages;
    return { runs: newRuns, messages };
  });
}

/** Drop a project's runs and messages, in memory and on disk. */
export async function clearHistory(projectId: string): Promise<void> {
  loadedProjects.add(projectId);
  useAppStore.setState(state => ({
    runs: Object.fromEntries(Object.entries(state.runs).filter(([, r]) => r.projectId !== projectId)),
    messages: state.messages.filter(m => m.projectId !== projectId),
  }));
  const file: HistoryFile = { version: 1, runs: [], messages: [] };
  try { await getTransport().writeTextFile(filePath(projectId), JSON.stringify(file)); } catch { /* ignore */ }
}

/** Called when a project is deleted: forget it and empty its file. */
export function forgetHistory(projectId: string): void {
  loadedProjects.delete(projectId);
  dirtyProjects.delete(projectId);
  const t = timers.get(projectId);
  if (t) { clearTimeout(t); timers.delete(projectId); }
  void getTransport().writeTextFile(filePath(projectId), "{}").catch(() => {});
}

/** Number of persisted-or-live runs for a project (for the UI). */
export function countRuns(runs: Record<string, Run>, projectId: string): number {
  let n = 0;
  for (const r of Object.values(runs)) if (r.projectId === projectId) n++;
  return n;
}
