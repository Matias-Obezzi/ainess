// Agents that work in their own git worktree: their own branch, in a folder next to the
// project's, so two of them can implement at the same time without fighting over git's index.
//
// Everything destructive (removing a worktree, merging a branch back) is asked for by the UI and
// refuses to run over uncommitted work. Nothing here ever links `node_modules` to the main repo:
// `git worktree remove` follows the link and deletes the real folder, so dependencies are
// installed for real inside the worktree.
import { getTransport } from "@/lib/transport";
import { translateNow } from "@/i18n/useT";
import type { AgentConfig, AgentWorktree, Project } from "@/types";

/** Plain git reads answer fast; anything slower than this is a hung repo. */
const GIT_TIMEOUT_SECS = 30;
/** `worktree add` copies a whole checkout: a big repo needs room to breathe. */
const ADD_TIMEOUT_SECS = 300;
/** `npm install` on a cold cache takes minutes. */
const INSTALL_TIMEOUT_SECS = 600;

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

// ---- Pure helpers (unit-tested in src/lib/__tests__/worktree.test.ts) ------------------------

/**
 * The agent's name as a folder-safe slug: lowercase, no accents, spaces (and anything else that
 * is not a letter or a digit) turned into single dashes.
 */
export function worktreeSlug(agentName: string): string {
  const slug = agentName
    .normalize("NFD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
  // A name written entirely in a script we cannot transliterate still needs a folder.
  return slug || "agente";
}

/** Folder of an agent's worktree: a sibling of the workspace, `<workspace>-wt-<slug>`. */
export function worktreePath(workspaceDir: string, agentName: string): string {
  const base = workspaceDir.replace(/[\\/]+$/, "");
  return `${base}-wt-${worktreeSlug(agentName)}`;
}

/** Branch an agent works on: `ainess/<slug>`. */
export function worktreeBranch(agentName: string): string {
  return `ainess/${worktreeSlug(agentName)}`;
}

/**
 * `git worktree list --porcelain`: one block per worktree, `worktree <path>` first and
 * `branch refs/heads/<name>` when it has one (a detached or bare checkout has none).
 */
export function parseWorktreeList(stdout: string): { path: string; branch: string | null }[] {
  const out: { path: string; branch: string | null }[] = [];
  let current: { path: string; branch: string | null } | null = null;
  for (const raw of stdout.split(/\r?\n/)) {
    const line = raw.trim();
    if (line.startsWith("worktree ")) {
      if (current) out.push(current);
      current = { path: line.slice("worktree ".length).trim(), branch: null };
      continue;
    }
    if (!current) continue;
    if (line.startsWith("branch ")) {
      current.branch = line.slice("branch ".length).trim().replace(/^refs\/heads\//, "");
    }
  }
  if (current) out.push(current);
  return out;
}

/** Same folder written two ways: git answers with forward slashes, Windows ignores case. */
export function samePath(a: string, b: string): boolean {
  const norm = (p: string) => p.replace(/[\\/]+/g, "/").replace(/\/+$/, "").toLowerCase();
  return norm(a) === norm(b);
}

/** Joins two path fragments keeping the separator the folder already uses. */
function joinPath(dir: string, ...parts: string[]): string {
  const sep = dir.includes("\\") && !dir.includes("/") ? "\\" : "/";
  return [dir.replace(/[\\/]+$/, ""), ...parts].join(sep);
}

// ---- Git plumbing ----------------------------------------------------------------------------

/**
 * Runs a command, turning "could not even start it" into `null` instead of an exception: the
 * Tauri transport rejects, the Node one answers a null exit code with no output at all.
 */
async function tryExec(program: string, args: string[], cwd: string | undefined, timeoutSecs: number): Promise<ExecResult | null> {
  try {
    const result = await getTransport().exec(program, args, cwd, timeoutSecs);
    if (result.code === null && !result.stdout && !result.stderr) return null;
    return result;
  } catch {
    return null;
  }
}

async function git(args: string[], timeoutSecs = GIT_TIMEOUT_SECS): Promise<ExecResult> {
  const result = await tryExec("git", args, undefined, timeoutSecs);
  if (!result) throw new Error(translateNow("worktree.gitMissing"));
  return result;
}

/** The first line of whatever git complained about, for a message a person can read. */
function gitError(result: ExecResult, fallback: string): string {
  const text = `${result.stderr}\n${result.stdout}`.trim();
  const line = text.split(/\r?\n/).find(l => l.trim().length > 0);
  return line ? line.trim() : fallback;
}

/**
 * `npm` is a `.cmd` shim on Windows and cannot always be spawned directly, so a direct call that
 * never starts is retried through the command interpreter.
 */
async function npm(args: string[], cwd: string): Promise<ExecResult> {
  const direct = await tryExec("npm", args, cwd, INSTALL_TIMEOUT_SECS);
  if (direct) return direct;
  const shell = await tryExec("cmd.exe", ["/d", "/s", "/c", "npm", ...args], cwd, INSTALL_TIMEOUT_SECS);
  if (shell) return shell;
  throw new Error(translateNow("worktree.npmMissing"));
}

/** Whether `dir` is inside a git working tree. */
export async function isGitRepo(dir: string): Promise<boolean> {
  const result = await tryExec("git", ["-C", dir, "rev-parse", "--is-inside-work-tree"], undefined, GIT_TIMEOUT_SECS);
  return !!result && result.code === 0 && result.stdout.trim() === "true";
}

/** Uncommitted changes in a folder. `null` when the answer cannot be read (missing folder, no git). */
export async function hasUncommittedChanges(dir: string): Promise<boolean | null> {
  const result = await tryExec("git", ["-C", dir, "status", "--porcelain"], undefined, GIT_TIMEOUT_SECS);
  if (!result || result.code !== 0) return null;
  return result.stdout.trim().length > 0;
}

/** Current branch of a repo, or `HEAD` when it is detached. */
async function currentBranch(dir: string): Promise<string> {
  const result = await tryExec("git", ["-C", dir, "rev-parse", "--abbrev-ref", "HEAD"], undefined, GIT_TIMEOUT_SECS);
  const name = result && result.code === 0 ? result.stdout.trim() : "";
  return name || "HEAD";
}

async function branchExists(dir: string, branch: string): Promise<boolean> {
  const result = await tryExec("git", ["-C", dir, "rev-parse", "--verify", "--quiet", `refs/heads/${branch}`], undefined, GIT_TIMEOUT_SECS);
  return !!result && result.code === 0;
}

/** Whether the worktree already has its dependencies installed. */
async function hasNodeModules(dir: string): Promise<boolean> {
  const marker = await getTransport().readFileAbs(joinPath(dir, "node_modules", ".package-lock.json"));
  if (marker !== null) return true;
  // pnpm and yarn write their own marker; either one means "someone already installed here".
  const yarn = await getTransport().readFileAbs(joinPath(dir, "node_modules", ".yarn-state.yml"));
  if (yarn !== null) return true;
  const pnpm = await getTransport().readFileAbs(joinPath(dir, "node_modules", ".modules.yaml"));
  return pnpm !== null;
}

// ---- The three things the app does with a worktree --------------------------------------------

/** Told step by step so the UI can narrate what is taking so long. */
export type WorktreeStep = (message: string) => void;

/**
 * The agent's worktree, created if it is not there yet. Never touches an existing one that is
 * already prepared; a folder git no longer knows about is re-created from scratch.
 *
 * `known` is the record the app already had for this agent, so a worktree whose dependency
 * install never finished (no `readyAt`) is completed instead of being trusted blindly.
 */
export async function ensureWorktree(
  project: Project,
  agent: AgentConfig,
  onStep?: WorktreeStep,
  known?: AgentWorktree,
): Promise<AgentWorktree> {
  const workspace = project.workspaceDir;
  if (!workspace) throw new Error(translateNow("worktree.noWorkspace"));
  if (!(await isGitRepo(workspace))) {
    throw new Error(translateNow("worktree.notARepoForCreate"));
  }

  const path = known?.path ?? worktreePath(workspace, agent.name);
  const branch = known?.branch ?? worktreeBranch(agent.name);

  const listed = await git(["-C", workspace, "worktree", "list", "--porcelain"]);
  const entry = listed.code === 0
    ? parseWorktreeList(listed.stdout).find(w => samePath(w.path, path))
    : undefined;

  let record: AgentWorktree;
  if (entry) {
    record = {
      agentId: agent.id,
      path,
      branch: entry.branch ?? branch,
      base: known?.base ?? (await currentBranch(workspace)),
      createdAt: known?.createdAt ?? Date.now(),
      readyAt: known?.readyAt,
    };
    // Already registered and already prepared: leave it exactly as it is.
    if (record.readyAt) return record;
  } else {
    onStep?.(translateNow("worktree.creating"));
    const base = await currentBranch(workspace);
    const exists = await branchExists(workspace, branch);
    const args = exists
      ? ["-C", workspace, "worktree", "add", path, branch]
      : ["-C", workspace, "worktree", "add", "-b", branch, path];
    const added = await git(args, ADD_TIMEOUT_SECS);
    if (added.code !== 0) {
      throw new Error(translateNow("worktree.createFailed", { error: gitError(added, translateNow("worktree.addFailed")) }));
    }
    record = { agentId: agent.id, path, branch, base, createdAt: Date.now() };
  }

  // Dependencies: a worktree is a fresh checkout, so `node_modules` is not there. Never link it
  // to the main repo's — `git worktree remove` would follow the link and delete the original.
  const hasPackageJson = (await getTransport().readFileAbs(joinPath(workspace, "package.json"))) !== null;
  if (hasPackageJson && !(await hasNodeModules(record.path))) {
    onStep?.(translateNow("worktree.installing"));
    const installed = await npm(["install"], record.path);
    if (installed.code !== 0) {
      throw new Error(translateNow("worktree.installFailed", { error: gitError(installed, translateNow("worktree.npmInstallFailed")) }));
    }
  }

  return { ...record, readyAt: Date.now() };
}

/**
 * Deletes the worktree folder and, if asked, its branch. Destructive: the caller confirms first.
 * `--force` is what lets git drop a checkout with local changes, which is exactly what the user
 * just agreed to.
 */
export async function removeWorktree(
  project: Project,
  worktree: AgentWorktree,
  opts: { deleteBranch: boolean },
): Promise<{ ok: boolean; message: string }> {
  const workspace = project.workspaceDir;
  const removed = await git(["-C", workspace, "worktree", "remove", "--force", worktree.path], ADD_TIMEOUT_SECS);
  if (removed.code !== 0) {
    // A folder the user already deleted by hand only needs the registration cleaned up.
    const pruned = await git(["-C", workspace, "worktree", "prune"]);
    const stillListed = await git(["-C", workspace, "worktree", "list", "--porcelain"]);
    const present = stillListed.code === 0 && parseWorktreeList(stillListed.stdout).some(w => samePath(w.path, worktree.path));
    if (present || pruned.code !== 0) {
      return { ok: false, message: gitError(removed, translateNow("worktree.removeFailed")) };
    }
  }

  if (opts.deleteBranch) {
    const deleted = await git(["-C", workspace, "branch", "-D", worktree.branch]);
    if (deleted.code !== 0) {
      return { ok: true, message: translateNow("worktree.removedBranchKept", { branch: worktree.branch, error: gitError(deleted, translateNow("worktree.branchDeleteFailed")) }) };
    }
    return { ok: true, message: translateNow("worktree.removedWithBranch", { branch: worktree.branch }) };
  }
  return { ok: true, message: translateNow("worktree.removedBranchStays", { branch: worktree.branch }) };
}

export type MergeStatus = "merged" | "up-to-date" | "dirty-workspace" | "dirty-worktree" | "conflict" | "error";

export interface MergeResult {
  status: MergeStatus;
  message: string;
}

/**
 * Merges the agent's branch into the workspace's current branch. Refuses outright when either
 * side has uncommitted work, and a merge left in conflict is reported, never undone: resolving it
 * by hand in the project's folder is the user's call.
 */
export async function mergeWorktree(project: Project, worktree: AgentWorktree): Promise<MergeResult> {
  const workspace = project.workspaceDir;
  if (!(await isGitRepo(workspace))) {
    return { status: "error", message: translateNow("worktree.notARepo") };
  }

  const workspaceDirty = await hasUncommittedChanges(workspace);
  if (workspaceDirty === null) {
    return { status: "error", message: translateNow("worktree.workspaceUnreadable") };
  }
  if (workspaceDirty) {
    return { status: "dirty-workspace", message: translateNow("worktree.workspaceDirty") };
  }

  const worktreeDirty = await hasUncommittedChanges(worktree.path);
  if (worktreeDirty === null) {
    return { status: "error", message: translateNow("worktree.worktreeUnreadable") };
  }
  if (worktreeDirty) {
    return { status: "dirty-worktree", message: translateNow("worktree.worktreeDirty") };
  }

  const target = await currentBranch(workspace);
  const merged = await git(["-C", workspace, "merge", "--no-ff", worktree.branch], ADD_TIMEOUT_SECS);
  const output = `${merged.stdout}\n${merged.stderr}`;
  if (merged.code === 0) {
    if (/already up[- ]to[- ]date/i.test(output)) {
      return { status: "up-to-date", message: translateNow("worktree.upToDate", { target, branch: worktree.branch }) };
    }
    return { status: "merged", message: translateNow("worktree.merged", { branch: worktree.branch, target }) };
  }
  if (/conflict/i.test(output)) {
    return {
      status: "conflict",
      message: translateNow("worktree.conflict", { branch: worktree.branch }),
    };
  }
  return { status: "error", message: translateNow("worktree.mergeFailed") };
}
