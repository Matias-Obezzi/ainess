import { getTransport } from "./transport";
import { log } from "./logger";

export type DiffMode = "working" | "staged" | "head";

export interface DiffResult {
  available: boolean;
  text: string;
  truncated: boolean;
  untracked: string[];
}

const TIMEOUT_SECS = 10;
const MAX_DIFF_LENGTH = 400000;

async function readUntracked(cwd: string): Promise<string[]> {
  const untrackedRes = await getTransport().exec("git", ["ls-files", "--others", "--exclude-standard"], cwd, TIMEOUT_SECS);
  if (untrackedRes.code === 0) {
    return untrackedRes.stdout
      .split(/\r?\n/)
      .filter(Boolean)
      .slice(0, 50);
  }
  return [];
}

function truncateDiff(text: string): { text: string; truncated: boolean } {
  let truncated = false;
  if (text.length > MAX_DIFF_LENGTH) {
    text = text.substring(0, MAX_DIFF_LENGTH);
    truncated = true;
  }
  return { text, truncated };
}

/**
 * Reads the git diff of a workspace.
 * Uses `getTransport().exec` and wraps everything so missing git/workspace is a response, not an error.
 */
export async function readDiff(workspaceDir: string, mode: DiffMode): Promise<DiffResult> {
  const empty: DiffResult = { available: false, text: "", truncated: false, untracked: [] };
  if (!workspaceDir) return empty;

  try {
    const transport = getTransport();
    let text = "";
    let untracked: string[] = [];

    const exec = async (args: string[]) => {
      return transport.exec("git", args, workspaceDir, TIMEOUT_SECS);
    };

    if (mode === "working") {
      let res = await exec(["diff", "HEAD", "-M", "--no-color"]);
      if (res.code !== 0) {
        // Typically happens in a repo with no commits
        res = await exec(["diff", "-M", "--no-color"]);
      }
      if (res.code === 0) {
        text = res.stdout;
      } else {
        return empty;
      }

      untracked = await readUntracked(workspaceDir);
    } else if (mode === "staged") {
      const res = await exec(["diff", "--staged", "-M", "--no-color"]);
      if (res.code === 0) {
        text = res.stdout;
      } else {
        return empty;
      }
    } else if (mode === "head") {
      let res = await exec(["diff", "HEAD^", "HEAD", "-M", "--no-color"]);
      if (res.code !== 0) {
        // Repo might only have one commit
        res = await exec(["show", "--format=", "-M", "--no-color", "HEAD"]);
      }
      if (res.code === 0) {
        text = res.stdout;
      } else {
        return empty;
      }
    }

    const { text: truncatedText, truncated } = truncateDiff(text);

    return {
      available: true,
      text: truncatedText,
      truncated,
      untracked
    };
  } catch (e) {
    log.error("git-diff", `Failed to read diff: ${e}`);
    return empty;
  }
}

/**
 * What one run changed: everything in its workspace that moved since it started.
 *
 * The base is the commit the run opened on (`Run.baseSha`), so this holds whether the agent
 * committed or not, and it reads the agent's own worktree when it has one. It is the workspace
 * since then, not strictly this run's doing — untracked files are whatever is untracked now.
 */
export async function readRunDiff(cwd: string, baseSha: string): Promise<DiffResult> {
  const empty: DiffResult = { available: false, text: "", truncated: false, untracked: [] };
  if (!cwd || !baseSha) return empty;

  try {
    const transport = getTransport();
    const res = await transport.exec("git", ["diff", baseSha, "-M", "--no-color"], cwd, TIMEOUT_SECS);
    if (res.code !== 0) {
      return empty;
    }

    const untracked = await readUntracked(cwd);
    const { text, truncated } = truncateDiff(res.stdout);

    return {
      available: true,
      text,
      truncated,
      untracked
    };
  } catch (e) {
    log.error("git-diff", `Failed to read diff: ${e}`);
    return empty;
  }
}
