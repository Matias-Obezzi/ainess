// Desktop extensions: the `.mcpb` format (formerly `.dxt`) Claude Desktop installs.
//
// An extension is a folder with a `manifest.json` that says how to start the MCP server inside it,
// in terms of `${__dirname}` (that folder), `${user_config.<key>}` (what the user filled in when
// installing it) and a few system folders. This turns a manifest and those values into an MCP server
// ainess can run and hand to every CLI. Pure: reading and unpacking are the caller's.
import type { FoundServer } from "@/lib/mcp-import";
import type { McpExtension } from "@/types";

export type ExtensionValue = string | number | boolean | string[];

export interface UserConfigField {
  key: string;
  type: "string" | "number" | "boolean" | "directory" | "file";
  title: string;
  description?: string;
  required: boolean;
  /** A secret: shown as a password field, and never echoed back. */
  sensitive: boolean;
  /** Several directories or files, which a whole-argument placeholder expands into several args. */
  multiple: boolean;
  default?: ExtensionValue;
  min?: number;
  max?: number;
}

interface McpConfig {
  command?: string;
  args?: unknown;
  env?: unknown;
}

export interface McpbManifest {
  name: string;
  displayName: string;
  version?: string;
  description?: string;
  author?: string;
  icon?: string;
  serverType?: string;
  mcpConfig: McpConfig & { platform_overrides?: Record<string, McpConfig> };
  fields: UserConfigField[];
  /** The systems it says it runs on (`win32`, `darwin`, `linux`); empty means any. */
  platforms: string[];
}

const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);
const FIELD_TYPES = new Set(["string", "number", "boolean", "directory", "file"]);

/** The parts of a manifest ainess uses. Null for anything that is not a manifest with a server. */
export function parseManifest(source: unknown): McpbManifest | null {
  let raw: unknown = source;
  if (typeof source === "string") {
    try { raw = JSON.parse(source); } catch { return null; }
  }
  if (!isObject(raw)) return null;
  const name = text(raw.name);
  const server = isObject(raw.server) ? raw.server : null;
  const mcpConfig = server && isObject(server.mcp_config) ? (server.mcp_config as McpbManifest["mcpConfig"]) : null;
  if (!name || !mcpConfig || !text(mcpConfig.command)) return null;

  const fields: UserConfigField[] = [];
  if (isObject(raw.user_config)) {
    for (const [key, f] of Object.entries(raw.user_config)) {
      if (!isObject(f)) continue;
      const type = FIELD_TYPES.has(f.type as string) ? (f.type as UserConfigField["type"]) : "string";
      const def = f.default;
      fields.push({
        key,
        type,
        title: text(f.title) ?? key,
        description: text(f.description),
        required: f.required === true,
        sensitive: f.sensitive === true,
        multiple: f.multiple === true,
        ...(def !== undefined && def !== null && (typeof def !== "object" || Array.isArray(def)) ? { default: def as ExtensionValue } : {}),
        ...(typeof f.min === "number" ? { min: f.min } : {}),
        ...(typeof f.max === "number" ? { max: f.max } : {}),
      });
    }
  }
  const author = isObject(raw.author) ? text(raw.author.name) : text(raw.author);
  const compatibility = isObject(raw.compatibility) ? raw.compatibility : {};
  return {
    name,
    displayName: text(raw.display_name) ?? name,
    version: text(raw.version),
    description: text(raw.description),
    author,
    icon: text(raw.icon),
    serverType: server ? text(server.type) : undefined,
    mcpConfig,
    fields,
    platforms: Array.isArray(compatibility.platforms) ? compatibility.platforms.filter((p): p is string => typeof p === "string") : [],
  };
}

/** The values a manifest asks for that are required, have no default, and were not given. */
export function missingValues(manifest: McpbManifest, values: Record<string, unknown>): UserConfigField[] {
  return manifest.fields.filter(f => {
    if (!f.required) return false;
    const v = values[f.key] ?? f.default;
    return v === undefined || v === null || v === "" || (Array.isArray(v) && v.length === 0);
  });
}

