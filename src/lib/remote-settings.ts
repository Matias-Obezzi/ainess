// The host side of editing the configuration from the remote desktop page: what the page is shown
// (`remoteConfigView`, secrets masked), what it may send back (`prepareRemotePatch`, validated and
// with the masked secrets put back) and how that lands in the store (`applyRemotePatch`).
//
// The page is a browser on another machine holding the remote token, so nothing it sends is
// trusted: a key it may not change is refused, a value of the wrong shape is refused, and a secret
// it was shown masked can only be kept as it is or replaced, never read back nor moved somewhere
// else (a server whose address changed loses its masked secrets instead of carrying them along).
import { useAppStore } from "@/store";
import { getTransport } from "@/lib/transport";
import { log } from "@/lib/logger";
import { LANGUAGES } from "@/i18n";
import { PROVIDERS } from "@/lib/providers";
import { TASK_STATUSES } from "@/lib/tasks";
import { parseManifest } from "@/lib/mcpb";
import type { AgentConfig, AppConfig, McpServer, Plugin, Project, Skill } from "@/types";
import {
  REMOTE_CONFIG_KEYS,
  REMOTE_PROJECT_KEYS,
  SECRET_MASK,
  type RemoteConfigKey,
  type RemoteProjectKey,
} from "@/lib/remote-settings-keys";

export { SECRET_MASK, REMOTE_CONFIG_KEYS, REMOTE_PROJECT_KEYS };

/** What `GET settings` answers: the editable part of the config, masked, plus the projects whole. */
export interface RemoteConfigView {
  version: number;
  /** The host's home folder: an extension's command is resolved against it. */
  home: string | null;
  config: Partial<Pick<AppConfig, RemoteConfigKey>> & { projects: Project[] };
}

/** A patch as the page sends it: whole values per top-level key, changed fields per project. */
export interface RemoteConfigPatch {
  config: Partial<Pick<AppConfig, RemoteConfigKey>>;
  projects: Array<Pick<Project, "id"> & Partial<Pick<Project, RemoteProjectKey>>>;
}

export type PatchResult = { ok: true; patch: RemoteConfigPatch } | { ok: false; error: string; field: string };

// ---------------------------------------------------------------------------------------------
// Masking

/** `${VAR}` is a reference the CLI expands, not the secret itself: showing it is what helps. */
const ENV_REFERENCE = /^\$\{[A-Za-z_][A-Za-z0-9_]*\}$/;

function maskValue(value: unknown): unknown {
  if (typeof value === "string") return value && !ENV_REFERENCE.test(value) ? SECRET_MASK : value;
  if (Array.isArray(value)) return value.length > 0 ? SECRET_MASK : value;
  return value;
}

function maskRecord(record: Record<string, string> | undefined): Record<string, string> | undefined {
  if (!record) return record;
  return Object.fromEntries(Object.entries(record).map(([k, v]) => [k, maskValue(v) as string]));
}

/**
 * The config values of an extension that its manifest calls sensitive, by server id. A manifest that
 * cannot be read makes every value of that extension count as one: guessing wrong the other way
 * would put an API key on the page.
 */
export async function sensitiveExtensionKeys(servers: McpServer[]): Promise<Record<string, Set<string> | "all">> {
  const out: Record<string, Set<string> | "all"> = {};
  await Promise.all(servers.filter(s => s.extension?.config).map(async server => {
    const dir = server.extension!.dir;
    const sep = dir.includes("\\") ? "\\" : "/";
    const raw = await getTransport().readFileAbs(`${dir}${sep}manifest.json`).catch(() => null);
    const manifest = raw ? parseManifest(raw) : null;
    out[server.id] = manifest ? new Set(manifest.fields.filter(f => f.sensitive).map(f => f.key)) : "all";
  }));
  return out;
}

function maskServer(server: McpServer, sensitive: Set<string> | "all" | undefined): McpServer {
  const next: McpServer = { ...server, env: maskRecord(server.env), headers: maskRecord(server.headers) };
  if (server.extension?.config) {
    const secretValues = new Set<string>();
    const config: Record<string, string | number | boolean | string[]> = {};
    for (const [key, value] of Object.entries(server.extension.config)) {
      const isSecret = sensitive === "all" ? typeof value === "string" || Array.isArray(value) : !!sensitive?.has(key);
      if (isSecret) {
        if (typeof value === "string" && value) secretValues.add(value);
        if (Array.isArray(value)) for (const v of value) if (v) secretValues.add(v);
      }
      config[key] = isSecret ? (maskValue(value) as string) : value;
    }
    next.extension = { ...server.extension, config };
    // A manifest can put a value straight into the command line.
    if (server.args) next.args = server.args.map(a => (secretValues.has(a) ? SECRET_MASK : a));
  }
  if (next.env === undefined) delete next.env;
  if (next.headers === undefined) delete next.headers;
  return next;
}

