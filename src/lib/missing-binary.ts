// A program that is not installed on this machine, remembered so it is not spawned again.
//
// `gh` is the one this was written for. The repo header asks it for pull requests once a minute
// for as long as the app is open, and on a machine without the GitHub CLI every one of those is a
// process that fails to start and a `[error] [exec] No se pudo ejecutar gh: program not found`
// line in the log — 1440 of them a day, all saying the same thing.
//
// The answer only changes when the machine does, so it is kept until `forgetMissingBinaries()`
// says otherwise: re-detecting from Configuración, or an override that points somewhere new.
import { getTransport } from "@/lib/transport";

export interface ExecResult {
  code: number | null;
  stdout: string;
  stderr: string;
}

const missing = new Set<string>();

/**
 * Narrower on purpose than `MISSING_RE` in git-repo.ts, which reads a program's *output*.
 *
 * This reads a failure to spawn, and what it decides is permanent, so it only matches the ways the
 * OS says "there is no such program". A spawn can also fail for reasons that pass — too many open
 * handles, a folder that went away — and blacklisting `git` because the machine was busy for a
 * second would be a far worse bug than the one this fixes.
 */
const NOT_INSTALLED_RE = /program not found|not recognized|cannot find the (file|path)|no such file or directory/i;

/** True when `exec` threw because the program does not exist, not because it failed to run. */
export function readsAsNotInstalled(e: unknown): boolean {
  return NOT_INSTALLED_RE.test(e instanceof Error ? e.message : String(e));
}

/** Whether `program` is already known not to be here. */
export function isBinaryMissing(program: string): boolean {
  return missing.has(program);
}

/** Forgets every program written off, so the next call tries again. For "detectar de nuevo". */
export function forgetMissingBinaries(): void {
  missing.clear();
}

/**
 * Runs a command, unless we already learned that it is not installed.
 *
 * Null covers every way there is no answer — not installed, failed to spawn, the browser preview —
 * because every caller treats them the same: there is nothing to show for this program.
 */
export async function execUnlessMissing(
  program: string,
  args: string[],
  cwd?: string,
  timeoutSecs?: number,
): Promise<ExecResult | null> {
  if (missing.has(program)) return null;
  try {
    return await getTransport().exec(program, args, cwd, timeoutSecs);
  } catch (e) {
    if (readsAsNotInstalled(e)) missing.add(program);
    return null;
  }
}
