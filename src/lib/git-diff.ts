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

      const untrackedRes = await exec(["ls-files", "--others", "--exclude-standard"]);
      if (untrackedRes.code === 0) {
        untracked = untrackedRes.stdout
          .split(/\r?\n/)
          .filter(Boolean)
          .slice(0, 50);
      }
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

    let truncated = false;
    if (text.length > MAX_DIFF_LENGTH) {
      text = text.substring(0, MAX_DIFF_LENGTH);
      truncated = true;
    }

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
