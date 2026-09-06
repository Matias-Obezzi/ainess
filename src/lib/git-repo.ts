// Reads the state of a project's repository: branch, uncommitted changes, ahead/behind, and the
// open pull requests when the GitHub CLI is around. Read-only on purpose: nothing here fetches,
// pulls or writes anything into the user's repo. Parsing lives in `src/lib/git.ts`.
import { getTransport } from "@/lib/transport";
import { parseGitStatus, parsePullRequests, type GitStatus, type PullRequest } from "@/lib/git";

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
async function run(program: string, args: string[], cwd: string): Promise<ExecResult | null> {
  try {
    return await getTransport().exec(program, args, cwd, TIMEOUT_SECS);
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
