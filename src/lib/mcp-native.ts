// Keeping each CLI's own MCP list in step with ainess's.
//
// The other half of `mcp-import`: that one reads what each tool already has, this one writes what
// ainess has into each tool, so the servers are there whether a CLI is started by ainess or by hand.
//
// It writes into files that belong to the user, so it keeps to three rules:
//   - only servers enabled for every agent go out: one meant for a single agent stays per run, or it
//     would reach every other agent of that CLI and the CLI used on its own;
//   - only names it wrote itself are ever changed or removed (`config.mcpOwned`). A server already
//     in the tool under the same name is the user's, and is left as it is;
//   - only CLIs that are installed: no config is created for a tool that is not there.
import type { AppConfig, McpServer } from "@/types";
import { getTransport } from "@/lib/transport";
import { useAppStore } from "@/store";
import { fromCodexToml, fromMcpServers, fromOpencode, stripJsonComments, tidy, type FoundServer } from "@/lib/mcp-import";
import { redactSecrets } from "@/lib/mcp-sync";
import { resolveClaudeEngine } from "@/lib/claude-auth";
import { cameFromClaude } from "@/lib/skills-native";
import { log } from "@/lib/logger";

export type NativeTarget = "claude-code" | "copilot" | "gemini" | "codex" | "opencode" | "antigravity";

export const NATIVE_TARGETS: NativeTarget[] = ["claude-code", "copilot", "gemini", "codex", "opencode", "antigravity"];

export interface SyncPlan {
  add: FoundServer[];
  update: FoundServer[];
  remove: string[];
  /** Wanted, but the tool already has one by that name that ainess did not write: the user's. */
  skipped: string[];
  /** What ainess owns in the tool once the plan is applied. */
  owned: string[];
}

/** Whether two servers would run the same thing the same way. */
const same = (a: FoundServer, b: FoundServer) => JSON.stringify(tidy(a)) === JSON.stringify(tidy(b));

/**
 * What to do to one tool, given what ainess wants there, what the tool has, and what of that ainess
 * wrote. Pure: the writers below only carry it out. A server that is already there as wanted is not
 * touched — a sync on every start would otherwise rewrite every one of them.
 */
export function planSync(desired: FoundServer[], existing: FoundServer[], owned: string[]): SyncPlan {
  const has = new Map(existing.map(s => [s.name, s]));
  const mine = new Set(owned);
  const wanted = new Set(desired.map(s => s.name));
  const plan: SyncPlan = { add: [], update: [], remove: [], skipped: [], owned: [] };
  for (const server of desired) {
    const current = has.get(server.name);
    if (!current) { plan.add.push(server); plan.owned.push(server.name); }
    else if (mine.has(server.name)) {
      if (!same(current, server)) plan.update.push(server);
      plan.owned.push(server.name);
    } else plan.skipped.push(server.name);
  }
  for (const name of mine) {
    if (!wanted.has(name) && has.has(name)) plan.remove.push(name);
  }
  return plan;
}

/** The servers that go into every tool: the ones meant for every agent. */
export function sharedServers(servers: McpServer[]): FoundServer[] {
  return servers.filter(s => s.enabledFor === "all").map(({ id: _id, enabledFor: _for, ...rest }) => tidy(rest));
}

// ---- Each tool's own spelling ------------------------------------------------------------------

/** Claude Code's and Copilot's entry: the `mcpServers` shape with a `type`. */
export function claudeEntry(s: FoundServer): Record<string, unknown> {
  return s.transport === "stdio"
    ? { type: "stdio", command: s.command, args: s.args ?? [], ...(s.env ? { env: s.env } : {}) }
    : { type: "http", url: s.url, ...(s.headers ? { headers: s.headers } : {}) };
}

/** Copilot wants the tools filter spelled out; `*` is every tool the server offers. */
export function copilotEntry(s: FoundServer): Record<string, unknown> {
  return s.transport === "stdio"
    ? { type: "local", command: s.command, args: s.args ?? [], ...(s.env ? { env: s.env } : {}), tools: ["*"] }
    : { type: "http", url: s.url, ...(s.headers ? { headers: s.headers } : {}), tools: ["*"] };
}

/** Gemini's: no `type`, and a streamable HTTP server goes under `httpUrl`. */
export function geminiEntry(s: FoundServer): Record<string, unknown> {
  return s.transport === "stdio"
    ? { command: s.command, args: s.args ?? [], ...(s.env ? { env: s.env } : {}) }
    : { httpUrl: s.url, ...(s.headers ? { headers: s.headers } : {}) };
}

