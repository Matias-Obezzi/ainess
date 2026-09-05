// Per-project persistence of runs, the communication feed and approvals.
// Files live at <configDir>/history/<projectId>.json and are written with a debounce
// from a single store subscription, so the orchestrator does not need to know about it.
//
// Several processes may write the same file (the app, `ais run`, `ais approvals approve`,
// `ais serve`), so every save first merges what is on disk, and the app re-syncs the
// current project periodically to see decisions taken elsewhere.
import { useAppStore } from "@/store";
import { getTransport } from "@/lib/transport";
import type { Run, CommMessage, Approval } from "@/types";

interface HistoryFile {
  version: 1;
  runs: Run[];
  messages: CommMessage[];
  /** Pending (and recently decided) approvals, so a restart does not lose them. */
  approvals?: Approval[];
}

const MAX_RUNS = 300;
const MAX_MESSAGES = 3000;
const MAX_RAW_LINES = 300;
const MAX_APPROVALS = 100;
const SAVE_DELAY_MS = 500;
const SYNC_INTERVAL_MS = 5000;

const loadedProjects = new Set<string>();
const dirtyProjects = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let subscribed = false;
let syncTimer: ReturnType<typeof setInterval> | null = null;

const filePath = (projectId: string) => `history/${projectId}.json`;

/** Subscribe once to the store and persist whichever project's runs/messages/approvals changed. */
export function attachHistoryPersistence(): void {
  if (subscribed) return;
  subscribed = true;
  useAppStore.subscribe((state, prev) => {
    if (state.runs === prev.runs && state.messages === prev.messages && state.approvals === prev.approvals) return;
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
    if (state.approvals !== prev.approvals) {
      for (const [id, a] of Object.entries(state.approvals)) {
        if (prev.approvals[id] !== a) changed.add(a.projectId);
      }
    }
    for (const projectId of changed) scheduleSave(projectId);
  });
}

/** Re-read the current project's file every few seconds (decisions from the CLI/phone). */
export function startHistorySync(): void {
  if (syncTimer) return;
  syncTimer = setInterval(() => {
    const id = useAppStore.getState().currentProjectId;
    if (id && !timers.has(id)) void mergeFromDisk(id);
  }, SYNC_INTERVAL_MS);
  // Never keep a CLI process alive just for this timer.
  const t = syncTimer as unknown as { unref?: () => void };
  if (typeof t.unref === "function") t.unref();
}

function scheduleSave(projectId: string): void {
  dirtyProjects.add(projectId);
  if (timers.has(projectId)) return;
  timers.set(projectId, setTimeout(() => {
    timers.delete(projectId);
    void saveHistory(projectId);
  }, SAVE_DELAY_MS));
}

async function readFile(projectId: string): Promise<HistoryFile | null> {
  let raw: string | null = null;
  try { raw = await getTransport().readTextFile(filePath(projectId)); } catch { return null; }
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw) as HistoryFile;
    if (!parsed || !Array.isArray(parsed.runs) || !Array.isArray(parsed.messages)) return null;
    return parsed;
  } catch {
    return null;
  }
}

/**
 * Merge the on-disk file into memory without discarding anything this process knows.
 * Runs/messages: added when unknown. Approvals: a decision made elsewhere wins over a
 * pending copy in memory. Runs left "running" by a dead process are closed as errors,
 * unless this process is the one running them.
 */
async function mergeFromDisk(projectId: string): Promise<void> {
  const parsed = await readFile(projectId);
  if (!parsed) return;
  const now = Date.now();
  useAppStore.setState(state => {
    let changed = false;
    const runs = { ...state.runs };
    for (const r of parsed.runs) {
      if (runs[r.id]) continue;
      runs[r.id] = r.status === "running"
        ? { ...r, status: "error", output: "[interrumpido: la aplicación se cerró]", endedAt: now }
        : r;
      changed = true;
    }
    const known = new Set(state.messages.map(m => m.id));
    const added = parsed.messages.filter(m => !known.has(m.id));
    const messages = added.length ? [...added, ...state.messages].sort((a, b) => a.ts - b.ts) : state.messages;
    if (added.length) changed = true;
    const approvals = { ...state.approvals };
    for (const a of parsed.approvals ?? []) {
      const mine = approvals[a.id];
      if (!mine || (mine.status === "pending" && a.status !== "pending")) {
        approvals[a.id] = a;
        changed = true;
      }
    }
    return changed ? { runs, messages, approvals } : state;
  });
}

export async function saveHistory(projectId: string): Promise<void> {
  dirtyProjects.delete(projectId);
  const before = useAppStore.getState();
  if (!before.config.projects.some(p => p.id === projectId)) return;
  // Another process may have added runs/approvals since we last read the file.
  await mergeFromDisk(projectId);
  const state = useAppStore.getState();
  const runs = Object.values(state.runs)
    .filter(r => r.projectId === projectId)
    .sort((a, b) => a.startedAt - b.startedAt)
    .slice(-MAX_RUNS)
    .map(r => ({ ...r, rawLines: r.rawLines.slice(-MAX_RAW_LINES) }));
  const messages = state.messages.filter(m => m.projectId === projectId).slice(-MAX_MESSAGES);
  const approvals = Object.values(state.approvals)
    .filter(a => a.projectId === projectId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-MAX_APPROVALS);
  const file: HistoryFile = { version: 1, runs, messages, approvals };
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

/** Load (or re-sync) a project's history into the store. Safe to call repeatedly. */
export async function loadHistory(projectId: string): Promise<void> {
  loadedProjects.add(projectId);
  await mergeFromDisk(projectId);
}

/** Alias that reads better at call sites that want fresh data from other processes. */
export const syncHistory = loadHistory;

/** Drop a project's runs, messages and approvals, in memory and on disk. */
export async function clearHistory(projectId: string): Promise<void> {
  loadedProjects.add(projectId);
  useAppStore.setState(state => ({
    runs: Object.fromEntries(Object.entries(state.runs).filter(([, r]) => r.projectId !== projectId)),
    messages: state.messages.filter(m => m.projectId !== projectId),
    approvals: Object.fromEntries(Object.entries(state.approvals).filter(([, a]) => a.projectId !== projectId)),
  }));
  const file: HistoryFile = { version: 1, runs: [], messages: [], approvals: [] };
  const t = timers.get(projectId);
  if (t) { clearTimeout(t); timers.delete(projectId); }
  dirtyProjects.delete(projectId);
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
