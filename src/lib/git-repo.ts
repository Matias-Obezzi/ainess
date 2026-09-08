// The state of a project's repository — branch, uncommitted changes, ahead/behind, open pull
// requests — and the four things the user can ask of it from the header: pull, push, switch branch
// and create one. Reading never writes; the writing ones are only ever called from a button.
// Parsing lives in `src/lib/git.ts`.
import { getTransport } from "@/lib/transport";
import { parseBranches, parseGitStatus, parsePullRequests, type GitStatus, type PullRequest } from "@/lib/git";
import { translateNow } from "@/i18n/useT";

/** Why the pull request list is empty even though the folder is a repo. */
export type PrsUnavailable = "no-gh" | "no-auth" | "no-remote";

export interface RepoState {
  /** false when the folder is not a git repository. */
  isRepo: boolean;
  status: GitStatus | null;
  pullRequests: PullRequest[];
  /** Why there are no PRs: no `gh`, no session, or no GitHub remote. */
  prsUnavailable?: PrsUnavailable;
  fetchedAt: number;
}

/** A hanging git in a huge repo must never hold the UI: every command gets ten seconds. */
const TIMEOUT_SECS = 10;
const PR_LIMIT = 20;
const PR_FIELDS = "number,title,state,isDraft,headRefName,url,updatedAt,statusCheckRollup,reviewDecision";

interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

/** Runs a command and swallows the failure to spawn it: a missing binary is an answer, not an error. */
async function run(program: string, args: string[], cwd: string, timeoutSecs = TIMEOUT_SECS): Promise<ExecResult | null> {
  try {
    return await getTransport().exec(program, args, cwd, timeoutSecs);
  } catch {
    return null;
  }
}

const MISSING_RE = /not found|no such file|not recognized|cannot find|no se pudo ejecutar|executable file/i;
const AUTH_RE = /auth login|authentication|not logged|log in to|gh auth|token|credentials/i;

/** Turns a failed `gh pr list` into the reason the UI shows. */
function prFailureReason(result: ExecResult): PrsUnavailable {
  const text = `${result.stderr}\n${result.stdout}`;
  if (MISSING_RE.test(text)) return "no-gh";
  if (AUTH_RE.test(text)) return "no-auth";
  // Anything else (no GitHub remote, an unreachable API, a repo gh does not recognise) reads the
  // same to the user: there is no PR list to show for this folder.
  return "no-remote";
}

async function readPullRequests(
  workspaceDir: string,
): Promise<{ pullRequests: PullRequest[]; reason?: PrsUnavailable }> {
  const result = await run(
    "gh",
    ["pr", "list", "--json", PR_FIELDS, "--limit", String(PR_LIMIT)],
    workspaceDir,
  );
  // Spawning failed outright: the GitHub CLI is not installed.
  if (!result) return { pullRequests: [], reason: "no-gh" };
  if (result.code !== 0) return { pullRequests: [], reason: prFailureReason(result) };
  return { pullRequests: parsePullRequests(result.stdout) };
}

/**
 * Reads everything the sidebar and the project header show about a repo. Never throws: a folder
 * that is not a repo, a machine without git, or the browser preview (where `exec` answers nothing)
 * all come back as `isRepo: false`.
 */
export async function readRepoState(workspaceDir: string): Promise<RepoState> {
  const fetchedAt = Date.now();
  const notARepo: RepoState = { isRepo: false, status: null, pullRequests: [], fetchedAt };
  if (!workspaceDir) return notARepo;

  const inside = await run("git", ["rev-parse", "--is-inside-work-tree"], workspaceDir);
  if (!inside || inside.code !== 0 || inside.stdout.trim() !== "true") return notARepo;

  const statusResult = await run("git", ["status", "--porcelain=v2", "--branch"], workspaceDir);
  const status = statusResult && statusResult.code === 0 ? parseGitStatus(statusResult.stdout) : null;

  const { pullRequests, reason } = await readPullRequests(workspaceDir);

  return {
    isRepo: true,
    status,
    pullRequests,
    ...(reason ? { prsUnavailable: reason } : {}),
    fetchedAt: Date.now(),
  };
}

/**
 * Just the local half: the branch and the working tree, no `gh` and no network.
 *
 * This is what a filesystem event asks for. Reading the pull requests too would put a call to
 * GitHub behind every file the user saves, and PRs do not change when a file does — those stay on
 * the slow path (`readRepoState`, on a timer).
 */
export async function readRepoStatus(workspaceDir: string): Promise<GitStatus | null> {
  if (!workspaceDir) return null;
  const result = await run("git", ["status", "--porcelain=v2", "--branch"], workspaceDir);
  if (!result || result.code !== 0) return null;
  return parseGitStatus(result.stdout);
}

/** Talking to the remote is slower than reading the working tree: minutes, on a big repo. */
const NETWORK_TIMEOUT_SECS = 180;

export interface GitCommandResult {
  ok: boolean;
  /** What git said, for the toast: its last lines, which is where the reason is. */
  message: string;
}

/** Runs one git command that changes something and turns its output into a sentence. */
async function write(args: string[], cwd: string, timeoutSecs: number): Promise<GitCommandResult> {
  const result = await run("git", args, cwd, timeoutSecs);
  if (!result) return { ok: false, message: translateNow("git.noGit") };
  // git talks on stderr even when it worked ("Everything up-to-date" is the exception).
  const text = (result.stderr.trim() || result.stdout.trim()).split("\n").filter(Boolean);
  return { ok: result.code === 0, message: text.slice(-3).join("\n") };
}

/** Every branch that can be switched to: the local ones, and the remote ones without a local copy. */
export async function listBranches(workspaceDir: string): Promise<{ local: string[]; remote: string[] }> {
  const result = await run("git", ["for-each-ref", "--format=%(refname)", "refs/heads", "refs/remotes"], workspaceDir);
  if (!result || result.code !== 0) return { local: [], remote: [] };
  return parseBranches(result.stdout);
}

/**
 * Brings the branch up to date. `--ff-only` on purpose: a pull that cannot fast-forward stops and
 * says so instead of leaving a merge — or a conflict — in a repo an agent may be working in.
 */
export function pullBranch(workspaceDir: string): Promise<GitCommandResult> {
  return write(["pull", "--ff-only"], workspaceDir, NETWORK_TIMEOUT_SECS);
}

/** Pushes the current branch, creating it on the remote the first time. */
export function pushBranch(workspaceDir: string, status: GitStatus | null): Promise<GitCommandResult> {
  const args = status?.upstream || !status?.branch
    ? ["push"]
    : ["push", "--set-upstream", "origin", status.branch];
  return write(args, workspaceDir, NETWORK_TIMEOUT_SECS);
}

/**
 * Switches branch. A remote one ("origin/feat/x") comes in as its full name and git makes the local
 * branch that tracks it.
 */
export function switchBranch(workspaceDir: string, branch: string, remote: boolean): Promise<GitCommandResult> {
  return write(remote ? ["switch", "--track", branch] : ["switch", branch], workspaceDir, TIMEOUT_SECS);
}

/** Creates a branch from where the repo is now, and moves onto it. */
export function createBranch(workspaceDir: string, branch: string): Promise<GitCommandResult> {
  return write(["switch", "--create", branch], workspaceDir, TIMEOUT_SECS);
}