function maskProject(project: Project): Project {
  if (!project.room) return project;
  const room = { ...project.room };
  room.secret = maskValue(room.secret) as string;
  if (room.supabaseKey !== undefined) room.supabaseKey = maskValue(room.supabaseKey) as string;
  if (room.firebaseToken !== undefined) room.firebaseToken = maskValue(room.firebaseToken) as string;
  return { ...project, room };
}

/** The editable part of `config` as the page gets it: every secret replaced by `SECRET_MASK`. */
export function remoteConfigView(
  config: AppConfig,
  sensitive: Record<string, Set<string> | "all"> = {},
): RemoteConfigView["config"] {
  const out: Record<string, unknown> = {};
  for (const key of REMOTE_CONFIG_KEYS) {
    if (config[key] !== undefined) out[key] = config[key];
  }
  out.mcpServers = (config.mcpServers ?? []).map(s => maskServer(s, sensitive[s.id]));
  out.hooks = (config.hooks ?? []).map(hook => {
    const action = { ...hook.action } as Record<string, unknown>;
    if (typeof action.webhookUrl === "string") action.webhookUrl = maskValue(action.webhookUrl);
    if (action.headers && typeof action.headers === "object") action.headers = maskRecord(action.headers as Record<string, string>);
    return { ...hook, action } as AppConfig["hooks"][number];
  });
  if (config.boards) {
    const boards: NonNullable<AppConfig["boards"]> = {};
    if (config.boards.github) boards.github = { token: maskValue(config.boards.github.token) as string };
    if (config.boards.trello) {
      boards.trello = { key: maskValue(config.boards.trello.key) as string, token: maskValue(config.boards.trello.token) as string };
    }
    out.boards = boards;
  }
  out.projects = config.projects.map(maskProject);
  return out as RemoteConfigView["config"];
}

// ---------------------------------------------------------------------------------------------
// Schema

/**
 * A small schema, enough to say what each editable value looks like. Objects are strict: a key that
 * is neither required nor optional is refused, unless the host's own data already has it at that
 * place (a field an older build wrote, which the page is only sending back).
 */
type Schema =
  | { t: "str" } | { t: "bool" } | { t: "num"; min?: number; max?: number; int?: boolean }
  | { t: "enum"; values: readonly unknown[] }
  | { t: "null"; of: Schema }
  | { t: "arr"; of: Schema; max?: number }
  | { t: "rec"; of: Schema }
  | { t: "tuple"; of: Schema[] }
  | { t: "obj"; name: string; req: Record<string, Schema>; opt?: Record<string, Schema> }
  | { t: "union"; key: string; variants: Record<string, Schema & { t: "obj" }> }
  | { t: "anyOf"; of: Schema[] };

const str: Schema = { t: "str" };
const bool: Schema = { t: "bool" };
const num = (min?: number, max?: number, int = false): Schema => ({ t: "num", min, max, int });
const int = (min?: number, max?: number): Schema => num(min, max, true);
const oneOf = (...values: unknown[]): Schema => ({ t: "enum", values });
const nullable = (of: Schema): Schema => ({ t: "null", of });
const arr = (of: Schema, max?: number): Schema => ({ t: "arr", of, max });
const rec = (of: Schema): Schema => ({ t: "rec", of });
const obj = (name: string, req: Record<string, Schema>, opt: Record<string, Schema> = {}): Schema & { t: "obj" } =>
  ({ t: "obj", name, req, opt });

/**
 * Built on first use rather than when the module loads: the store, the providers and the task
 * statuses this reads are not all initialised yet while the import graph is still being walked.
 */
