// The MCP servers the user already set up, in the tools they had before ainess.
//
// Each CLI keeps its own list in its own file, in its own spelling of the same few fields. This
// reads them all — Claude Desktop and its installed extensions, Claude Code, Copilot, opencode,
// Gemini, Codex and Antigravity — and hands back one shape, so whoever installs ainess starts with
// what they already have instead of typing it in again. Read only: nothing here writes anywhere.
//
// The parsers are pure and take what the file said; `detectMcpServers` is the only part that
// touches the disk.
import type { McpServer } from "@/types";
import { getTransport } from "@/lib/transport";

export type McpSource =
  | "claude-desktop"
  | "claude-extension"
  | "claude-code"
  | "copilot"
  | "opencode"
  | "gemini"
  | "codex"
  | "antigravity";

/** A server as ainess would keep it, minus what only ainess decides (its id, who gets it). */
export type FoundServer = Omit<McpServer, "id" | "enabledFor">;

export interface DetectedMcp {
  server: FoundServer;
  /** Every tool it was found in: the same server is often set up in two of them. */
  sources: McpSource[];
  /** A project it belongs to, when the tool kept it per project (Claude Code's local scope). */
  project?: string;
}

type Raw = Record<string, unknown>;

const isObject = (v: unknown): v is Raw => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const texts = (v: unknown): string[] | undefined =>
  Array.isArray(v) ? v.filter((x): x is string => typeof x === "string") : undefined;
const textMap = (v: unknown): Record<string, string> | undefined => {
  if (!isObject(v)) return undefined;
  const out: Record<string, string> = {};
  for (const [k, x] of Object.entries(v)) if (typeof x === "string") out[k] = x;
  return out;
};

/** Without the fields that came out empty, so two finds of one server compare equal. */
export function tidy(s: FoundServer): FoundServer {
  const out: FoundServer = { name: s.name, transport: s.transport };
  if (s.transport === "stdio") {
    out.command = s.command;
    if (s.args?.length) out.args = s.args;
    if (s.env && Object.keys(s.env).length) out.env = s.env;
  } else {
    out.url = s.url;
    if (s.headers && Object.keys(s.headers).length) out.headers = s.headers;
  }
  return out;
}

/**
 * One entry of an `mcpServers` map: the shape Claude Desktop and Claude Code write, and the one
 * Copilot, Gemini and Antigravity write close enough to it — a `command` with `args` and `env`, or
 * a URL (`url`, Gemini's `httpUrl`, Antigravity's `serverUrl`) with `headers`.
 *
 * Null for what is not a server or was switched off where it lives (`disabled`, `enabled: false`).
 */
export function fromServerEntry(name: string, raw: unknown): FoundServer | null {
  if (!isObject(raw) || !name.trim()) return null;
  if (raw.disabled === true || raw.enabled === false) return null;
  const command = text(raw.command);
  const url = text(raw.url) ?? text(raw.httpUrl) ?? text(raw.serverUrl);
  if (command) return tidy({ name, transport: "stdio", command, args: texts(raw.args), env: textMap(raw.env) });
  if (url) return tidy({ name, transport: "http", url, headers: textMap(raw.headers) });
  return null;
}

/** Every server of an object with an `mcpServers` map in it. */
export function fromMcpServers(config: unknown): FoundServer[] {
  if (!isObject(config) || !isObject(config.mcpServers)) return [];
  return Object.entries(config.mcpServers)
    .map(([name, raw]) => fromServerEntry(name, raw))
    .filter((s): s is FoundServer => s !== null);
}

/**
 * opencode's own spelling: an `mcp` map whose local servers carry the program and its arguments as
 * one `command` array, and their variables as `environment`.
 */
export function fromOpencode(config: unknown): FoundServer[] {
  if (!isObject(config) || !isObject(config.mcp)) return [];
  const out: FoundServer[] = [];
  for (const [name, raw] of Object.entries(config.mcp)) {
    if (!isObject(raw) || raw.enabled === false) continue;
    if (raw.type === "remote") {
      const url = text(raw.url);
      if (url) out.push(tidy({ name, transport: "http", url, headers: textMap(raw.headers) }));
      continue;
    }
    const command = texts(raw.command) ?? (text(raw.command) ? [raw.command as string] : undefined);
    if (command?.length) {
      out.push(tidy({ name, transport: "stdio", command: command[0], args: command.slice(1), env: textMap(raw.environment) }));
    }
  }
  return out;
}