/** opencode's: the program and its arguments in one list, the variables as `environment`. */
export function opencodeEntry(s: FoundServer): Record<string, unknown> {
  return s.transport === "stdio"
    ? { type: "local", command: [s.command ?? "", ...(s.args ?? [])], ...(s.env ? { environment: s.env } : {}), enabled: true }
    : { type: "remote", url: s.url, ...(s.headers ? { headers: s.headers } : {}), enabled: true };
}

const CODEX_BEGIN = "# >>> ainess: MCP servers managed by ainess. Edits inside this block are replaced. >>>";
const CODEX_END = "# <<< ainess <<<";

/** A TOML key: bare when it can be, quoted otherwise. */
const tomlKey = (k: string) => (/^[A-Za-z0-9_-]+$/.test(k) ? k : JSON.stringify(k));
/** JSON's string escapes are TOML's basic-string escapes. */
const tomlString = (v: string) => JSON.stringify(v);

/**
 * Codex's `config.toml` with ainess's servers in a block of its own, and everything else as it was.
 * Names the user defined outside the block are theirs and stay out of it.
 */
export function withCodexBlock(source: string, servers: FoundServer[]): { text: string; skipped: string[]; owned: string[] } {
  const start = source.indexOf(CODEX_BEGIN);
  const end = source.indexOf(CODEX_END);
  const outside = start >= 0 && end > start ? source.slice(0, start) + source.slice(end + CODEX_END.length) : source;
  const theirs = new Set(fromCodexToml(outside).map(s => s.name));
  const skipped = servers.filter(s => theirs.has(s.name)).map(s => s.name);
  const mine = servers.filter(s => !theirs.has(s.name));
  const lines: string[] = [];
  for (const s of mine) {
    lines.push(`[mcp_servers.${tomlKey(s.name)}]`);
    if (s.transport === "stdio") {
      lines.push(`command = ${tomlString(s.command ?? "")}`);
      lines.push(`args = [${(s.args ?? []).map(tomlString).join(", ")}]`);
      if (s.env) lines.push(`env = { ${Object.entries(s.env).map(([k, v]) => `${tomlKey(k)} = ${tomlString(v)}`).join(", ")} }`);
    } else {
      lines.push(`url = ${tomlString(s.url ?? "")}`);
      if (s.headers) lines.push(`http_headers = { ${Object.entries(s.headers).map(([k, v]) => `${tomlKey(k)} = ${tomlString(v)}`).join(", ")} }`);
    }
    lines.push("");
  }
  const base = outside.replace(/\s+$/, "");
  const block = mine.length ? `${CODEX_BEGIN}\n${lines.join("\n").trimEnd()}\n${CODEX_END}\n` : "";
  const text = block ? `${base ? `${base}\n\n` : ""}${block}` : (base ? `${base}\n` : "");
  return { text, skipped, owned: mine.map(s => s.name) };
}

/**
 * One key of a JSON config file replaced by `apply`, the rest untouched. Null when the file cannot be
 * written back without losing something: it does not parse, or it carries comments that a rewrite
 * would drop.
 */
export function editJsonFile(source: string | null, apply: (config: Record<string, unknown>) => void): string | null {
  let config: Record<string, unknown> = {};
  if (source && source.trim()) {
    const stripped = stripJsonComments(source);
    // Comments (not just trailing commas) would be lost by a rewrite.
    if (stripped.replace(/\s|,/g, "") !== source.replace(/\s|,/g, "")) return null;
    try {
      const parsed = JSON.parse(stripped);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
      config = parsed as Record<string, unknown>;
    } catch {
      return null;
    }
  }
  apply(config);
  return `${JSON.stringify(config, null, 2)}\n`;
}

/** The plan carried out on one `name → entry` map, in place. */
function applyToMap(map: Record<string, unknown>, plan: SyncPlan, entry: (s: FoundServer) => Record<string, unknown>): void {
  for (const name of plan.remove) delete map[name];
  for (const s of [...plan.add, ...plan.update]) map[s.name] = entry(s);
}

// ---- Writing -----------------------------------------------------------------------------------

export interface TargetResult {
  status: "synced" | "not-installed" | "untouched" | "error";
  added: number;
  updated: number;
  removed: number;
  skipped: string[];
  /** Already free of any secret the servers carry. */
  error?: string;
}

const empty = (status: TargetResult["status"], error?: string): TargetResult =>
  ({ status, added: 0, updated: 0, removed: 0, skipped: [], ...(error ? { error } : {}) });

function done(plan: SyncPlan): TargetResult {
  return { status: "synced", added: plan.add.length, updated: plan.update.length, removed: plan.remove.length, skipped: plan.skipped };
}

