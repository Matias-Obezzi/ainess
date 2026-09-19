// Pure parsing of the git and GitHub CLI output the app reads. Everything here is a string in,
// a plain object out: the commands themselves live in `src/lib/git-repo.ts`.

export interface GitStatus {
  branch: string | null;
  /** Uncommitted changes (staged and unstaged alike). */
  dirty: number;
  ahead: number;
  behind: number;
  /** Name of the tracked remote branch, when there is one. */
  upstream: string | null;
}

/** How the checks of a pull request are doing as a whole. */
export type PullRequestChecks = "passing" | "failing" | "pending" | "none";
/** How the review of a pull request is doing as a whole. */
export type PullRequestReview = "approved" | "changes-requested" | "pending" | "none";

export interface PullRequest {
  number: number;
  title: string;
  state: "open" | "draft" | "merged" | "closed";
  /** Source branch. */
  head: string;
  checks: PullRequestChecks;
  review: PullRequestReview;
  url: string;
  updatedAt: number;
}

/**
 * Parses `git status --porcelain=v2 --branch`. Header lines (`# branch.*`) carry the branch, its
 * upstream and how far ahead/behind it is; every other line is one changed path (renames and
 * untracked files included, one line each).
 */
export function parseGitStatus(stdout: string): GitStatus {
  let branch: string | null = null;
  let upstream: string | null = null;
  let ahead = 0;
  let behind = 0;
  let dirty = 0;

  for (const raw of stdout.split("\n")) {
    const line = raw.replace(/\r$/, "");
    if (!line.trim()) continue;

    if (line.startsWith("#")) {
      const rest = line.slice(1).trim();
      const space = rest.indexOf(" ");
      if (space < 0) continue;
      const key = rest.slice(0, space);
      const value = rest.slice(space + 1).trim();
      if (key === "branch.head") {
        // A detached HEAD reports "(detached)": there is no branch to show.
        branch = value === "(detached)" || value === "" ? null : value;
      } else if (key === "branch.upstream") {
        upstream = value || null;
      } else if (key === "branch.ab") {
        const m = value.match(/^\+(\d+)\s+-(\d+)$/);
        if (m) {
          ahead = parseInt(m[1], 10);
          behind = parseInt(m[2], 10);
        }
      }
      continue;
    }

    dirty++;
  }

  return { branch, dirty, ahead, behind, upstream };
}

/** One entry of `statusCheckRollup`: either a check run or a commit status context. */
interface RollupEntry {
  status?: unknown;
  state?: unknown;
  conclusion?: unknown;
}

const FAILING_RESULTS = new Set([
  "FAILURE",
  "TIMED_OUT",
  "CANCELLED",
  "ACTION_REQUIRED",
  "STARTUP_FAILURE",
  "STALE",
  "ERROR",
]);
const PENDING_RESULTS = new Set(["PENDING", "EXPECTED", "QUEUED", "IN_PROGRESS", "WAITING", "REQUESTED"]);

function str(value: unknown): string {
  return typeof value === "string" ? value.toUpperCase() : "";
}

/** Reduces the check rollup of a pull request to a single word. A failure outranks anything else. */
function rollupChecks(rollup: unknown): PullRequestChecks {
  if (!Array.isArray(rollup) || rollup.length === 0) return "none";
  let pending = false;
  for (const raw of rollup) {
    if (!raw || typeof raw !== "object") continue;
    const entry = raw as RollupEntry;
    // Check runs answer with status + conclusion; status contexts only with state.
    const status = str(entry.status);
    const conclusion = str(entry.conclusion);
    const state = str(entry.state);
    if (FAILING_RESULTS.has(conclusion) || FAILING_RESULTS.has(state)) return "failing";
    if (PENDING_RESULTS.has(state)) pending = true;
    if (status && status !== "COMPLETED") pending = true;
    if (status === "COMPLETED" && !conclusion) pending = true;
  }
  return pending ? "pending" : "passing";
}

function reviewOf(decision: unknown): PullRequestReview {
  switch (str(decision)) {
    case "APPROVED":
      return "approved";
    case "CHANGES_REQUESTED":
      return "changes-requested";
    case "REVIEW_REQUIRED":
      return "pending";
    default:
      return "none";
  }
}