/**
 * Removes the comments a `.jsonc` file may carry — and trailing commas — without touching the
 * inside of a string, where `//` is just two slashes of a URL.
 */
export function stripJsonComments(source: string): string {
  let out = "";
  let inString = false;
  for (let i = 0; i < source.length; i++) {
    const c = source[i];
    if (inString) {
      out += c;
      if (c === "\\") out += source[++i] ?? "";
      else if (c === '"') inString = false;
      continue;
    }
    if (c === '"') { inString = true; out += c; continue; }
    if (c === "/" && source[i + 1] === "/") {
      while (i < source.length && source[i] !== "\n") i++;
      out += "\n";
      continue;
    }
    if (c === "/" && source[i + 1] === "*") {
      i += 2;
      while (i < source.length && !(source[i] === "*" && source[i + 1] === "/")) i++;
      i++;
      continue;
    }
    out += c;
  }
  return out.replace(/,(\s*[}\]])/g, "$1");
}

/** A TOML value of the few kinds a server table holds: a string, a list of them, a table of them. */
function tomlValue(raw: string): unknown {
  const v = raw.trim();
  if (v.startsWith('"')) {
    try { return JSON.parse(v); } catch { return undefined; }
  }
  if (v.startsWith("'")) return v.slice(1, v.lastIndexOf("'"));
  if (v.startsWith("[")) return splitTomlList(v.slice(1, v.lastIndexOf("]"))).map(tomlValue).filter(x => typeof x === "string");
  if (v.startsWith("{")) {
    const out: Record<string, unknown> = {};
    for (const pair of splitTomlList(v.slice(1, v.lastIndexOf("}")))) {
      const eq = pair.indexOf("=");
      if (eq > 0) out[tomlKey(pair.slice(0, eq))] = tomlValue(pair.slice(eq + 1));
    }
    return out;
  }
  return undefined;
}

/** `a, "b, c", 'd'` into its items, commas inside quotes and brackets left alone. */
function splitTomlList(body: string): string[] {
  const items: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  let current = "";
  for (let i = 0; i < body.length; i++) {
    const c = body[i];
    if (quote) {
      current += c;
      if (c === "\\" && quote === '"') current += body[++i] ?? "";
      else if (c === quote) quote = null;
      continue;
    }
    if (c === '"' || c === "'") quote = c;
    else if (c === "[" || c === "{") depth++;
    else if (c === "]" || c === "}") depth--;
    else if (c === "," && depth === 0) {
      if (current.trim()) items.push(current.trim());
      current = "";
      continue;
    } else if (c === "#" && depth === 0) {
      while (i < body.length && body[i] !== "\n") i++;
      continue;
    }
    current += c;
  }
  if (current.trim()) items.push(current.trim());
  return items;
}

function tomlKey(raw: string): string {
  const k = raw.trim();
  return (k.startsWith('"') && k.endsWith('"')) || (k.startsWith("'") && k.endsWith("'")) ? k.slice(1, -1) : k;
}

/** `mcp_servers.name.env` into its parts, quoted parts kept whole. */
function tomlPath(raw: string): string[] {
  const parts: string[] = [];
  let current = "";
  let quote: string | null = null;
  for (const c of raw.trim()) {
    if (quote) { if (c === quote) quote = null; else current += c; continue; }
    if (c === '"' || c === "'") { quote = c; continue; }
    if (c === ".") { parts.push(current.trim()); current = ""; continue; }
    current += c;
  }
  parts.push(current.trim());
  return parts;
}

/**
 * Codex's servers, out of its `config.toml`: the `[mcp_servers.<name>]` tables and their `env`.
 *
 * ponytail: the subset of TOML these tables use — strings, lists and inline tables of strings,
 * sub-tables — not TOML. A server written with multi-line strings or dotted keys is read wrong or
 * skipped; a real parser is the upgrade if that shows up.
 */
