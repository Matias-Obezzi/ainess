// Turns a provider's tool call into one short, readable line ("Edit src/lib/x.ts", "Bash npm test").
// Pure and provider agnostic: every CLI names its tools differently, but the shape of the
// arguments is similar enough (a path, a command, a pattern, a url…) to summarize generically.
import { Bot, FilePen, FileText, Globe, Search, Terminal, Wrench, type LucideIcon } from "lucide-react";

const MAX_COMMAND = 80;
const MAX_PROMPT = 60;
const MAX_QUERY = 60;
const MAX_VALUE = 80;
const MAX_PATH = 80;

/** Keys that carry a filesystem path, in priority order. */
const PATH_KEYS = ["file_path", "path", "filePath", "notebook_path"];
/** Keys that carry a shell command. */
const COMMAND_KEYS = ["command", "cmd"];
/** Keys that carry a search pattern or query. */
const QUERY_KEYS = ["pattern", "query"];
/** Keys that carry a url. */
const URL_KEYS = ["url"];
/** Keys that carry a free-form instruction (Task/subagent tools). */
const PROMPT_KEYS = ["description", "prompt"];

function firstString(input: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const value = input[key];
    if (typeof value === "string" && value.trim() !== "") return value.trim();
  }
  return undefined;
}

/** Collapses whitespace and cuts to `n` chars with a trailing ellipsis. */
function short(text: string, n: number): string {
  const clean = text.replace(/\s+/g, " ").trim();
  return clean.length <= n ? clean : clean.slice(0, n).trimEnd() + "…";
}

/** Same, but keeps the tail (what matters in a long path). */
function shortPath(text: string, n: number): string {
  return text.length <= n ? text : "…" + text.slice(text.length - n);
}

function normalizeSlashes(p: string): string {
  return p.replace(/\\/g, "/").replace(/\/+$/, "");
}

/** Path relative to the workspace when it lives inside it, otherwise the path itself. */
export function relativizePath(rawPath: string, workspaceDir?: string): string {
  const path = normalizeSlashes(rawPath.trim());
  if (workspaceDir) {
    const base = normalizeSlashes(workspaceDir.trim());
    if (base) {
      const isInside = path.toLowerCase() === base.toLowerCase()
        || path.toLowerCase().startsWith(base.toLowerCase() + "/");
      if (isInside) {
        const rest = path.slice(base.length).replace(/^\/+/, "");
        return rest || ".";
      }
    }
  }
  return path;
}

function hostOf(url: string): string {
  try {
    return new URL(url).host || url;
  } catch {
    return url.replace(/^https?:\/\//, "").split("/")[0] || url;
  }
}

/**
 * One line describing a tool call, whatever provider produced it.
 * Falls back to the tool name alone when nothing useful can be extracted.
 */
export function summarizeTool(name: string, input?: unknown, opts?: { workspaceDir?: string }): string {
  const toolName = (name || "herramienta").trim() || "herramienta";
  if (typeof input === "string" && input.trim() !== "") return `${toolName} ${short(input, MAX_VALUE)}`;
  if (!input || typeof input !== "object" || Array.isArray(input)) return toolName;

  const obj = input as Record<string, unknown>;

  const path = firstString(obj, PATH_KEYS);
  if (path) return `${toolName} ${shortPath(relativizePath(path, opts?.workspaceDir), MAX_PATH)}`;

  const command = firstString(obj, COMMAND_KEYS);
  if (command) return `${toolName} ${short(command, MAX_COMMAND)}`;

  const query = firstString(obj, QUERY_KEYS);
  if (query) return `${toolName} "${short(query, MAX_QUERY)}"`;

  const url = firstString(obj, URL_KEYS);
  if (url) return `${toolName} ${short(hostOf(url), MAX_VALUE)}`;

  const prompt = firstString(obj, PROMPT_KEYS);
  if (prompt) return `${toolName} ${short(prompt, MAX_PROMPT)}`;

  for (const value of Object.values(obj)) {
    if (typeof value === "string" && value.trim() !== "") return `${toolName} ${short(value, MAX_VALUE)}`;
  }
  return toolName;
}

/** Icon for a tool, matched loosely on its name so every provider's naming works. */
export function toolIcon(name: string): LucideIcon {
  const n = (name || "").toLowerCase();
  if (/(edit|create|write|replace|patch|apply)/.test(n)) return FilePen;
  if (/(read|view|cat|open|notebook)/.test(n)) return FileText;
  if (/(bash|powershell|shell|terminal|command|exec)/.test(n)) return Terminal;
  if (/(web|fetch|url|http|browser|navigate)/.test(n)) return Globe;
  if (n === "ls" || /(grep|glob|search|find|list)/.test(n)) return Search;
  if (/(task|agent|delegate|subagent|todo)/.test(n)) return Bot;
  return Wrench;
}