function buildSchemas(): { projectFieldSchemas: Record<RemoteProjectKey, Schema>; configSchemas: Record<RemoteConfigKey, Schema> } {
  const enabledFor: Schema = { t: "anyOf", of: [oneOf("all"), arr(str)] };

  const agentSchema = obj("agent", { id: str, name: str, provider: oneOf(...Object.keys(PROVIDERS)), role: oneOf("planner", "implementer", "reviewer", "custom") }, {
    parentId: nullable(str),
    model: str,
    effort: oneOf("low", "medium", "high", "xhigh", "max"),
    autoApprove: bool,
    description: str,
    systemPrompt: str,
    customCommand: obj("customCommand", { program: str, args: arr(str) }),
    color: str,
    requireApproval: bool,
    worktree: bool,
    retryOnQuota: bool,
  });

  const formationSchema = obj("formation", { id: str, name: str, agents: arr(agentSchema) }, {
    description: str,
    assignments: rec(obj("assignment", { skills: arr(str), mcpServers: arr(str) })),
  });

  const skillSchema = obj("skill", { id: str, name: str, content: str, enabledFor }, {
    description: str,
    dir: str,
    source: oneOf("claude-code", "claude-synced", "agents", "codex", "copilot", "opencode", "gemini", "upload", "plugin"),
    managed: bool,
    plugin: str,
  });

  const extensionValue: Schema = { t: "anyOf", of: [str, num(), bool, arr(str)] };

  const mcpSchema = obj("mcpServer", { id: str, name: str, transport: oneOf("stdio", "http"), enabledFor }, {
    command: str,
    args: arr(str),
    env: rec(str),
    url: str,
    headers: rec(str),
    extension: obj("extension", { id: str, dir: str }, { version: str, config: rec(extensionValue), external: bool }),
    oauth: bool,
    plugin: str,
  });

  const presetSchema = obj("preset", { id: str, name: str, prompt: str }, { agentId: str, model: str });

  const HOOK_EVENTS = [
    "approval.requested", "task.started", "task.finished", "task.failed", "delegation", "run.finished", "run.failed",
    "agent.stopped", "result", "question.asked", "review.changes", "verify.failed", "quota.exhausted", "app.started",
    "schedule", "internet.lost", "internet.back", "file.changed",
  ] as const;

  const hookActionSchema: Schema = {
    t: "union",
    key: "type",
    variants: {
      slack: obj("hook.slack", { type: str, webhookUrl: str, template: str }),
      discord: obj("hook.discord", { type: str, webhookUrl: str, template: str }),
      telegram: obj("hook.telegram", { type: str, template: str }, { chatId: str }),
      webhook: obj("hook.webhook", { type: str, url: str, bodyTemplate: str }, { method: oneOf("POST"), headers: rec(str) }),
      command: obj("hook.command", { type: str, program: str, args: arr(str) }, { cwd: str }),
      instruct: obj("hook.instruct", { type: str, agentId: str, template: str }),
      notify: obj("hook.notify", { type: str, title: str, template: str }),
    },
  };

  const hookSchema = obj("hook", { id: str, name: str, event: oneOf(...HOOK_EVENTS), enabled: bool, action: hookActionSchema }, {
    filter: obj("hook.filter", {}, { agentId: str, projectId: str }),
    schedule: obj("hook.schedule", {}, { at: str, everyMinutes: num(1) }),
  });

  const pluginToggleSchema = obj("plugin", { id: str, enabled: bool }, {
    name: str, version: str, description: str, author: str, dir: str,
    source: oneOf("claude-synced", "claude-code", "git", "folder"),
    repo: str, managed: bool, commands: arr(obj("plugin.command", { name: str }, { description: str, prompt: str })),
    hooks: bool, agents: num(0),
  });

  const columnsSchema: Schema = obj("board.columns", {}, Object.fromEntries(TASK_STATUSES.map(s => [s, str])));

  const projectFieldSchemas: Record<RemoteProjectKey, Schema> = {
    name: str,
    color: str,
    agents: arr(agentSchema),
    budget: obj("budget", { onReached: oneOf("warn", "block") }, { dailyUsd: num(0), monthlyUsd: num(0), perRunUsd: num(0) }),
    board: obj("board", { provider: oneOf("none", "local", "github-projects", "trello", "jira") }, {
      externalId: str, owner: str, number: num(0), columns: columnsSchema,
    }),
    room: obj("room", { enabled: bool, backend: oneOf("supabase", "firebase"), room: str, secret: str, allowed: rec(str) }, {
      supabaseUrl: str, supabaseKey: str, firebaseUrl: str, firebaseToken: str, chatId: str, maxTurns: int(1, 100),
    }),
    verify: arr(obj("verify", { id: str, label: str, program: str, args: arr(str) })),
    commands: arr(obj("command", { id: str, label: str, command: str })),
    sharedContext: str,
  };

  const configSchemas: Record<RemoteConfigKey, Schema> = {
    language: nullable(oneOf(...LANGUAGES)),
    approveDelegations: bool,
    tray: obj("tray", { enabled: bool, notifyApprovals: bool, notifyResults: bool }),
    formations: arr(formationSchema),
    defaultFormationId: nullable(str),
    maxRounds: int(1, 1000),
    maxConcurrentRuns: int(0, 1000),
    stallStopMinutes: int(0, 24 * 60),
    mcpNativeSync: bool,
    plugins: arr(pluginToggleSchema),
    skillsNativeSync: bool,
    skills: arr(skillSchema),
    mcpServers: arr(mcpSchema),
    profile: obj("profile", { name: str, about: str, preferences: str }),
    presets: arr(presetSchema),
    autoModel: bool,
    hooks: arr(hookSchema),
    logLevel: oneOf("debug", "info", "warn", "error"),
    autoUpdateCheck: bool,
    autoArchiveDoneDays: nullable(int(1, 3650)),
    notificationSound: obj("sound", {}, {
      enabled: bool, notes: { t: "tuple", of: [num(20, 20000), num(20, 20000)] },
      wave: oneOf("sine", "square", "sawtooth", "triangle"), volume: num(0, 1), file: str, fileName: str,
    }),
    mascotAlways: bool,
    screenAnimations: bool,
    escapeStops: oneOf("always", "twice", "never"),
    rememberedModels: rec(arr(str)),
    plannerPermissions: obj("plannerPermissions", {}, {
      presets: obj("plannerPermissions.presets", {}, Object.fromEntries(
        ["git", "look", "browse", "test", "build", "install", "edit", "anything"].map(id => [id, bool]),
      )),
      allow: arr(str),
      deny: arr(str),
    }),
    boards: obj("boards", {}, {
      github: obj("boards.github", { token: str }),
      trello: obj("boards.trello", { key: str, token: str }),
    }),
  };

  return { projectFieldSchemas, configSchemas };
}