export function fromCodexToml(source: string): FoundServer[] {
  const tables = new Map<string, Raw>();
  let path: string[] = [];
  const lines = source.split(/\r?\n/);
  for (let i = 0; i < lines.length; i++) {
    let line = lines[i].trim();
    if (!line || line.startsWith("#")) continue;
    const header = /^\[([^[\]]+)\]$/.exec(line);
    if (header) { path = tomlPath(header[1]); continue; }
    const eq = line.indexOf("=");
    if (eq <= 0 || path[0] !== "mcp_servers" || path.length < 2) continue;
    // A list or table may go on over several lines: read until its brackets close.
    let value = line.slice(eq + 1);
    const open = (s: string) => (s.match(/[[{]/g)?.length ?? 0) - (s.match(/[\]}]/g)?.length ?? 0);
    while (open(value) > 0 && i + 1 < lines.length) value += "\n" + lines[++i];
    line = line.slice(0, eq);
    const name = path[1];
    const table = tables.get(name) ?? {};
    tables.set(name, table);
    const target = path.length > 2 ? ((table[path[2]] as Raw | undefined) ?? (table[path[2]] = {})) as Raw : table;
    target[tomlKey(line)] = tomlValue(value);
  }
  const out: FoundServer[] = [];
  for (const [name, raw] of tables) {
    if (raw.enabled === false) continue;
    const command = text(raw.command);
    const url = text(raw.url);
    if (command) out.push(tidy({ name, transport: "stdio", command, args: texts(raw.args), env: textMap(raw.env) }));
    else if (url) out.push(tidy({ name, transport: "http", url, headers: textMap(raw.http_headers) ?? textMap(raw.headers) }));
  }
  return out;
}

/** What Claude Desktop keeps about one installed extension, in `extensions-installations.json`. */
interface InstalledExtension {
  id: string;
  manifest?: {
    name?: string;
    display_name?: string;
    server?: { type?: string; mcp_config?: { command?: string; args?: unknown; env?: unknown } };
    user_config?: Record<string, { default?: unknown }>;
  };
}

/**
 * The servers behind Claude Desktop's installed extensions (`.mcpb`, formerly `.dxt`).
 *
 * An extension is a folder with a manifest that says how to start its server, in terms of
 * `${__dirname}` (that folder) and `${user_config.<key>}` (what the user filled in when installing
 * it). Both are resolved here, so what comes out runs on its own. An extension switched off in
 * Claude stays off; one that still needs a value nobody filled in is left out rather than imported
 * broken.
 */
export function fromClaudeExtensions(
  registry: unknown,
  settings: Record<string, unknown>,
  extensionsDir: string,
  home: string,
): FoundServer[] {
  if (!isObject(registry) || !isObject(registry.extensions)) return [];
  const sep = extensionsDir.includes("\\") ? "\\" : "/";
  // The folders the manifest format names besides its own (see the MCPB spec's variables).
  const places: Record<string, string> = {
    HOME: home,
    DESKTOP: `${home}${sep}Desktop`,
    DOCUMENTS: `${home}${sep}Documents`,
    DOWNLOADS: `${home}${sep}Downloads`,
    pathSeparator: sep,
    "/": sep,
  };
  const out: FoundServer[] = [];
  for (const raw of Object.values(registry.extensions)) {
    const ext = raw as InstalledExtension;
    if (!ext?.id || !ext.manifest?.server?.mcp_config?.command) continue;
    const own = settings[ext.id];
    if (isObject(own) && own.isEnabled === false) continue;
    const userConfig = isObject(own) && isObject(own.userConfig) ? own.userConfig : {};
    const dir = `${extensionsDir}${sep}${ext.id}`;

    let unresolved = false;
    const resolve = (value: string) =>
      value
        .replace(/\$\{__dirname\}/g, dir)
        .replace(/\$\{user_config\.([^}]+)\}/g, (_, key: string) => {
          const given = userConfig[key] ?? ext.manifest?.user_config?.[key]?.default;
          if (given === undefined || given === null || typeof given === "object") {
            unresolved = true;
            return "";
          }
          return String(given);
        })
        .replace(/\$\{(HOME|DESKTOP|DOCUMENTS|DOWNLOADS|pathSeparator|\/)\}/g, (_, key: string) => places[key]);

    const config = ext.manifest.server.mcp_config;
    const command = resolve(config.command!);
    let args = (texts(config.args) ?? []).map(resolve);
    const env = Object.fromEntries(Object.entries(textMap(config.env) ?? {}).map(([k, v]) => [k, resolve(v)]));
    if (unresolved) continue;
    // A `uv` server runs the project it is pointed at. Claude starts it from inside the extension's
    // folder; ainess gives no working directory, so the folder goes in as uv's own `--directory`.
    if (ext.manifest.server.type === "uv" && /(^|[\\/])uv(\.exe)?$/i.test(command) && !args.some(a => a.includes(dir))) {
      args = ["--directory", dir, ...args];
    }
    const name = ext.manifest.display_name ?? ext.manifest.name ?? ext.id;
    out.push(tidy({ name, transport: "stdio", command, args, env }));
  }
  return out;
}

