// Plugins: Claude Code's package format, which Codex, Copilot, Gemini and others read as well.
//
// A plugin is a folder with a manifest (`.claude-plugin/plugin.json`) and any of:
//   - `skills/<name>/SKILL.md`  — folder skills;
//   - `.mcp.json`, or `mcpServers` in the manifest — MCP servers, `${CLAUDE_PLUGIN_ROOT}` being
//     the plugin's folder;
//   - `commands/*.md` (Claude) or `commands/*.toml` (Gemini) — prompts run by name;
//   - `hooks/` and `agents/` — Claude Code's own, which other agents cannot run.
// ainess turns the first three into its own skills, MCP servers and chat commands, so a plugin
// reaches every agent and every CLI the way anything else in Settings does. Switching it off
// switches all of that off; uninstalling takes all of it away.
//
// A marketplace is a repository whose `.claude-plugin/marketplace.json` lists plugins, each in a
// folder of the same repository or in a repository of its own.
import type { McpServer, Plugin, PluginCommand, Skill } from "@/types";
import { getTransport } from "@/lib/transport";
import { useAppStore } from "@/store";
import { fromMcpServers, stripJsonComments, type FoundServer } from "@/lib/mcp-import";
import { parseSkillMd, type ParsedSkill } from "@/lib/skills-native";

export interface PluginContents {
  name: string;
  version?: string;
  description?: string;
  author?: string;
  skills: Array<{ dir: string; skill: ParsedSkill }>;
  mcp: FoundServer[];
  commands: PluginCommand[];
  hooks: boolean;
  agents: number;
}

const sepOf = (p: string) => (p.includes("\\") ? "\\" : "/");
const join = (base: string, ...parts: string[]) => [base.replace(/[\\/]+$/, ""), ...parts].join(sepOf(base));
const isObject = (v: unknown): v is Record<string, unknown> => !!v && typeof v === "object" && !Array.isArray(v);
const text = (v: unknown): string | undefined => (typeof v === "string" && v.trim() ? v : undefined);

function json(raw: string | null): unknown {
  if (!raw) return null;
  try { return JSON.parse(stripJsonComments(raw)); } catch { return null; }
}

