// The commands a project runs to decide, for itself, whether an agent's work holds up.
//
// Until now a task moved forward because the agent's process exited zero. Nothing else was checked,
// so "done" meant "the CLI came back", and finding out otherwise was the user's job the next
// morning. These are the project saying what done means: its own tests, its own typecheck, run by
// the app in the agent's working folder before the card is allowed to move.
//
// Splitting the text is a module of its own because of what it guards. A command typed by a person
// never reaches a shell here: `transport.exec` takes a program and its arguments apart, and this is
// what takes them apart. Anything that only means something to a shell — `&&`, a pipe, a
// redirection — is refused rather than escaped, because the app spawns whichever shell the machine
// offers and they do not agree on quoting. Two commands is the answer to wanting two commands.
import { getTransport } from "./transport";
import type { VerifyCommand } from "@/types";

/** Generous, because a test suite is allowed to be slow; finite, because a hung one is not. */
export const VERIFY_TIMEOUT_SECS = 300;

/** Only meaningful to a shell, and this never reaches one. */
const SHELL_OPERATORS = ["&&", "||", "|", ">", ">>", "<", ";", "&"];

export interface SplitResult {
  tokens: string[];
  /** Set when the text cannot be run as written. The UI shows it instead of accepting the command. */
  problem?: "empty" | "shell-operator" | "unbalanced-quote";
  /** Which operator was found, for a message that can name it. */
  operator?: string;
}

/**
 * A command line as a program and its arguments.
 *
 * Double quotes group, because that is what someone typing a path with a space in it reaches for.
 * Single quotes are left alone: on Windows they are an ordinary character and a project path is
 * more likely to contain one than to mean one.
 */
export function splitCommandLine(text: string): SplitResult {
  const tokens: string[] = [];
  let current = "";
  let quoted = false;
  let started = false;

  for (const ch of text) {
    if (ch === '"') {
      quoted = !quoted;
      started = true;
      continue;
    }
    if (!quoted && /\s/.test(ch)) {
      if (started) tokens.push(current);
      current = "";
      started = false;
      continue;
    }
    current += ch;
    started = true;
  }
  if (started) tokens.push(current);

  if (quoted) return { tokens, problem: "unbalanced-quote" };
  if (tokens.length === 0) return { tokens, problem: "empty" };

  const operator = tokens.find(t => SHELL_OPERATORS.includes(t));
  if (operator) return { tokens, problem: "shell-operator", operator };

  return { tokens };
}

/** What one command did. `code` is null when it could not be started at all. */
export interface VerifyRun {
  label: string;
  code: number | null;
  output: string;
  /** It never finished on its own. */
  timedOut?: boolean;
}

export interface Verdict {
  ok: boolean;
  /** The one that failed. Verification stops at the first: there is no point testing what will not build. */
  failed?: VerifyRun;
}

export function verdictOf(runs: VerifyRun[]): Verdict {
  const failed = runs.find(r => r.code !== 0);
  return failed ? { ok: false, failed } : { ok: true };
}

/** Trimmed to what a person will read on a card, from the end, where the failure is. */
export function briefOutput(text: string, max = 2000): string {
  const trimmed = text.trim();
  return trimmed.length <= max ? trimmed : "…" + trimmed.slice(-max);
}

/**
 * Runs one command, and retries through the command interpreter if it could not be started.
 *
 * On Windows `npm`, `npx` and anything else installed by npm is a `.cmd` shim, which `CreateProcess`
 * will not resolve from a bare name — so the most obvious verification command anyone would write
 * fails before it runs. The retry passes the same arguments, still separate, as arguments to
 * `cmd.exe`: nothing is concatenated and nothing is quoted by us. Same shape as `worktree.ts`.
 */
export async function runVerifyCommand(command: VerifyCommand, cwd: string): Promise<VerifyRun> {
  const transport = getTransport();
  const label = command.label;

  const attempt = async (program: string, args: string[]): Promise<VerifyRun | null> => {
    try {
      const result = await transport.exec(program, args, cwd, VERIFY_TIMEOUT_SECS);
      // The transport answers a null code with nothing at all when the process never started.
      if (result.code === null && !result.stdout && !result.stderr) return null;
      return { label, code: result.code, output: `${result.stdout}\n${result.stderr}`.trim() };
    } catch {
      return null;
    }
  };

  const direct = await attempt(command.program, command.args);
  if (direct) return direct;

  const shimmed = await attempt("cmd.exe", ["/d", "/s", "/c", command.program, ...command.args]);
  if (shimmed) return shimmed;

  return { label, code: null, output: `No se pudo ejecutar "${command.program}".` };
}

/**
 * Every command in order, stopping at the first failure.
 *
 * In order and not in parallel on purpose: they are a project's own steps and they tend to depend on
 * each other — a build before a test, an install before a build — and running four suites at once on
 * the machine the user is also using is its own kind of slow.
 */
export async function runVerification(commands: VerifyCommand[], cwd: string): Promise<Verdict> {
  const runs: VerifyRun[] = [];
  for (const command of commands) {
    const result = await runVerifyCommand(command, cwd);
    runs.push(result);
    if (result.code !== 0) break;
  }
  return verdictOf(runs);
}