let built: ReturnType<typeof buildSchemas> | null = null;
const schemas = () => (built ??= buildSchemas());


/** The optional keys of `AppConfig`: the only ones that may be taken away instead of set. */
const UNSETTABLE = new Set<RemoteConfigKey>([
  "stallStopMinutes", "mcpNativeSync", "skillsNativeSync", "notificationSound", "mascotAlways", "screenAnimations",
  "escapeStops", "rememberedModels", "plannerPermissions", "boards",
]);

function isPlainObject(v: unknown): v is Record<string, unknown> {
  return !!v && typeof v === "object" && !Array.isArray(v);
}

/** Every key the host's own data has, per object schema: what an older build may have left behind. */
function collectKeys(schema: Schema, value: unknown, out: Map<string, Set<string>>): void {
  switch (schema.t) {
    case "null": if (value !== null) collectKeys(schema.of, value, out); return;
    case "arr": if (Array.isArray(value)) for (const v of value) collectKeys(schema.of, v, out); return;
    case "rec": if (isPlainObject(value)) for (const v of Object.values(value)) collectKeys(schema.of, v, out); return;
    case "anyOf": for (const s of schema.of) collectKeys(s, value, out); return;
    case "union": {
      if (!isPlainObject(value)) return;
      const variant = schema.variants[String(value[schema.key])];
      if (variant) collectKeys(variant, value, out);
      return;
    }
    case "obj": {
      if (!isPlainObject(value)) return;
      const known = out.get(schema.name) ?? new Set<string>();
      for (const k of Object.keys(value)) known.add(k);
      out.set(schema.name, known);
      for (const [k, s] of Object.entries({ ...schema.req, ...schema.opt })) collectKeys(s, value[k], out);
      return;
    }
    default: return;
  }
}

