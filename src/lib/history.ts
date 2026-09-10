// Per-project persistence of runs, the communication feed and approvals.
// Files live at <configDir>/history/<projectId>.json and are written with a debounce
// from a single store subscription, so the orchestrator does not need to know about it.
//
// Several processes may write the same file (the app, `ainess run`, `ainess approvals approve`,
// `ainess serve`), so every save first merges what is on disk, and the app re-syncs the
// current project periodically to see decisions taken elsewhere.
import { useAppStore, selectAgent } from "@/store";
import { getTransport } from "@/lib/transport";
import type { Run, CommMessage, AgentQuestion, Approval, AgentWorktree } from "@/types";
import { translateNow } from "@/i18n/useT";
import { interruptedStrings } from "@/i18n/interrupted";
import { rawLinesOf } from "@/lib/raw-lines";
import { runtimeAfterInterruption } from "@/lib/interrupted-runtime";

interface HistoryFile {
  version: 1;
  runs: Run[];
  messages: CommMessage[];
  /** Pending (and recently decided) approvals, so a restart does not lose them. */
  approvals?: Approval[];
  /**
   * Questions agents asked, for the same reason: one that is lost leaves its agent waiting for an
   * answer nobody can give any more.
   */
  questions?: AgentQuestion[];
  /**
   * Conversation ids per agent (Claude session / agy conversation), so a follow-up prompt
   * after a restart still continues the same conversation. `null` = explicitly reset.
   */
  sessions?: Record<string, { sessionId: string | null; updatedAt: number }>;
  /** Git worktrees of this project's agents (see src/lib/worktree.ts). */
  worktrees?: AgentWorktree[];
}

/** Output of a run that was still running when the app (or CLI) that owned it went away. */
export function interruptedOutput(): string { return translateNow("system.interrupted"); }

/**
 * Whether an output is that mark, whichever language wrote it.
 *
 * The text is translated when the run is closed, and read back on a later launch that may be
 * running in another language — comparing against today's wording alone would stop recognising a
 * run this same app interrupted yesterday.
 */
export function isInterruptedOutput(text: string): boolean {
  return Object.values(interruptedStrings).some(s => s === text);
}

const MAX_RUNS = 300;
const MAX_MESSAGES = 3000;
const MAX_RAW_LINES = 300;
const MAX_APPROVALS = 100;
const SAVE_DELAY_MS = 500;
const SYNC_INTERVAL_MS = 5000;

const loadedProjects = new Set<string>();
/**
 * Projects whose worktree records were already taken from disk. Unlike runs or approvals, the
 * list in memory is authoritative afterwards: re-adopting the file would resurrect a worktree the
 * user just deleted.
 */
const worktreesLoaded = new Set<string>();
const dirtyProjects = new Set<string>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();
let subscribed = false;
let syncTimer: ReturnType<typeof setInterval> | null = null;

const filePath = (projectId: string) => `history/${projectId}.json`;

/**
 * Finds the projects whose messages changed without walking the whole unchanged prefix.
 */
export function changedProjectsFromMessages(next: CommMessage[], prev: CommMessage[]): string[] {
  if (next === prev) return [];
  const changed = new Set<string>();
  const len = Math.max(next.length, prev.length);
  for (let i = len - 1; i >= 0; i--) {
    const n = next[i];
    const p = prev[i];
    if (n === p) break;
    if (n && n.projectId) changed.add(n.projectId);
    if (p && p.projectId) changed.add(p.projectId);
  }
  return Array.from(changed);
}