/** A command file: Claude's markdown (frontmatter `description`, the body is the prompt) or Gemini's TOML. */
export function parseCommandFile(fileName: string, source: string): PluginCommand | null {
  const name = fileName.replace(/\.(md|toml)$/i, "");
  if (!name || name === fileName) return null;
  const normalized = source.replace(/\r\n/g, "\n");
  if (/\.toml$/i.test(fileName)) {
    const value = (key: string): string | undefined => {
      const multi = new RegExp(`^${key}\\s*=\\s*"""\\n?([\\s\\S]*?)"""`, "m").exec(normalized);
      if (multi) return multi[1];
      const literal = new RegExp(`^${key}\\s*=\\s*'''\\n?([\\s\\S]*?)'''`, "m").exec(normalized);
      if (literal) return literal[1];
      const single = new RegExp(`^${key}\\s*=\\s*("(?:[^"\\\\]|\\\\.)*")`, "m").exec(normalized);
      if (single) { try { return JSON.parse(single[1]); } catch { return undefined; } }
      return undefined;
    };
    const prompt = value("prompt")?.trim();
    if (!prompt) return null;
    const description = value("description")?.trim();
    return { name, prompt, ...(description ? { description } : {}) };
  }
  const front = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(normalized);
  const body = (front ? front[2] : normalized).trim();
  if (!body) return null;
  const descLine = front ? /^description:\s*(.+)$/m.exec(front[1]) : null;
  const description = descLine ? descLine[1].trim().replace(/^(["'])(.*)\1$/, "$2") : undefined;
  return { name, prompt: body, ...(description ? { description } : {}) };
}

/** `${CLAUDE_PLUGIN_ROOT}` filled in, everywhere a server spells out a path. */
function rooted(server: FoundServer, dir: string): FoundServer {
  const fill = (s: string) => s.replace(/\$\{CLAUDE_PLUGIN_ROOT\}/g, dir);
  return {
    ...server,
    ...(server.command ? { command: fill(server.command) } : {}),
    ...(server.args ? { args: server.args.map(fill) } : {}),
    ...(server.env ? { env: Object.fromEntries(Object.entries(server.env).map(([k, v]) => [k, fill(v)])) } : {}),
    ...(server.url ? { url: fill(server.url) } : {}),
  };
}

/** What a plugin folder holds. Null when there is no manifest that names it. */
export async function readPlugin(dir: string): Promise<PluginContents | null> {
  const transport = getTransport();
  const read = (...parts: string[]) => transport.readFileAbs(join(dir, ...parts)).catch(() => null);
  const manifest = json(await read(".claude-plugin", "plugin.json")) ?? json(await read("plugin.json")) ?? json(await read(".codex-plugin", "plugin.json"));
  if (!isObject(manifest) || !text(manifest.name)) return null;

  const skills: PluginContents["skills"] = [];
  for (const entry of (await transport.listDir(join(dir, "skills")).catch(() => null)) ?? []) {
    if (!entry.isDir || entry.name.startsWith(".")) continue;
    const md = await read("skills", entry.name, "SKILL.md");
    const skill = md ? parseSkillMd(md) : null;
    if (skill) skills.push({ dir: join(dir, "skills", entry.name), skill });
  }

  let mcpSource: unknown = null;
  if (isObject(manifest.mcpServers)) mcpSource = { mcpServers: manifest.mcpServers };
  else if (text(manifest.mcpServers)) mcpSource = json(await transport.readFileAbs(join(dir, ...(manifest.mcpServers as string).replace(/^\.\//, "").split("/"))).catch(() => null));
  else mcpSource = json(await read(".mcp.json"));
  const mcp = fromMcpServers(mcpSource).map(s => rooted(s, dir));

  const commands: PluginCommand[] = [];
  for (const entry of (await transport.listDir(join(dir, "commands")).catch(() => null)) ?? []) {
    if (entry.isDir || !/\.(md|toml)$/i.test(entry.name)) continue;
    const source = await read("commands", entry.name);
    const command = source ? parseCommandFile(entry.name, source) : null;
    if (command && !commands.some(c => c.name === command.name)) commands.push(command);
  }

  const agents = ((await transport.listDir(join(dir, "agents")).catch(() => null)) ?? []).filter(e => !e.isDir && e.name.endsWith(".md")).length;
  const hooks = manifest.hooks !== undefined || (await read("hooks", "hooks.json")) !== null;
  const author = isObject(manifest.author) ? text(manifest.author.name) : text(manifest.author);
  return {
    name: manifest.name as string,
    ...(text(manifest.version) ? { version: manifest.version as string } : {}),
    ...(text(manifest.description) ? { description: manifest.description as string } : {}),
    ...(author ? { author } : {}),
    skills, mcp, commands, hooks, agents,
  };
}

export interface MarketplaceEntry {
  name: string;
  description?: string;
  /** A folder of the marketplace's own repository, or another repository to clone. */
  where: { dir: string } | { repo: string };
}

/** The plugins a marketplace folder lists. Empty when it is not a marketplace. */
export async function readMarketplace(dir: string): Promise<MarketplaceEntry[]> {
  const raw = json(await getTransport().readFileAbs(join(dir, ".claude-plugin", "marketplace.json")).catch(() => null));
  if (!isObject(raw) || !Array.isArray(raw.plugins)) return [];
  const out: MarketplaceEntry[] = [];
  for (const p of raw.plugins) {
    if (!isObject(p) || !text(p.name)) continue;
    const src = p.source;
    let where: MarketplaceEntry["where"] | null = null;
    if (typeof src === "string") {
      const rel = src.replace(/^\.\/?/, "").replace(/\/+$/, "");
      where = { dir: rel ? join(dir, ...rel.split("/")) : dir };
    } else if (isObject(src)) {
      if (src.source === "github" && text(src.repo)) where = { repo: src.repo as string };
      else if ((src.source === "url" || src.source === "git") && text(src.url)) where = { repo: src.url as string };
    }
    if (where) out.push({ name: p.name as string, ...(text(p.description) ? { description: p.description as string } : {}), where });
  }
  return out;
}

export interface DetectedPlugin {
  name: string;
  description?: string;
  version?: string;
  dir: string;
  source: Plugin["source"];
}

/**
 * The plugins Claude already has: the ones synced from the user's Claude.ai account, and the ones
 * installed in Claude Code (`installed_plugins.json`).
 */
export async function detectPlugins(): Promise<DetectedPlugin[]> {
  const transport = getTransport();
  const home = await transport.homeDir().catch(() => null);
  if (!home) return [];
  const root = join(home, ".claude", "plugins");
  const found: DetectedPlugin[] = [];
  const add = async (dir: string, source: Plugin["source"]) => {
    const contents = await readPlugin(dir);
    if (!contents || found.some(f => f.name === contents.name)) return;
    found.push({ name: contents.name, dir, source, ...(contents.description ? { description: contents.description } : {}), ...(contents.version ? { version: contents.version } : {}) });
  };

  for (const bucket of (await transport.listDir(join(root, "synced")).catch(() => null)) ?? []) {
    if (!bucket.isDir || bucket.name.startsWith(".")) continue;
    const manifest = json(await transport.readFileAbs(join(root, "synced", bucket.name, "manifest.json")).catch(() => null));
    const names = isObject(manifest) && Array.isArray(manifest.plugins)
      ? manifest.plugins.filter(isObject).map(p => text(p.name)).filter((n): n is string => !!n)
      : [];
    for (const name of names) await add(join(root, "synced", bucket.name, name), "claude-synced");
  }

  const installed = json(await transport.readFileAbs(join(root, "installed_plugins.json")).catch(() => null));
  if (isObject(installed) && isObject(installed.plugins)) {
    for (const entry of Object.values(installed.plugins)) {
      const copies = Array.isArray(entry) ? entry : [entry];
      const path = copies.filter(isObject).map(c => text(c.installPath)).find(Boolean);
      if (path) await add(path, "claude-code");
    }
  }
  return found;
}

/**
 * Adds a plugin from its folder, or replaces the one already installed under its name: its record,
 * its skills, its MCP servers. Null when the folder is not a plugin.
 */
export async function installPlugin(dir: string, opts: { source: Plugin["source"]; repo?: string; managed?: boolean }): Promise<Plugin | null> {
  const contents = await readPlugin(dir);
  if (!contents) return null;
  const config = useAppStore.getState().config;
  const previous = (config.plugins ?? []).find(p => p.name === contents.name);
  const id = previous?.id ?? crypto.randomUUID();
  const enabled = previous?.enabled ?? true;
  const enabledFor: "all" | string[] = enabled ? "all" : [];

  const plugin: Plugin = {
    id,
    name: contents.name,
    ...(contents.version ? { version: contents.version } : {}),
    ...(contents.description ? { description: contents.description } : {}),
    ...(contents.author ? { author: contents.author } : {}),
    dir,
    source: opts.source,
    ...(opts.repo ? { repo: opts.repo } : {}),
    ...(opts.managed ? { managed: true } : {}),
    enabled,
    commands: contents.commands,
    ...(contents.hooks ? { hooks: true } : {}),
    ...(contents.agents ? { agents: contents.agents } : {}),
  };
  const skills: Skill[] = contents.skills.map(({ dir: skillDir, skill }) => ({
    id: crypto.randomUUID(),
    name: skill.name,
    ...(skill.description ? { description: skill.description } : {}),
    content: skill.body,
    enabledFor,
    dir: skillDir,
    source: "plugin",
    plugin: id,
  }));
  const servers: McpServer[] = contents.mcp.map(s => ({ ...s, id: crypto.randomUUID(), enabledFor, plugin: id }));

  useAppStore.getState().updateConfig({
    plugins: [...(config.plugins ?? []).filter(p => p.id !== id), plugin],
    skills: [...config.skills.filter(s => s.plugin !== id), ...skills],
    mcpServers: [...config.mcpServers.filter(s => s.plugin !== id), ...servers],
  });
  return plugin;
}

/** Takes a plugin and everything it brought away; a folder ainess cloned goes too. */
export async function uninstallPlugin(id: string): Promise<void> {
  const config = useAppStore.getState().config;
  const plugin = (config.plugins ?? []).find(p => p.id === id);
  useAppStore.getState().updateConfig({
    plugins: (config.plugins ?? []).filter(p => p.id !== id),
    skills: config.skills.filter(s => s.plugin !== id),
    mcpServers: config.mcpServers.filter(s => s.plugin !== id),
  });
  // A clone is shared by every plugin installed from the same marketplace: it goes with the last one.
  const shared = plugin?.repo && (config.plugins ?? []).some(p => p.id !== id && p.managed && p.repo === plugin.repo);
  if (plugin?.managed && !shared) await getTransport().removePluginDir(plugin.dir).catch(() => {});
}

/** Switches a plugin and everything it brought on or off together. */
export function setPluginEnabled(id: string, enabled: boolean): void {
  const config = useAppStore.getState().config;
  const enabledFor: "all" | string[] = enabled ? "all" : [];
  useAppStore.getState().updateConfig({
    plugins: (config.plugins ?? []).map(p => (p.id === id ? { ...p, enabled } : p)),
    skills: config.skills.map(s => (s.plugin === id ? { ...s, enabledFor } : s)),
    mcpServers: config.mcpServers.map(s => (s.plugin === id ? { ...s, enabledFor } : s)),
  });
}

/** The commands of the plugins that are on, for the chat's `/` menu. */
export function enabledPluginCommands(plugins: Plugin[] | undefined): Array<PluginCommand & { plugin: string }> {
  return (plugins ?? []).filter(p => p.enabled).flatMap(p => p.commands.map(c => ({ ...c, plugin: p.name })));
}

/** A command's prompt as it goes into the box: the arguments placeholder of either format taken out. */
export function commandPrompt(command: PluginCommand): string {
  return command.prompt.replace(/\$ARGUMENTS|\{\{args\}\}/g, "").trim();
}