/** Whether `value` fits `schema`. `legacy` holds the keys the host's data has, per object name. */
function fits(schema: Schema, value: unknown, legacy: Map<string, Set<string>>): boolean {
  switch (schema.t) {
    case "str": return typeof value === "string";
    case "bool": return typeof value === "boolean";
    case "num":
      return typeof value === "number" && Number.isFinite(value)
        && (!schema.int || Number.isInteger(value))
        && (schema.min === undefined || value >= schema.min)
        && (schema.max === undefined || value <= schema.max);
    case "enum": return schema.values.includes(value);
    case "null": return value === null || fits(schema.of, value, legacy);
    case "arr": return Array.isArray(value) && (schema.max === undefined || value.length <= schema.max) && value.every(v => fits(schema.of, v, legacy));
    case "rec": return isPlainObject(value) && Object.values(value).every(v => fits(schema.of, v, legacy));
    case "tuple": return Array.isArray(value) && value.length === schema.of.length && schema.of.every((s, i) => fits(s, value[i], legacy));
    case "anyOf": return schema.of.some(s => fits(s, value, legacy));
    case "union": {
      if (!isPlainObject(value)) return false;
      const variant = schema.variants[String(value[schema.key])];
      return !!variant && fits(variant, value, legacy);
    }
    case "obj": {
      if (!isPlainObject(value)) return false;
      const opt = schema.opt ?? {};
      for (const [k, s] of Object.entries(schema.req)) if (!fits(s, value[k], legacy)) return false;
      const old = legacy.get(schema.name);
      for (const [k, v] of Object.entries(value)) {
        if (k in schema.req) continue;
        if (k in opt) { if (v !== undefined && !fits(opt[k], v, legacy)) return false; continue; }
        if (!old?.has(k)) return false;
      }
      return true;
    }
  }
}

function legacyKeys(schema: Schema, hostValue: unknown): Map<string, Set<string>> {
  const out = new Map<string, Set<string>>();
  collectKeys(schema, hostValue, out);
  return out;
}

// ---------------------------------------------------------------------------------------------
// Secrets coming back

function hasMask(value: unknown): boolean {
  if (value === SECRET_MASK) return true;
  if (Array.isArray(value)) return value.some(hasMask);
  if (isPlainObject(value)) return Object.values(value).some(hasMask);
  return false;
}

/**
 * Puts the host's values back wherever `next` holds the mask, walking both side by side: objects by
 * key, arrays of things with an `id` by that id, other arrays by position. A mask with nothing on
 * the host side stays a mask, and the caller refuses it.
 */
function restore(next: unknown, prev: unknown): unknown {
  if (next === SECRET_MASK) return prev !== undefined ? prev : next;
  if (Array.isArray(next)) {
    const prevArr = Array.isArray(prev) ? prev : [];
    const byId = new Map<unknown, unknown>();
    for (const p of prevArr) if (isPlainObject(p) && typeof p.id === "string") byId.set(p.id, p);
    return next.map((item, i) => {
      if (isPlainObject(item) && typeof item.id === "string") return restore(item, byId.get(item.id));
      return restore(item, prevArr[i]);
    });
  }
  if (isPlainObject(next)) {
    const prevObj = isPlainObject(prev) ? prev : {};
    return Object.fromEntries(Object.entries(next).map(([k, v]) => [k, restore(v, prevObj[k])]));
  }
  return next;
}

/** What a masked secret is tied to: change any of these and the secret does not follow. */
function sameAnchors(next: Record<string, unknown>, prev: Record<string, unknown> | undefined, anchors: string[]): boolean {
  if (!prev) return false;
  return anchors.every(path => {
    const get = (o: Record<string, unknown>) => path.split(".").reduce<unknown>((acc, k) => (isPlainObject(acc) ? acc[k] : undefined), o);
    return get(next) === get(prev);
  });
}