/** An error a CLI printed, with every secret of the servers taken out before it goes anywhere. */
function scrub(text: string, servers: FoundServer[]): string {
  return servers.reduce((t, s) => redactSecrets(t, { ...s, id: "", enabledFor: "all" }), text).trim().slice(0, 500);
}

interface Context {
  home: string;
  sep: string;
  servers: FoundServer[];
  owned: string[];
}

const homePath = (ctx: Context, rel: string) => [ctx.home, ...rel.split("/")].join(ctx.sep);

async function readHome(rel: string): Promise<string | null> {
  return getTransport().readHomeFile(rel).catch(() => null);
}

/** A tool whose list lives in a JSON file of its own, under one key. */
async function syncJsonFile(
  ctx: Context,
  rel: string,
  key: string,
  existingOf: (config: unknown) => FoundServer[],
  entry: (s: FoundServer) => Record<string, unknown>,
): Promise<{ result: TargetResult; owned: string[] }> {
  const source = await readHome(rel);
  let parsed: unknown = null;
  try { parsed = source ? JSON.parse(stripJsonComments(source)) : null; } catch { parsed = null; }
  const plan = planSync(ctx.servers, existingOf(parsed), ctx.owned);
  if (!plan.add.length && !plan.update.length && !plan.remove.length) return { result: done(plan), owned: plan.owned };
  const text = editJsonFile(source, config => {
    const map = (config[key] && typeof config[key] === "object" ? config[key] : {}) as Record<string, unknown>;
    applyToMap(map, plan, entry);
    config[key] = map;
  });
  if (text === null) return { result: empty("untouched"), owned: ctx.owned };
  await getTransport().writeFileAbs(homePath(ctx, rel), text);
  return { result: done(plan), owned: plan.owned };
}

/** A tool with its own `mcp add` / `mcp remove` commands, which ainess runs instead of editing. */
async function syncByCommands(
  ctx: Context,
  program: string,
  existing: FoundServer[],
  addArgs: (s: FoundServer) => string[],
  removeArgs: (name: string) => string[],
  removeBeforeUpdate: boolean,
): Promise<{ result: TargetResult; owned: string[] }> {
  const transport = getTransport();
  const plan = planSync(ctx.servers, existing, ctx.owned);
  const run = async (args: string[]) => {
    const res = await transport.exec(program, args, undefined, 60);
    if (res.code !== 0) throw new Error(scrub(res.stderr || res.stdout, ctx.servers));
  };
  try {
    for (const name of plan.remove) await run(removeArgs(name));
    for (const s of plan.update) {
      if (removeBeforeUpdate) await run(removeArgs(s.name));
      await run(addArgs(s));
    }
    for (const s of plan.add) await run(addArgs(s));
  } catch (e) {
    return { result: empty("error", e instanceof Error ? e.message : String(e)), owned: ctx.owned };
  }
  return { result: done(plan), owned: plan.owned };
}

/** A JSON file's content, or an empty object for one that is missing or broken. */
const jsonOf = (source: string | null): unknown => {
  try { return source ? JSON.parse(stripJsonComments(source)) : {}; } catch { return {}; }
};

/** Brings one tool in step. Never throws: what went wrong comes back in the result. */
async function syncTarget(target: NativeTarget, ctx: Context, program: string): Promise<{ result: TargetResult; owned: string[] }> {
  switch (target) {
    case "claude-code": {
      // Claude Code rewrites ~/.claude.json all the time; its own commands are the only safe writer.
      const existing = fromMcpServers(jsonOf(await readHome(".claude.json")));
      return syncByCommands(ctx, program, existing,
        s => ["mcp", "add-json", "--scope", "user", s.name, JSON.stringify(claudeEntry(s))],
        name => ["mcp", "remove", "--scope", "user", name],
        true);
    }
    case "antigravity": {
      const existing = fromMcpServers(jsonOf(await readHome(".gemini/config/mcp_config.json")));
      return syncByCommands(ctx, program, existing,
        s => {
          // Flags before the name, which the CLI insists on.
          const args = ["mcp", "add"];
          for (const [k, v] of Object.entries(s.env ?? {})) args.push("--env", `${k}=${v}`);
          for (const [k, v] of Object.entries(s.headers ?? {})) args.push("--header", `${k}: ${v}`);
          args.push("--type", s.transport, s.name);
          return s.transport === "http" ? [...args, s.url ?? ""] : [...args, "--", s.command ?? "", ...(s.args ?? [])];
        },
        name => ["mcp", "remove", name],
        false);
    }
    case "copilot":
      return syncJsonFile(ctx, ".copilot/mcp-config.json", "mcpServers", fromMcpServers, copilotEntry);
    case "gemini":
      return syncJsonFile(ctx, ".gemini/settings.json", "mcpServers", fromMcpServers, geminiEntry);
    case "opencode": {
      // Whichever of its two file names the user already has; a new one is plain JSON.
      const rel = (await readHome(".config/opencode/opencode.json")) !== null || (await readHome(".config/opencode/opencode.jsonc")) === null
        ? ".config/opencode/opencode.json"
        : ".config/opencode/opencode.jsonc";
      return syncJsonFile(ctx, rel, "mcp", fromOpencode, opencodeEntry);
    }
    case "codex": {
      const source = (await readHome(".codex/config.toml")) ?? "";
      const { text, skipped, owned } = withCodexBlock(source, ctx.servers);
      if (text !== source) await getTransport().writeFileAbs(homePath(ctx, ".codex/config.toml"), text);
      const before = new Set(ctx.owned);
      return {
        result: {
          status: "synced",
          added: owned.filter(n => !before.has(n)).length,
          updated: owned.filter(n => before.has(n)).length,
          removed: ctx.owned.filter(n => !owned.includes(n)).length,
          skipped,
        },
        owned,
      };
    }
  }
}

