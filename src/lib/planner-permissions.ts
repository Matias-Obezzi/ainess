// What a planner may do on its own: groups of commands the user turns on or off in Settings →
// Permisos, plus their own patterns to allow or to block. Reading, searching and fetching never get
// here — they do not ask. Only Claude asks per call (over ACP), so only Claude's planners obey this.

export type PlannerPresetId = "git" | "look" | "browse" | "test" | "build" | "install" | "edit" | "anything";

export interface PlannerPermissions {
  /** Missing ids keep their default (`PLANNER_PRESETS[i].on`). */
  presets?: Partial<Record<PlannerPresetId, boolean>>;
  /** Commands allowed on top of the presets: `docker ps`, `make *`. */
  allow?: string[];
  /** Commands refused whatever else says yes: `git push`. */
  deny?: string[];
}

interface Preset {
  id: PlannerPresetId;
  /** On unless the user turned it off. */
  on: boolean;
  /** Commands it lets through, matched against each step of a chain. Empty for the ones that are not about commands. */
  commands: RegExp[];
}

export const PLANNER_PRESETS: Preset[] = [
  { id: "git", on: true, commands: [/^git(\s|$)/] },
  {
    id: "look",
    on: true,
    commands: [
      /^[\w.-]+\s+(--version|-v|-V|version)$/,
      /^(npm|pnpm|yarn|bun)\s+(view|info|show|ls|list|outdated|why|--version|-v)(\s|$)/,
      /^(cargo\s+(tree|metadata|search)|pip3?\s+(list|show|freeze)|uv\s+pip\s+(list|show))(\s|$)/,
      /^gh\s+(pr|issue|repo|release|run|workflow)\s+(view|list|status|diff|checks)(\s|$)/,
      /^(which|where|where\.exe)\s/,
    ],
  },
  {
    // Moving around and reading through the shell: `cd x && git pull` is a chain a planner writes
    // without thinking, and refusing all of it for the `cd` was the rule at its most rigid.
    id: "browse",
    on: true,
    commands: [
      /^(cd|pushd|popd|pwd|ls|dir|tree|cat|type|echo|head|tail|grep|rg|wc|stat|file|du)(\s|$)/,
      /^sed\s+-n(\s|$)/,
      /^find\s(?!.*\s-(exec|execdir|delete|ok)\b)/,
      /^(Get-ChildItem|Get-Content|Get-Location|Set-Location|Select-String)(\s|$)/i,
    ],
  },
  {
    id: "test",
    on: true,
    commands: [
      /^(npm|pnpm|yarn|bun)\s+(test|run\s+test[\w:-]*)(\s|$)/,
      /^npx\s+(vitest|jest|playwright\s+test)(\s|$)/,
      /^(cargo\s+test|go\s+test|pytest|python3?\s+-m\s+pytest|dotnet\s+test)(\s|$)/,
    ],
  },
  {
    id: "build",
    on: true,
    commands: [
      /^(npm|pnpm|yarn|bun)\s+run\s+(build|lint|typecheck|check)[\w:-]*(\s|$)/,
      /^npx\s+(tsc|eslint)(\s|$)/,
      /^(cargo\s+(build|check|clippy)|go\s+(build|vet)|dotnet\s+build|make)(\s|$)/,
    ],
  },
  {
    id: "install",
    on: true,
    commands: [
      /^(npm\s+(install|i|ci|add)|pnpm\s+(install|i|add)|yarn(\s+(install|add))?|bun\s+(install|i|add))(\s|$)/,
      /^(pip3?\s+install|uv\s+(pip\s+install|add|sync)|cargo\s+add)(\s|$)/,
    ],
  },
  // Not commands: editing files outside `.ainess/`, and any command at all.
  { id: "edit", on: false, commands: [] },
  { id: "anything", on: false, commands: [] },
];

/** What a command may be piped into without being allowed itself: filters, which print and change nothing. */
const FILTER = /^(head|tail|grep|rg|wc|sort|uniq|cut|jq|findstr)(\s|$)/;

function isOn(perms: PlannerPermissions | undefined, preset: Preset): boolean {
  return perms?.presets?.[preset.id] ?? preset.on;
}

/** `git push` matches `git push origin main`; `*` stands for anything. Case does not matter. */
export function patternMatches(pattern: string, command: string): boolean {
  const p = pattern.trim();
  if (!p) return false;
  const body = p.split("*").map(part => part.replace(/[.+?^${}()|[\]\\]/g, "\\$&")).join(".*");
  return new RegExp(`^${body}${p.endsWith("*") ? "" : "(\\s|$)"}`, "i").test(command.trim());
}

/** A tool call a planner may make on its own, by the presets and patterns in `perms`. */
export function plannerMayUse(call: { kind?: string | null; rawInput?: unknown }, perms?: PlannerPermissions): boolean {
  const input = (call.rawInput && typeof call.rawInput === "object" ? call.rawInput : {}) as Record<string, unknown>;
  const on = (id: PlannerPresetId) => isOn(perms, PLANNER_PRESETS.find(p => p.id === id)!);
  if (call.kind === "execute") {
    const command = typeof input.command === "string" ? input.command : "";
    // `git status && npm test`: every command of the chain has to pass, and whatever it is piped
    // into has to be a filter or pass on its own — `npm ls | sh` is not looking at anything.
    const steps = command.split(/&&|\|\||;/).map(s => s.trim()).filter(Boolean);
    const parts = steps.flatMap(step => step.split("|").map(s => s.trim()).filter(Boolean));
    if (parts.length === 0) return false;
    if (parts.some(part => (perms?.deny ?? []).some(p => patternMatches(p, part)))) return false;
    if (on("anything")) return true;
    // A redirect writes a file, whatever was run. Sending errors away is not one.
    if (/>/.test(command.replace(/2>&1|2>\s*(\/dev\/null|\$null|nul)\b/gi, ""))) return false;
    const allowed = (part: string) =>
      PLANNER_PRESETS.some(p => isOn(perms, p) && p.commands.some(re => re.test(part))) ||
      (perms?.allow ?? []).some(p => patternMatches(p, part));
    return steps.every(step => {
      const [first, ...rest] = step.split("|").map(s => s.trim());
      return allowed(first) && rest.every(s => FILTER.test(s) || allowed(s));
    });
  }
  if (call.kind === "edit" || call.kind === "delete" || call.kind === "move") {
    const path = [input.file_path, input.path, input.notebook_path].find(p => typeof p === "string") as string | undefined;
    if (!path) return false;
    return /(^|[\\/])\.ainess[\\/]/.test(path) || on("edit") || on("anything");
  }
  return true;
}