function restoreItems(next: unknown[], prev: unknown[] | undefined, anchors: string[]): unknown[] | null {
  const byId = new Map<string, Record<string, unknown>>();
  for (const p of prev ?? []) if (isPlainObject(p) && typeof p.id === "string") byId.set(p.id, p);
  const out: unknown[] = [];
  for (const item of next) {
    if (!isPlainObject(item) || !hasMask(item)) { out.push(item); continue; }
    const before = typeof item.id === "string" ? byId.get(item.id) : undefined;
    if (!sameAnchors(item, before, anchors)) return null;
    out.push(restore(item, before));
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// What may not change from the page

const sameJson = (a: unknown, b: unknown) => JSON.stringify(a) === JSON.stringify(b);

/**
 * The fields that tie an item to a folder on the host. A skill pointing at another folder would be
 * copied into every CLI, an extension at another folder would run what is there, and a "managed"
 * one is deleted with its folder: none of that is the page's to decide.
 */
function guardHostFields(key: RemoteConfigKey, next: unknown, host: AppConfig): string | null {
  if (key === "skills") {
    const before = new Map((host.skills ?? []).map(s => [s.id, s] as const));
    for (const skill of next as Skill[]) {
      const old = before.get(skill.id);
      for (const field of ["dir", "managed", "source", "plugin"] as const) {
        if (!sameJson(skill[field], old?.[field])) return `skills.${field}`;
      }
    }
  }
  if (key === "mcpServers") {
    const before = new Map((host.mcpServers ?? []).map(s => [s.id, s] as const));
    for (const server of next as McpServer[]) {
      const old = before.get(server.id);
      if (!sameJson(server.plugin, old?.plugin)) return "mcpServers.plugin";
      const ext = server.extension;
      const oldExt = old?.extension;
      if (ext || oldExt) {
        if (!ext || !oldExt || ext.id !== oldExt.id || ext.dir !== oldExt.dir || !!ext.external !== !!oldExt.external || ext.version !== oldExt.version) {
          return "mcpServers.extension";
        }
      }
    }
  }
  return null;
}

/** A plugin is installed on the host: the page may switch one on or off and uninstall it, nothing else. */
function pluginsFromToggles(next: Array<Pick<Plugin, "id" | "enabled">>, host: AppConfig): Plugin[] | null {
  const before = new Map((host.plugins ?? []).map(p => [p.id, p] as const));
  const out: Plugin[] = [];
  for (const toggle of next) {
    const old = before.get(toggle.id);
    if (!old) return null;
    out.push({ ...old, enabled: toggle.enabled });
  }
  return out;
}

// ---------------------------------------------------------------------------------------------
// The patch

/**
 * Checks a patch from the page against the host's config. On success the patch is ready to apply:
 * shapes checked, masked secrets put back, plugins rebuilt from the host's own records.
 */
export function prepareRemotePatch(raw: unknown, host: AppConfig): PatchResult {
  const fail = (error: string, field: string): PatchResult => ({ ok: false, error, field });
  if (!isPlainObject(raw)) return fail("invalid", "patch");
  const config: Record<string, unknown> = {};
  const rawConfig = raw.config ?? {};
  if (!isPlainObject(rawConfig)) return fail("invalid", "config");
  for (const key of Object.keys(raw)) if (key !== "config" && key !== "projects") return fail("unknown", key);

  for (const [key, value] of Object.entries(rawConfig)) {
    if (!(REMOTE_CONFIG_KEYS as readonly string[]).includes(key)) return fail("unknown", key);
    const k = key as RemoteConfigKey;
    const schema = schemas().configSchemas[k];
    // JSON has no undefined: null is how the page says a setting was taken away. For the keys
    // where null is a value of its own (follow the system language, no default team), it is that.
    if (value === null && schema.t !== "null" && UNSETTABLE.has(k)) { config[k] = undefined; continue; }
    if (!fits(schema, value, legacyKeys(schema, host[k]))) return fail("invalid", key);
    let next: unknown = value;
    if (k === "mcpServers") {
      next = restoreItems(value as unknown[], host.mcpServers, ["transport", "url", "command"]);
    } else if (k === "hooks") {
      next = restoreItems(value as unknown[], host.hooks, ["action.type", "action.url"]);
    } else if (k === "boards") {
      next = restore(value, host.boards);
    } else if (k === "plugins") {
      next = pluginsFromToggles(value as Array<Pick<Plugin, "id" | "enabled">>, host);
      if (!next) return fail("invalid", key);
    }
    // A null out of a value that was not null is a secret that could not be put back.
    if ((next === null && value !== null) || hasMask(next)) return fail("secret", key);
    const guarded = guardHostFields(k, next, host);
    if (guarded) return fail("hostOnly", guarded);
    config[k] = next;
  }

  const projects: RemoteConfigPatch["projects"] = [];
  const rawProjects = raw.projects ?? [];
  if (!Array.isArray(rawProjects)) return fail("invalid", "projects");
  for (const entry of rawProjects) {
    if (!isPlainObject(entry) || typeof entry.id !== "string") return fail("invalid", "projects");
    const hostProject = host.projects.find(p => p.id === entry.id);
    if (!hostProject) return fail("invalid", "projects.id");
    const out: Record<string, unknown> = { id: entry.id };
    for (const [key, value] of Object.entries(entry)) {
      if (key === "id") continue;
      if (!(REMOTE_PROJECT_KEYS as readonly string[]).includes(key)) return fail("unknown", `projects.${key}`);
      const k = key as RemoteProjectKey;
      const schema = schemas().projectFieldSchemas[k];
      if (value === null && k !== "name" && k !== "agents") { out[k] = undefined; continue; }
      if (!fits(schema, value, legacyKeys(schema, hostProject[k]))) return fail("invalid", `projects.${key}`);
      let next: unknown = value;
      if (k === "room" && hasMask(value)) {
        next = sameAnchors(value as Record<string, unknown>, hostProject.room as unknown as Record<string, unknown>, ["backend", "supabaseUrl", "firebaseUrl"])
          ? restore(value, hostProject.room)
          : null;
      }
      if ((next === null && value !== null) || hasMask(next)) return fail("secret", `projects.${key}`);
      if (k === "agents") {
        const ids = new Set<string>();
        for (const a of next as AgentConfig[]) {
          if (ids.has(a.id)) return fail("invalid", "projects.agents");
          ids.add(a.id);
        }
      }
      out[k] = next;
    }
    projects.push(out as RemoteConfigPatch["projects"][number]);
  }

  return { ok: true, patch: { config: config as RemoteConfigPatch["config"], projects } };
}

/**
 * Lands a checked patch in the store, the same actions the desktop UI calls, so whatever they do
 * besides writing (resetting a session that changed CLI, cleaning assignments of a removed agent,
 * the tray, the log level) happens here too. Then cleans up after what was removed: folders ainess
 * unpacked and OAuth tokens in the keychain belong to the host and are deleted by the host.
 */
export async function applyRemotePatch(patch: RemoteConfigPatch): Promise<void> {
  const before = useAppStore.getState().config;

  for (const { id, agents, ...fields } of patch.projects) {
    if (agents) {
      const store = useAppStore.getState();
      const current = store.config.projects.find(p => p.id === id)?.agents ?? [];
      const wanted = new Set(agents.map(a => a.id));
      for (const a of current) if (!wanted.has(a.id)) store.removeAgent(id, a.id);
      for (const a of agents) {
        const s = useAppStore.getState();
        const exists = (s.config.projects.find(p => p.id === id)?.agents ?? []).some(x => x.id === a.id);
        if (exists) s.updateAgent(id, a.id, a);
        else s.addAgent(id, a);
      }
      // The actions above merge; the team the page sent is the whole of it, a cleared field
      // included, and in its order, which is the order the board draws.
      useAppStore.getState().updateProject(id, { agents });
    }
    if (Object.keys(fields).length > 0) useAppStore.getState().updateProject(id, fields);
  }

  if (Object.keys(patch.config).length > 0) useAppStore.getState().updateConfig(patch.config);

  const transport = getTransport();
  if (patch.config.skills) {
    const kept = new Set(patch.config.skills.map(s => s.id));
    for (const skill of before.skills ?? []) {
      if (!kept.has(skill.id) && skill.managed && skill.dir) await transport.removeSkillDir(skill.dir).catch(() => {});
    }
  }
  if (patch.config.mcpServers) {
    const kept = new Set(patch.config.mcpServers.map(s => s.id));
    for (const server of before.mcpServers ?? []) {
      if (kept.has(server.id)) continue;
      if (server.extension && !server.extension.external) await transport.removeExtension(server.extension.dir).catch(() => {});
      if (server.oauth) await transport.oauthDisconnect(server.id).catch(() => {});
    }
  }
  if (patch.config.plugins) {
    const kept = patch.config.plugins;
    for (const plugin of before.plugins ?? []) {
      if (kept.some(p => p.id === plugin.id) || !plugin.managed) continue;
      // A clone is shared by every plugin installed from the same marketplace: it goes with the last one.
      const shared = plugin.repo && kept.some(p => p.managed && p.repo === plugin.repo);
      if (!shared) await transport.removePluginDir(plugin.dir).catch(() => {});
    }
  }
  log.info("remote", `settings changed from the remote page: ${[...Object.keys(patch.config), ...patch.projects.map(p => `project ${p.id}`)].join(", ")}`);
}