/** The program behind each target, or null when that CLI is not on this machine. */
async function programFor(target: NativeTarget): Promise<string | null> {
  if (target === "claude-code") return resolveClaudeEngine();
  const provider = target === "antigravity" ? "antigravity" : target;
  return useAppStore.getState().binaries[provider]?.path || null;
}

// ---- Status for the screen ---------------------------------------------------------------------

let lastResults: Partial<Record<NativeTarget, TargetResult>> = {};
const listeners = new Set<() => void>();

/** For `useSyncExternalStore`: what the last sync did to each tool. */
export function subscribeNativeMcp(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function nativeMcpResults(): Partial<Record<NativeTarget, TargetResult>> {
  return lastResults;
}

/**
 * Brings every installed CLI in step with ainess's shared servers, and records what ainess now owns
 * in each. Safe to call at any time: a tool already in step is read and left alone.
 */
export async function syncNativeMcp(): Promise<Partial<Record<NativeTarget, TargetResult>>> {
  const store = useAppStore.getState();
  if (store.config.mcpNativeSync === false) return {};
  const home = await getTransport().homeDir().catch(() => null);
  if (!home) return {};
  const sep = home.includes("\\") ? "\\" : "/";
  const servers = sharedServers(store.config.mcpServers);
  // A plugin Claude installed already brings its servers to Claude Code.
  const forClaude = sharedServers(store.config.mcpServers.filter(s => !cameFromClaude(s, store.config.plugins)));
  const ownedNow: NonNullable<AppConfig["mcpOwned"]> = { ...(store.config.mcpOwned ?? {}) };
  const results: Partial<Record<NativeTarget, TargetResult>> = {};

  for (const target of NATIVE_TARGETS) {
    const program = await programFor(target).catch(() => null);
    if (!program) { results[target] = empty("not-installed"); continue; }
    const ctx: Context = { home, sep, servers: target === "claude-code" ? forClaude : servers, owned: ownedNow[target] ?? [] };
    try {
      const { result, owned } = await syncTarget(target, ctx, program);
      results[target] = result;
      ownedNow[target] = owned;
    } catch (e) {
      results[target] = empty("error", scrub(e instanceof Error ? e.message : String(e), servers));
    }
    const r = results[target]!;
    if (r.status === "error") log.warn("mcp-native", `${target}: ${r.error}`);
    else if (r.added || r.updated || r.removed) log.info("mcp-native", `${target}: +${r.added} ~${r.updated} -${r.removed}`);
  }

  const before = JSON.stringify(store.config.mcpOwned ?? {});
  if (JSON.stringify(ownedNow) !== before) useAppStore.getState().updateConfig({ mcpOwned: ownedNow });
  lastResults = results;
  for (const fn of listeners) fn();
  return results;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let attached = false;

/**
 * Syncs once now and again whenever the servers or the switch change, a second after the last edit:
 * typing into the server dialog is not a reason to rewrite five files per keystroke.
 */
export function startNativeMcpSync(): void {
  if (attached) return;
  attached = true;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void syncNativeMcp(); }, 1000);
  };
  schedule();
  useAppStore.subscribe((state, prev) => {
    if (state.config.mcpServers !== prev.config.mcpServers || state.config.mcpNativeSync !== prev.config.mcpNativeSync || state.binaries !== prev.binaries) schedule();
  });
}
