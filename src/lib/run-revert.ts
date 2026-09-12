// Putting a folder back the way it was before an agent touched it.
//
// The run already knows where it happened and what the repository looked like when it opened:
// `run.cwd` and `run.baseSha` have been recorded since the diff panel needed them. What was missing
// is the other half of the picture — what was *already* modified when the run started. Without it,
// "undo the run" and "throw away everything uncommitted" are the same command, and they are not the
// same thing: the second one eats work the user did themselves and never mentioned.
//
// So the decision is made here, as data, and it is deliberately conservative. A file the agent
// changed that nobody had touched goes back. A file that was already dirty before the run is left
// exactly where it is and reported, because this cannot tell the user's edit from the agent's
// inside the same file, and quietly choosing one of them is the kind of mistake that is only found
// much later. Nothing is guessed: what cannot be undone safely is named.

import { getTransport } from "./transport";
import { translateNow } from "@/i18n/useT";

/** The state of a working tree at a moment: what git says is not clean. */
export interface TreeState {
  /** Paths with tracked changes, as `git status --porcelain` reports them. */
  modified: string[];
  /** Paths git does not track. */
  untracked: string[];
}

export interface RevertPlan {
  /** Tracked files to bring back to the run's base commit. */
  restore: string[];
  /** Files the agent created that were not there before, to delete. */
  remove: string[];
  /**
   * Files that were already modified when the run started.
   *
   * Left alone and shown to the user: the agent's edit and theirs are in the same file, and there
   * is no way from here to separate them.
   */
  keptDirty: string[];
}

export function isEmptyPlan(plan: RevertPlan): boolean {
  return plan.restore.length === 0 && plan.remove.length === 0;
}

/**
 * What to undo, from the two snapshots and what changed in between.
 *
 * `changed` is what `git diff --name-only <baseSha>` reports now: tracked files that differ from
 * the commit the run opened on. `now` is the working tree as it stands.
 */
export function revertPlan(before: TreeState, now: TreeState, changed: string[]): RevertPlan {
  const wasDirty = new Set(before.modified);
  const wasUntracked = new Set(before.untracked);

  const restore: string[] = [];
  const keptDirty: string[] = [];
  for (const path of unique(changed)) {
    if (wasDirty.has(path)) keptDirty.push(path);
    else restore.push(path);
  }

  // A file that was untracked before the run is the user's: the agent may have written over it, but
  // deleting it would be deleting something that existed first.
  const remove: string[] = [];
  for (const path of unique(now.untracked)) {
    if (wasUntracked.has(path)) keptDirty.push(path);
    else remove.push(path);
  }

  return { restore, remove, keptDirty: unique(keptDirty) };
}

function unique(paths: string[]): string[] {
  return [...new Set(paths.filter(p => p.length > 0))].sort();
}

/**
 * Paths out of `git status --porcelain`.
 *
 * The format is two status characters, a space, then the path — and a rename is `R  old -> new`,
 * where the name that exists on disk is the one on the right. Quoted paths (git quotes anything
 * with a space or a non-ASCII character unless told otherwise) are unwrapped, because the path is
 * going straight back to git as an argument and a literal pair of quotes is not a file.
 */
export function parseStatus(stdout: string): TreeState {
  const modified: string[] = [];
  const untracked: string[] = [];

  for (const line of stdout.split(/\r?\n/)) {
    if (line.length < 4) continue;
    const code = line.slice(0, 2);
    const rest = line.slice(3);
    const arrow = rest.indexOf(" -> ");
    const path = unquote(arrow === -1 ? rest : rest.slice(arrow + 4));
    if (!path) continue;
    if (code === "??") untracked.push(path);
    else modified.push(path);
  }

  return { modified: unique(modified), untracked: unique(untracked) };
}