/** Subscribe once to the store and persist whichever project's runs/messages/approvals changed. */
export function attachHistoryPersistence(): void {
  if (subscribed) return;
  subscribed = true;
  useAppStore.subscribe((state, prev) => {
    if (state.runs === prev.runs && state.messages === prev.messages && state.approvals === prev.approvals && state.questions === prev.questions && state.runtime === prev.runtime && state.worktrees === prev.worktrees) return;
    const changed = new Set<string>();
    if (state.worktrees !== prev.worktrees) {
      for (const projectId of new Set([...Object.keys(state.worktrees), ...Object.keys(prev.worktrees)])) {
        if (state.worktrees[projectId] !== prev.worktrees[projectId]) changed.add(projectId);
      }
    }
    if (state.runtime !== prev.runtime) {
      for (const [projectId, agents] of Object.entries(state.runtime)) {
        const prevAgents = prev.runtime[projectId];
        for (const [agentId, rt] of Object.entries(agents)) {
          if (rt.sessionUpdatedAt !== prevAgents?.[agentId]?.sessionUpdatedAt) changed.add(projectId);
        }
      }
    }
    if (state.runs !== prev.runs) {
      for (const [id, run] of Object.entries(state.runs)) {
        if (prev.runs[id] !== run) changed.add(run.projectId);
      }
    }
    if (state.messages !== prev.messages) {
      for (const projectId of changedProjectsFromMessages(state.messages, prev.messages)) {
        changed.add(projectId);
      }
    }
    if (state.questions !== prev.questions) {
      for (const [id, q] of Object.entries(state.questions)) {
        if (prev.questions[id] !== q) changed.add(q.projectId);
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
  /** Runs another process left hanging: the bell tells the user about them once they are closed. */
  const interrupted: Run[] = [];
  useAppStore.setState(state => {
    let changed = false;
    const runs = { ...state.runs };
    for (const r of parsed.runs) {
      if (runs[r.id]) continue;
      if (r.status === "running") {
        const closed: Run = { ...r, status: "killed", output: interruptedOutput(), endedAt: now };
        runs[r.id] = closed;
        interrupted.push(closed);
      } else {
        runs[r.id] = r;
      }
      changed = true;
    }
    const known = new Set(state.messages.map(m => m.id));
    const added = parsed.messages.filter(m => !known.has(m.id));
    const messages = added.length ? [...added, ...state.messages].sort((a, b) => a.ts - b.ts) : state.messages;
    if (added.length) changed = true;
    const questions = { ...state.questions };
    for (const q of parsed.questions ?? []) {
      const mine = questions[q.id];
      // An answer given in another process (the CLI, the phone) wins over a pending copy here.
      if (!mine || (mine.status === "pending" && q.status !== "pending")) {
        questions[q.id] = q;
        changed = true;
      }
    }
    const approvals = { ...state.approvals };
    for (const a of parsed.approvals ?? []) {
      const mine = approvals[a.id];
      if (!mine || (mine.status === "pending" && a.status !== "pending")) {
        approvals[a.id] = a;
        changed = true;
      }
    }
    // Sessions: the newest change wins, whether it came from this process or another one.
    let runtime = state.runtime;
    for (const [agentId, s] of Object.entries(parsed.sessions ?? {})) {
      const mine = runtime[projectId]?.[agentId];
      if (!mine) continue;
      if (s.updatedAt > (mine.sessionUpdatedAt ?? 0) && (s.sessionId ?? undefined) !== mine.sessionId) {
        runtime = {
          ...runtime,
          [projectId]: { ...runtime[projectId], [agentId]: { ...mine, sessionId: s.sessionId ?? undefined, sessionUpdatedAt: s.updatedAt } },
        };
        changed = true;
      }
    }
    // And what each agent was in the middle of when the app went away. The runs above are enough
    // for the thread; the hierarchy reads `runtime`, which a restart builds from the team alone.
    if (interrupted.length > 0 && runtime[projectId]) {
      const restored = runtimeAfterInterruption(runtime[projectId], interrupted);
      if (restored !== runtime[projectId]) {
        runtime = { ...runtime, [projectId]: restored };
        changed = true;
      }
    }

    // Worktrees: the file only seeds the list, the first time this project is read.
    let worktrees = state.worktrees;
    if (!worktreesLoaded.has(projectId)) {
      worktreesLoaded.add(projectId);
      const fromDisk = parsed.worktrees ?? [];
      if (fromDisk.length > 0) {
        const mine = state.worktrees[projectId] ?? [];
        const known = new Set(mine.map(w => w.agentId));
        const added = fromDisk.filter(w => w && w.agentId && !known.has(w.agentId));
        if (added.length > 0) {
          worktrees = { ...state.worktrees, [projectId]: [...mine, ...added] };
          changed = true;
        }
      }
    }
    return changed ? { runs, messages, approvals, questions, runtime, worktrees } : state;
  });
  notifyInterrupted(projectId, interrupted);
}

/** One entry when a single run was cut short, one summary line when several were. */
function notifyInterrupted(projectId: string, interrupted: Run[]): void {
  if (interrupted.length === 0) return;
  const store = useAppStore.getState();
  const project = store.config.projects.find(p => p.id === projectId);
  const inProject = !!project;
  if (interrupted.length === 1) {
    const run = interrupted[0];
    const agent = selectAgent(store, run.agentId);
    store.notify({
      kind: "interrupted",
      title: translateNow(inProject ? "notify.leftHalfwayIn" : "notify.leftHalfway", {
        name: agent?.name ?? translateNow("notify.anAgent"),
        project: project?.name ?? "",
      }),
      body: translateNow("notify.interruptedOne"),
      projectId,
      agentId: run.agentId,
      runId: run.id,
    });
    return;
  }
  store.notify({
    kind: "interrupted",
    title: translateNow(inProject ? "notify.runsLeftHalfwayIn" : "notify.runsLeftHalfway", {
      n: interrupted.length,
      project: project?.name ?? "",
    }),
    body: translateNow("notify.interruptedMany"),
    projectId,
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
    // A running run keeps its lines in `lib/raw-lines`, not in the store: they are picked up here
    // so a crash mid-run still leaves behind what the agent had printed.
    .map(r => ({ ...r, rawLines: (rawLinesOf(r.id) ?? r.rawLines).slice(-MAX_RAW_LINES) }));
  const messages = state.messages.filter(m => m.projectId === projectId).slice(-MAX_MESSAGES);
  const questions = Object.values(state.questions).filter(q => q.projectId === projectId);
  const approvals = Object.values(state.approvals)
    .filter(a => a.projectId === projectId)
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(-MAX_APPROVALS);
  const sessions: NonNullable<HistoryFile["sessions"]> = {};
  for (const [agentId, rt] of Object.entries(state.runtime[projectId] ?? {})) {
    if (rt.sessionUpdatedAt) sessions[agentId] = { sessionId: rt.sessionId ?? null, updatedAt: rt.sessionUpdatedAt };
  }
  const worktrees = state.worktrees[projectId] ?? [];
  const file: HistoryFile = { version: 1, runs, messages, approvals, questions, sessions, worktrees };
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
/**
 * Keeps the feed in memory the same size the file keeps it: the last `MAX_MESSAGES` per project.
 * `addMessage` only ever appended, so a long session grew the array without end and copied it whole
 * on every tool call. Anything trimmed here is still on disk and comes back with the next merge.
 */
export function trimMessagesInMemory(messages: CommMessage[]): CommMessage[] {
  const kept = new Map<string, number>();
  const keep = new Set<string>();
  // Walk backwards so "the last N" is what survives, then rebuild in the original order.
  for (let i = messages.length - 1; i >= 0; i--) {
    const m = messages[i];
    // A message with no project (rare, but the type allows it) is counted in its own bucket.
    const project = m.projectId ?? "";
    const n = kept.get(project) ?? 0;
    if (n >= MAX_MESSAGES) continue;
    kept.set(project, n + 1);
    keep.add(m.id);
  }
  return keep.size === messages.length ? messages : messages.filter(m => keep.has(m.id));
}

/**
 * Drops what a finished project no longer needs in memory: the oldest runs past `MAX_RUNS` and,
 * for every run that already ended, the raw lines past `MAX_RAW_LINES`. A run still going keeps its
 * whole buffer, which is what the live view reads. Everything dropped is on disk already.
 */
export function trimRunsInMemory(runs: Record<string, Run>, projectId: string): Record<string, Run> {
  const mine = Object.values(runs).filter(r => r.projectId === projectId);
  if (mine.length === 0) return runs;
  const finished = mine.filter(r => r.status !== "running").sort((a, b) => (a.endedAt ?? a.startedAt) - (b.endedAt ?? b.startedAt));
  const drop = new Set(finished.slice(0, Math.max(0, finished.length - MAX_RUNS)).map(r => r.id));

  let changed = drop.size > 0;
  const out: Record<string, Run> = {};
  for (const [id, run] of Object.entries(runs)) {
    if (drop.has(id)) continue;
    if (run.projectId === projectId && run.status !== "running" && run.rawLines.length > MAX_RAW_LINES) {
      out[id] = { ...run, rawLines: run.rawLines.slice(-MAX_RAW_LINES) };
      changed = true;
    } else {
      out[id] = run;
    }
  }
  return changed ? out : runs;
}

/** Past this many, `addMessage` trims: often enough to bound memory, rare enough to stay cheap. */
export const TRIM_MESSAGES_AT = MAX_MESSAGES * 2;

export async function loadHistory(projectId: string): Promise<void> {
  const firstLoad = !loadedProjects.has(projectId);
  loadedProjects.add(projectId);
  if (firstLoad) useAppStore.setState(state => ({ historyLoading: { ...state.historyLoading, [projectId]: true } }));
  try {
    await mergeFromDisk(projectId);
  } finally {
    if (firstLoad) useAppStore.setState(state => ({ historyLoading: { ...state.historyLoading, [projectId]: false } }));
  }
}

/** Alias that reads better at call sites that want fresh data from other processes. */
export const syncHistory = loadHistory;

/**
 * The runs a project's file still calls "running", read without touching the store.
 *
 * For the projects startup does not load (a machine with many of them loads only the last): their
 * bookkeeping can wait until you open them, but the processes they left behind cannot — those are
 * editing a repo right now. See `reapAfterCrash`.
 */
export async function runningRunsOnDisk(projectId: string): Promise<Run[]> {
  const parsed = await readFile(projectId);
  return (parsed?.runs ?? []).filter(r => r.status === "running");
}

/** Drop a project's runs, messages and approvals, in memory and on disk. */
export async function clearHistory(projectId: string): Promise<void> {
  loadedProjects.add(projectId);
  useAppStore.setState(state => ({
    runs: Object.fromEntries(Object.entries(state.runs).filter(([, r]) => r.projectId !== projectId)),
    messages: state.messages.filter(m => m.projectId !== projectId),
    approvals: Object.fromEntries(Object.entries(state.approvals).filter(([, a]) => a.projectId !== projectId)),
    questions: Object.fromEntries(Object.entries(state.questions).filter(([, q]) => q.projectId !== projectId)),
  }));
  // Clearing the history is about runs and messages: the worktrees the agents work in stay.
  const file: HistoryFile = {
    version: 1,
    runs: [],
    messages: [],
    approvals: [],
    questions: [],
    worktrees: useAppStore.getState().worktrees[projectId] ?? [],
  };
  const t = timers.get(projectId);
  if (t) { clearTimeout(t); timers.delete(projectId); }
  dirtyProjects.delete(projectId);
  try { await getTransport().writeTextFile(filePath(projectId), JSON.stringify(file)); } catch { /* ignore */ }
}

/** Called when a project is deleted: forget it and empty its file. */
export function forgetHistory(projectId: string): void {
  loadedProjects.delete(projectId);
  worktreesLoaded.delete(projectId);
  dirtyProjects.delete(projectId);
  const t = timers.get(projectId);
  if (t) { clearTimeout(t); timers.delete(projectId); }
  // Gone, not emptied: an empty file per project ever deleted piles up in the folder and the
  // diagnostics count it as data.
  void getTransport().deleteFile(filePath(projectId)).catch(() => {});
}