/** Same server, whatever it is called: what it runs, or where it is. */
function signature(s: FoundServer): string {
  return s.transport === "stdio" ? `stdio ${s.command} ${(s.args ?? []).join(" ")}` : `http ${s.url}`;
}

/** Folds finds of one server into one entry that lists every tool it was found in. */
export function mergeFinds(finds: Array<{ server: FoundServer; source: McpSource; project?: string }>): DetectedMcp[] {
  const out: DetectedMcp[] = [];
  for (const find of finds) {
    const same = out.find(d =>
      d.server.name.toLowerCase() === find.server.name.toLowerCase() && signature(d.server) === signature(find.server));
    if (same) {
      if (!same.sources.includes(find.source)) same.sources.push(find.source);
      continue;
    }
    out.push({ server: find.server, sources: [find.source], ...(find.project ? { project: find.project } : {}) });
  }
  return out;
}

/** Whether ainess already has this server: under the same name, or running the same thing. */
export function alreadyKnown(servers: McpServer[], found: FoundServer): boolean {
  return servers.some(s =>
    s.name.toLowerCase() === found.name.toLowerCase() || signature(s) === signature(found));
}

/** Where Claude Desktop keeps its files, per system, relative to the home folder. */
const CLAUDE_DESKTOP_DIRS = ["AppData/Roaming/Claude", "Library/Application Support/Claude", ".config/Claude"];

function parseJson(raw: string | null, jsonc = false): unknown {
  if (!raw) return null;
  try { return JSON.parse(jsonc ? stripJsonComments(raw) : raw); } catch { return null; }
}

/**
 * Looks in every place a supported tool keeps its MCP servers and returns what it found, once per
 * server. A file that is missing or unreadable is simply not there: nothing here throws.
 */
export async function detectMcpServers(): Promise<DetectedMcp[]> {
  const transport = getTransport();
  const read = (path: string) => transport.readHomeFile(path).catch(() => null);
  const finds: Array<{ server: FoundServer; source: McpSource; project?: string }> = [];
  const add = (source: McpSource, servers: FoundServer[], project?: string) => {
    for (const server of servers) finds.push({ server, source, ...(project ? { project } : {}) });
  };

  for (const dir of CLAUDE_DESKTOP_DIRS) {
    const desktop = parseJson(await read(`${dir}/claude_desktop_config.json`));
    const registry = parseJson(await read(`${dir}/extensions-installations.json`));
    if (!desktop && !registry) continue;
    add("claude-desktop", fromMcpServers(desktop));
    const home = await transport.homeDir().catch(() => null);
    if (home && isObject(registry) && isObject(registry.extensions)) {
      const settings: Record<string, unknown> = {};
      for (const id of Object.keys(registry.extensions)) {
        settings[id] = parseJson(await read(`${dir}/Claude Extensions Settings/${id}.json`));
      }
      const sep = home.includes("\\") ? "\\" : "/";
      const extensionsDir = [home, ...dir.split("/"), "Claude Extensions"].join(sep);
      add("claude-extension", fromClaudeExtensions(registry, settings, extensionsDir, home));
    }
    break;
  }

  const claudeCode = parseJson(await read(".claude.json"));
  add("claude-code", fromMcpServers(claudeCode));
  if (isObject(claudeCode) && isObject(claudeCode.projects)) {
    for (const [project, entry] of Object.entries(claudeCode.projects)) add("claude-code", fromMcpServers(entry), project);
  }

  add("copilot", fromMcpServers(parseJson(await read(".copilot/mcp-config.json"))));
  add("opencode", fromOpencode(parseJson(await read(".config/opencode/opencode.json"), true)));
  add("opencode", fromOpencode(parseJson(await read(".config/opencode/opencode.jsonc"), true)));
  add("gemini", fromMcpServers(parseJson(await read(".gemini/settings.json"))));
  const codex = await read(".codex/config.toml");
  if (codex) add("codex", fromCodexToml(codex));
  add("antigravity", fromMcpServers(parseJson(await read(".gemini/config/mcp_config.json"))));

  return mergeFinds(finds);
}