function unquote(path: string): string {
  const trimmed = path.trim();
  if (trimmed.length >= 2 && trimmed.startsWith('"') && trimmed.endsWith('"')) {
    return trimmed.slice(1, -1).replace(/\\"/g, '"').replace(/\\\\/g, "\\");
  }
  return trimmed;
}

/** Non-empty lines of `git diff --name-only`. */
export function parseNames(stdout: string): string[] {
  return unique(stdout.split(/\r?\n/).map(l => l.trim()));
}

// ---- Reading and applying, which need a repository -------------------------------------------

/** Long enough for a big repository, short enough that a hung git does not hang the dialog. */
const GIT_TIMEOUT_SECS = 30;

/** What git says about a folder right now. Null when it cannot be read at all. */
export async function readTreeState(cwd: string): Promise<TreeState | null> {
  try {
    const res = await getTransport().exec("git", ["status", "--porcelain"], cwd, GIT_TIMEOUT_SECS);
    if (res.code !== 0) return null;
    return parseStatus(res.stdout);
  } catch {
    return null;
  }
}

/** Tracked files that differ from the commit the run opened on. */
async function readChangedSince(cwd: string, baseSha: string): Promise<string[] | null> {
  try {
    const res = await getTransport().exec("git", ["diff", "--name-only", baseSha], cwd, GIT_TIMEOUT_SECS);
    if (res.code !== 0) return null;
    return parseNames(res.stdout);
  } catch {
    return null;
  }
}

/**
 * What undoing this run would do, without doing any of it.
 *
 * Null when the question cannot be answered — no folder, no base commit, not a repository, git
 * unavailable. The caller shows nothing rather than offering an undo it cannot honour.
 */
export async function planRevertOfRun(
  run: { cwd?: string; baseSha?: string; treeAtStart?: TreeState },
): Promise<RevertPlan | null> {
  if (!run.cwd || !run.baseSha) return null;
  const now = await readTreeState(run.cwd);
  if (!now) return null;
  const changed = await readChangedSince(run.cwd, run.baseSha);
  if (!changed) return null;
  // A run recorded before there was a snapshot: everything that moved counts as the agent's, which
  // is what the old runs in a history file will look like. Said here rather than guessed elsewhere.
  const before = run.treeAtStart ?? { modified: [], untracked: [] };
  return revertPlan(before, now, changed);
}

/** Git refuses a command line past a few thousand characters; paths go in batches. */
const BATCH = 40;

export interface RevertResult {
  ok: boolean;
  /** What git said when it refused, for a message a person can read. */
  error?: string;
}

/**
 * Carries out a plan.
 *
 * Restoring and removing are two different git commands and the restore goes first: if the removal
 * fails, the files that matter are already back, and what is left over is a file the user can see
 * and delete. The other order leaves half a revert with no sign of which half.
 */
export async function applyRevert(cwd: string, baseSha: string, plan: RevertPlan): Promise<RevertResult> {
  const transport = getTransport();
  try {
    for (const batch of chunk(plan.restore, BATCH)) {
      const res = await transport.exec("git", ["checkout", baseSha, "--", ...batch], cwd, GIT_TIMEOUT_SECS);
      if (res.code !== 0) return { ok: false, error: firstLine(res.stderr || res.stdout) };
    }
    for (const batch of chunk(plan.remove, BATCH)) {
      // Explicit paths only: `git clean` limited to a pathspec touches nothing else, which is the
      // whole reason it is given one instead of being let loose on the folder.
      const res = await transport.exec("git", ["clean", "-fd", "--", ...batch], cwd, GIT_TIMEOUT_SECS);
      if (res.code !== 0) return { ok: false, error: firstLine(res.stderr || res.stdout) };
    }
    return { ok: true };
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : String(e) };
  }
}

function chunk<T>(items: T[], size: number): T[][] {
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}

function firstLine(text: string): string {
  return text.split(/\r?\n/).find(l => l.trim().length > 0)?.trim() ?? translateNow("revert.gitSaidNothing");
}