/** `win32`, `darwin` or `linux`, guessed from the home folder the way the rest of the app does. */
export function platformOf(home: string): string {
  if (home.includes("\\") || /^[A-Za-z]:/.test(home)) return "win32";
  return home.startsWith("/Users/") ? "darwin" : "linux";
}

export interface ResolveInput {
  manifest: McpbManifest;
  /** The folder the extension is unpacked in, absolute. */
  dir: string;
  home: string;
  values: Record<string, unknown>;
}

/**
 * The MCP server an extension runs, with every placeholder filled in. Null when a value it needs is
 * still missing: imported broken, it would only fail later and somewhere less clear.
 */
export function serverFromManifest({ manifest, dir, home, values }: ResolveInput): FoundServer | null {
  const sep = home.includes("\\") ? "\\" : "/";
  const platform = platformOf(home);
  const override = manifest.mcpConfig.platform_overrides?.[platform];
  const config: McpConfig = { ...manifest.mcpConfig, ...(isObject(override) ? override : {}) };

  const places: Record<string, string> = {
    __dirname: dir,
    HOME: home,
    DESKTOP: `${home}${sep}Desktop`,
    DOCUMENTS: `${home}${sep}Documents`,
    DOWNLOADS: `${home}${sep}Downloads`,
    pathSeparator: sep,
    "/": sep,
  };
  const valueOf = (key: string): ExtensionValue | undefined => {
    const field = manifest.fields.find(f => f.key === key);
    const v = values[key] ?? field?.default;
    if (v === undefined || v === null || v === "") return undefined;
    return typeof v === "object" && !Array.isArray(v) ? undefined : (v as ExtensionValue);
  };

  let missing = false;
  const fill = (s: string): string =>
    s.replace(/\$\{([^}]+)\}/g, (whole, key: string) => {
      if (key.startsWith("user_config.")) {
        const v = valueOf(key.slice("user_config.".length));
        if (v === undefined) { missing = true; return ""; }
        return Array.isArray(v) ? v.join(",") : String(v);
      }
      return places[key] ?? whole;
    });

  const command = fill(text(config.command) ?? "");
  const args: string[] = [];
  for (const a of Array.isArray(config.args) ? config.args : []) {
    if (typeof a !== "string") continue;
    // A list value standing as a whole argument is several arguments, one per item (the spec's rule
    // for directories and files the user picked more than one of).
    const whole = /^\$\{user_config\.([^}]+)\}$/.exec(a);
    const v = whole ? valueOf(whole[1]) : undefined;
    if (Array.isArray(v)) { args.push(...v); continue; }
    args.push(fill(a));
  }
  const env: Record<string, string> = {};
  if (isObject(config.env)) {
    for (const [k, v] of Object.entries(config.env)) if (typeof v === "string") env[k] = fill(v);
  }
  if (missing || !command) return null;

  // A `uv` server runs the project it is pointed at. Claude starts it from inside the extension's
  // folder; ainess gives no working directory, so the folder goes in as uv's own `--directory`.
  if (manifest.serverType === "uv" && /(^|[\\/])uv(\.exe)?$/i.test(command) && !args.some(a => a.includes(dir))) {
    args.unshift("--directory", dir);
  }
  return {
    name: manifest.displayName,
    transport: "stdio",
    command,
    ...(args.length ? { args } : {}),
    ...(Object.keys(env).length ? { env } : {}),
  };
}

/** What a server keeps about the extension it came from. */
export function extensionRecord(manifest: McpbManifest, dir: string, values: Record<string, ExtensionValue>, external = false): McpExtension {
  return {
    id: manifest.name,
    dir,
    ...(manifest.version ? { version: manifest.version } : {}),
    ...(Object.keys(values).length ? { config: values } : {}),
    ...(external ? { external: true } : {}),
  };
}

/** Whether the extension says it runs on this system. */
export function runsHere(manifest: McpbManifest, home: string): boolean {
  return manifest.platforms.length === 0 || manifest.platforms.includes(platformOf(home));
}