function stateOf(raw: Record<string, unknown>): PullRequest["state"] {
  if (raw.isDraft === true) return "draft";
  switch (str(raw.state)) {
    case "MERGED":
      return "merged";
    case "CLOSED":
      return "closed";
    default:
      return "open";
  }
}

/**
 * Parses the JSON `gh pr list --json …` prints. Tolerates missing fields and invalid JSON: the
 * worst case is an empty list, never a throw.
 */
export function parsePullRequests(json: string): PullRequest[] {
  let data: unknown;
  try {
    data = JSON.parse(json);
  } catch {
    return [];
  }
  if (!Array.isArray(data)) return [];

  const pullRequests: PullRequest[] = [];
  for (const item of data) {
    if (!item || typeof item !== "object") continue;
    const raw = item as Record<string, unknown>;
    const number = typeof raw.number === "number" ? raw.number : NaN;
    if (!Number.isFinite(number)) continue;
    const updatedAt = typeof raw.updatedAt === "string" ? Date.parse(raw.updatedAt) : NaN;
    pullRequests.push({
      number,
      title: typeof raw.title === "string" ? raw.title : "",
      state: stateOf(raw),
      head: typeof raw.headRefName === "string" ? raw.headRefName : "",
      checks: rollupChecks(raw.statusCheckRollup),
      review: reviewOf(raw.reviewDecision),
      url: typeof raw.url === "string" ? raw.url : "",
      updatedAt: Number.isFinite(updatedAt) ? updatedAt : 0,
    });
  }
  return pullRequests;
}

/**
 * Parses `git for-each-ref --format=%(refname) refs/heads refs/remotes`.
 *
 * `origin/HEAD` is a pointer to the default branch, not a branch to switch to, and a remote branch
 * that already has a local copy would be the same line twice in the list: both are dropped here.
 */
export function parseBranches(stdout: string): { local: string[]; remote: string[] } {
  const local: string[] = [];
  const remote: string[] = [];
  for (const raw of stdout.split("\n")) {
    const line = raw.replace(/\r$/, "").trim();
    if (line.startsWith("refs/heads/")) {
      local.push(line.slice("refs/heads/".length));
    } else if (line.startsWith("refs/remotes/")) {
      const name = line.slice("refs/remotes/".length);
      if (!name.endsWith("/HEAD")) remote.push(name);
    }
  }
  // The short name of "origin/feat/x" is "feat/x": only the remote is cut off.
  const short = (name: string) => name.slice(name.indexOf("/") + 1);
  return { local, remote: remote.filter(name => !local.includes(short(name))) };
}

/** One line of `git log`: the commit and the first line of its message. */
export interface GitCommit {
  sha: string;
  subject: string;
}

/**
 * Parses `git log --format=%H %s`, newest commit first.
 *
 * Not `--oneline`: that abbreviates the sha, and what a run keeps (`Run.baseSha`) is the full one
 * `git rev-parse HEAD` printed, so lining the two up would mean guessing how many characters git
 * chose to print today. Anything that is not a sha followed by a subject — a warning, a blank
 * line, whatever else ended up on the stream — is dropped.
 */
export function parseGitLog(stdout: string): GitCommit[] {
  const commits: GitCommit[] = [];
  for (const raw of stdout.split("\n")) {
    const line = raw.replace(/\r$/, "").trim();
    const match = line.match(/^([0-9a-f]{7,40})(?:\s+(.*))?$/i);
    if (!match) continue;
    commits.push({ sha: match[1], subject: (match[2] ?? "").trim() });
  }
  return commits;
}

/**
 * The commits made on top of `baseSha`, newest first — or `null` when the log cannot answer.
 *
 * Takes an already-read log instead of running `git log <baseSha>..HEAD` itself, because the
 * question is asked once per card and a board of twenty cards cannot mean twenty git processes.
 * One log per project is read and every card is answered from it here.
 *
 * "Not known" (`null`) and "nothing was committed" (`[]`) are different answers and stay
 * different: a base that is not in the log at all — rebased away, made on another branch, older
 * than the log reaches — leaves the card saying nothing, never saying the work went uncommitted.
 */
export function commitsAfter(log: GitCommit[], baseSha: string): GitCommit[] | null {
  if (!baseSha) return null;
  const at = log.findIndex(commit => commit.sha === baseSha);
  return at < 0 ? null : log.slice(0, at);
}
