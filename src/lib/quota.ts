// Model lists and remaining-quota lookups per provider. See PLAN.md ("Modelos y cuota") for the
// data sources (endpoints, headers, files) this module relies on.
import { Binaries, ModelInfo, ProviderId, ProviderQuota, QuotaItem } from "@/types";
import { getTransport } from "@/lib/transport";
import { activeLocale, translateNow } from "@/i18n/useT";
import { PROVIDERS } from "@/lib/providers";

// ---------------------------------------------------------------------------------------------
// Antigravity: models (agy models) + quota inferred from run outcomes, persisted on disk.
// ---------------------------------------------------------------------------------------------

const QUOTA_FILE = "quota/antigravity.json";
const AGY_MODELS_CACHE_MS = 10 * 60 * 1000;

let agyModelsCache: { at: number; models: ModelInfo[] } | null = null;

/** Parses `agy models` stdout: one `id<TAB>label` per line, ignoring lines without a tab. */
export function parseAgyModels(stdout: string): ModelInfo[] {
  const models: ModelInfo[] = [];
  for (const line of stdout.split("\n")) {
    const idx = line.indexOf("\t");
    if (idx < 0) continue;
    const id = line.slice(0, idx).trim();
    const label = line.slice(idx + 1).trim();
    if (id) models.push({ id, label: label || id });
  }
  return models;
}

/** Parses a duration like "1h45m26s" (any component optional) into milliseconds, or null if unparseable. */
export function parseResetDuration(text: string): number | null {
  const m = text.match(/^\s*(?:(\d+)h)?\s*(?:(\d+)m)?\s*(?:(\d+)s)?\s*$/i);
  if (!m || (!m[1] && !m[2] && !m[3])) return null;
  const h = m[1] ? parseInt(m[1], 10) : 0;
  const min = m[2] ? parseInt(m[2], 10) : 0;
  const s = m[3] ? parseInt(m[3], 10) : 0;
  return (h * 3600 + min * 60 + s) * 1000;
}

/** Antigravity shares quota by model family: gemini-*, claude-*, or the id up to the first hyphen. */
export function poolOf(modelId: string): string {
  if (modelId.startsWith("gemini")) return "gemini";
  if (modelId.startsWith("claude")) return "claude";
  const dash = modelId.indexOf("-");
  return dash > 0 ? modelId.slice(0, dash) : modelId;
}

interface AntigravityPools {
  pools: Record<string, { exhaustedUntil: number; lastError: string }>;
}

async function loadAntigravityPools(): Promise<AntigravityPools> {
  const text = await getTransport().readTextFile(QUOTA_FILE);
  if (!text) return { pools: {} };
  try {
    const parsed = JSON.parse(text);
    return { pools: parsed?.pools && typeof parsed.pools === "object" ? parsed.pools : {} };
  } catch {
    return { pools: {} };
  }
}

async function saveAntigravityPools(data: AntigravityPools): Promise<void> {
  await getTransport().writeTextFile(QUOTA_FILE, JSON.stringify(data, null, 2));
}

const QUOTA_REACHED_RE = /quota reached.*?Resets in\s+((?:\d+h)?(?:\d+m)?(?:\d+s)?)/i;

/**
 * Called when an antigravity run finishes. If the run failed with a "quota reached" error,
 * marks the model's pool as exhausted until the reset time; a successful run clears the mark.
 */
export async function recordAntigravityOutcome(model: string | undefined, text: string, ok: boolean): Promise<void> {
  const pool = poolOf(model || "gemini");
  const data = await loadAntigravityPools();

  if (ok) {
    if (data.pools[pool]) {
      delete data.pools[pool];
      await saveAntigravityPools(data);
    }
    return;
  }

  const match = text.match(QUOTA_REACHED_RE);
  if (!match) return;
  const durationMs = parseResetDuration(match[1]);
  if (durationMs === null) return;

  data.pools[pool] = { exhaustedUntil: Date.now() + durationMs, lastError: match[0] };
  await saveAntigravityPools(data);
}

/**
 * How each CLI says the account has nothing left for this model. Deliberately narrow: a planner
 * told the wrong reason retries on another model for nothing, so a phrase only belongs here when
 * it can mean nothing else. Everything else is reported as the plain failure it is.
 */
const OUT_OF_QUOTA = [
  /quota (reached|exceeded|exhausted)/i,   // Antigravity
  /usage limit reached/i,                   // Claude Code
  /rate.?limit(ed| reached| exceeded)/i,    // several
  /out of (premium )?requests/i,            // Copilot
  /insufficient (quota|credits|balance)/i,  // opencode and the OpenAI-shaped APIs
];

/** True when a run failed because the model had nothing left, not because the work went wrong. */
export function outOfQuota(text: string): boolean {
  return OUT_OF_QUOTA.some(re => re.test(text));
}

/**
 * Models of the same CLI worth retrying on: not the one that ran out, and not its pool-mates —
 * quota is spent per family, so the next gemini after a gemini ran out is the same wall again.
 */
export function alternativeModels(provider: ProviderId, failed: string | undefined): string[] {
  const all = PROVIDERS[provider]?.defaultModels ?? [];
  const deadPool = failed ? poolOf(failed) : null;
  return all.filter(model => model !== failed && (!deadPool || poolOf(model) !== deadPool));
}

/** Current per-pool exhaustion state, as persisted on disk. */
export async function antigravityQuota(): Promise<AntigravityPools["pools"]> {
  const data = await loadAntigravityPools();
  return data.pools;
}

// ---------------------------------------------------------------------------------------------
// Models per provider.
// ---------------------------------------------------------------------------------------------

export async function listModels(provider: ProviderId, binaries: Binaries): Promise<ModelInfo[]> {
  if (provider === "antigravity") {
    if (agyModelsCache && Date.now() - agyModelsCache.at < AGY_MODELS_CACHE_MS) {
      return agyModelsCache.models;
    }
    const bin = binaries.antigravity;
    if (!bin?.path) return PROVIDERS.antigravity.models;
    try {
      const res = await getTransport().exec(bin.path, ["models"]);
      const models = parseAgyModels(res.stdout);
      if (models.length > 0) {
        agyModelsCache = { at: Date.now(), models };
        return models;
      }
      return PROVIDERS.antigravity.models;
    } catch {
      return PROVIDERS.antigravity.models;
    }
  }
  if (provider === "opencode") {
    // `opencode models` prints one «proveedor/modelo» per line, and which ones exist depends on
    // what the user connected (an AI Studio key adds the google/* ones).
    const bin = binaries.opencode;
    if (!bin?.path) return PROVIDERS.opencode.models;
    try {
      const res = await getTransport().exec(bin.path, ["models"]);
      const models = parseOpencodeModels(res.stdout);
      return models.length > 0 ? models : PROVIDERS.opencode.models;
    } catch {
      return PROVIDERS.opencode.models;
    }
  }
  return PROVIDERS[provider]?.models || [];
}

/** One id per line; anything that is not a `provider/model` is a message, not a model. */
export function parseOpencodeModels(stdout: string): ModelInfo[] {
  const seen = new Set<string>();
  const models: ModelInfo[] = [];
  for (const raw of stdout.split(/\r?\n/)) {
    const id = raw.trim();
    if (!/^[\w.-]+\/[\w.:-]+$/.test(id) || seen.has(id)) continue;
    seen.add(id);
    models.push({ id, label: id });
  }
  return models;
}

// ---------------------------------------------------------------------------------------------
// Copilot quota: GET https://api.github.com/copilot_internal/user with a `gh auth token`.
// ---------------------------------------------------------------------------------------------

interface CopilotQuotaSnapshot {
  entitlement?: number;
  remaining?: number;
  percent_remaining?: number;
  unlimited?: boolean;
}

interface CopilotUserResponse {
  quota_reset_date?: string;
  quota_snapshots?: Record<string, CopilotQuotaSnapshot>;
}

const SNAPSHOT_LABELS: Record<string, string> = {
  premium_interactions: "Premium requests",
  chat: "Chat",
  completions: "Completions",
};

export function copilotQuotaFromJson(obj: CopilotUserResponse): QuotaItem[] {
  const items: QuotaItem[] = [];
  const resetsAt = obj.quota_reset_date ? Date.parse(obj.quota_reset_date) : undefined;
  const snapshots = obj.quota_snapshots || {};
  for (const [key, snap] of Object.entries(snapshots)) {
    if (!snap) continue;
    const label = SNAPSHOT_LABELS[key] || key;
    items.push({
      label,
      remaining: snap.remaining,
      entitlement: snap.entitlement,
      percentRemaining: snap.percent_remaining,
      unlimited: snap.unlimited,
      resetsAt: Number.isFinite(resetsAt) ? resetsAt : undefined,
    });
  }
  return items;
}

async function fetchCopilotQuota(): Promise<ProviderQuota> {
  const fetchedAt = Date.now();
  const tokenRes = await getTransport().exec("gh", ["auth", "token"]);
  const token = tokenRes.stdout.trim();
  if (tokenRes.code !== 0 || !token) {
    return {
      provider: "copilot",
      status: "unavailable",
      message: translateNow("quota.copilot.needsGh"),
      fetchedAt,
      items: [],
    };
  }

  try {
    const res = await getTransport().httpGet("https://api.github.com/copilot_internal/user", {
      Authorization: `token ${token}`,
      Accept: "application/json",
      "User-Agent": "AIS",
    });
    if (res.status === 429) {
      return { provider: "copilot", status: "error", message: translateNow("quota.rateLimited"), rateLimited: true, fetchedAt, items: [] };
    }
    if (res.status !== 200) {
      return { provider: "copilot", status: "error", message: `HTTP ${res.status}`, fetchedAt, items: [] };
    }
    const obj = JSON.parse(res.body) as CopilotUserResponse;
    return { provider: "copilot", status: "ok", fetchedAt, items: copilotQuotaFromJson(obj) };
  } catch (e) {
    return { provider: "copilot", status: "error", message: e instanceof Error ? e.message : String(e), fetchedAt, items: [] };
  }
}

// ---------------------------------------------------------------------------------------------
// Claude Code quota: token in ~/.claude/.credentials.json, GET api.anthropic.com/api/oauth/usage.
// ---------------------------------------------------------------------------------------------

interface ClaudeUsageWindow {
  utilization: number;
  resets_at: string;
}

interface ClaudeUsageResponse {
  five_hour?: ClaudeUsageWindow;
  seven_day?: ClaudeUsageWindow;
  seven_day_opus?: ClaudeUsageWindow | null;
  seven_day_sonnet?: ClaudeUsageWindow | null;
}

export function claudeQuotaFromJson(obj: ClaudeUsageResponse): QuotaItem[] {
  const items: QuotaItem[] = [];
  if (obj.five_hour) {
    items.push({
      label: translateNow("quota.claude.window5h"),
      usedPercent: obj.five_hour.utilization,
      resetsAt: Date.parse(obj.five_hour.resets_at),
    });
  }
  if (obj.seven_day) {
    items.push({
      label: translateNow("quota.claude.week"),
      usedPercent: obj.seven_day.utilization,
      resetsAt: Date.parse(obj.seven_day.resets_at),
    });
  }
  if (obj.seven_day_opus) {
    items.push({
      label: translateNow("quota.claude.weekModel", { model: "Opus" }),
      model: "opus",
      usedPercent: obj.seven_day_opus.utilization,
      resetsAt: Date.parse(obj.seven_day_opus.resets_at),
    });
  }
  if (obj.seven_day_sonnet) {
    items.push({
      label: translateNow("quota.claude.weekModel", { model: "Sonnet" }),
      model: "sonnet",
      usedPercent: obj.seven_day_sonnet.utilization,
      resetsAt: Date.parse(obj.seven_day_sonnet.resets_at),
    });
  }
  return items;
}

async function fetchClaudeQuota(): Promise<ProviderQuota> {
  const fetchedAt = Date.now();
  const text = await getTransport().readHomeFile(".claude/.credentials.json");
  if (!text) {
    return { provider: "claude", status: "unavailable", message: translateNow("quota.claude.signIn"), fetchedAt, items: [] };
  }

  let token: string | undefined;
  try {
    const parsed = JSON.parse(text);
    token = parsed?.claudeAiOauth?.accessToken;
  } catch {
    return { provider: "claude", status: "error", message: translateNow("quota.claude.unreadable"), fetchedAt, items: [] };
  }
  if (!token) {
    return { provider: "claude", status: "unavailable", message: translateNow("quota.claude.signIn"), fetchedAt, items: [] };
  }

  try {
    const res = await getTransport().httpGet("https://api.anthropic.com/api/oauth/usage", {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
    });
    if (res.status === 401) {
      return { provider: "claude", status: "error", message: translateNow("quota.claude.expired"), fetchedAt, items: [] };
    }
    if (res.status === 429) {
      return { provider: "claude", status: "error", message: translateNow("quota.rateLimited"), rateLimited: true, fetchedAt, items: [] };
    }
    if (res.status !== 200) {
      return { provider: "claude", status: "error", message: `HTTP ${res.status}`, fetchedAt, items: [] };
    }
    const obj = JSON.parse(res.body) as ClaudeUsageResponse;
    return { provider: "claude", status: "ok", fetchedAt, items: claudeQuotaFromJson(obj) };
  } catch (e) {
    return { provider: "claude", status: "error", message: e instanceof Error ? e.message : String(e), fetchedAt, items: [] };
  }
}

// ---------------------------------------------------------------------------------------------
// Antigravity quota: inferred from run outcomes, because the exact number is not ours to read.
//
// There IS a precise source — the CLI itself calls
// `POST https://daily-cloudcode-pa.googleapis.com/v1internal:retrieveUserQuotaSummary`, which
// returns a remaining fraction or amount and a reset time per bucket. It answers, and an OAuth
// token taken from the Antigravity login is accepted by it. It then refuses with 403
// SUBSCRIPTION_REQUIRED: that summary is behind a paid Code Assist license, and `loadCodeAssist`
// confirms a consumer account is on no tier at all. So there is nothing to fetch for the accounts
// this runs on, and what is left is the "quota reached, resets in 1h45m" the CLI prints when it
// hits the wall — which is what `recordAntigravityOutcome` below reads.
// ---------------------------------------------------------------------------------------------

/** How each pool is written; the word "pool" around it comes from the dictionary. */
const POOL_LABELS: Record<string, string> = {
  gemini: "Gemini",
  claude: "Claude",
  "gpt-oss": "GPT-OSS",
};

async function fetchAntigravityQuota(): Promise<ProviderQuota> {
  const fetchedAt = Date.now();
  const pools = await antigravityQuota();
  const now = Date.now();
  const items: QuotaItem[] = [];
  const knownPools = new Set([...Object.keys(POOL_LABELS), ...Object.keys(pools)]);
  for (const pool of knownPools) {
    const mark = pools[pool];
    const exhausted = mark && mark.exhaustedUntil > now;
    items.push({
      label: translateNow("quota.antigravity.pool", { name: POOL_LABELS[pool] ?? pool }),
      model: pool,
      // Not "unlimited": the pool has a cap, we just don't know its size until it runs out.
      resetsAt: exhausted ? mark.exhaustedUntil : undefined,
      exhausted: !!exhausted,
      note: translateNow(exhausted ? "quota.antigravity.exhausted" : "quota.antigravity.available"),
    });
  }
  return {
    provider: "antigravity",
    status: "ok",
    message: translateNow("quota.antigravity.inferred"),
    fetchedAt,
    items,
  };
}

// ---------------------------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------------------------


// ---------------------------------------------------------------------------------------------
// opencode: what each linked account has been used for.
//
// opencode has no quota to report — the limit belongs to whatever account is behind it (an AI
// Studio key, a Copilot seat, its own free models), and none of them can be asked through it. What
// it does keep is what has gone through each one: `opencode stats --models` prints a table per
// «proveedor/modelo», and `opencode auth list` says which accounts are linked. Grouped by the
// provider half, that is the per-account picture, and an account with nothing spent still shows up
// so a key that was just connected is visibly there.
// ---------------------------------------------------------------------------------------------

/** Everything one linked account has spent, added up over its models. */
export interface OpencodeAccountUsage {
  /** The provider half of «proveedor/modelo»: google, anthropic, opencode… */
  id: string;
  messages: number;
  inputTokens: number;
  outputTokens: number;
  cachedTokens: number;
  costUsd: number;
  models: number;
}

const ANSI_RE = /\u001b\[[0-9;]*m/g;

/** `82.2K` → 82200. The table humanizes its numbers, so this is as exact as the source is. */
export function parseHumanNumber(text: string): number {
  const match = /^\$?([\d.,]+)\s*([KMB])?$/i.exec(text.trim());
  if (!match) return 0;
  const value = Number(match[1].replace(/,/g, ""));
  if (!Number.isFinite(value)) return 0;
  const scale = { k: 1_000, m: 1_000_000, b: 1_000_000_000 }[(match[2] ?? "").toLowerCase()] ?? 1;
  return value * scale;
}

/**
 * The MODEL USAGE table of `opencode stats --models`, added up per account.
 *
 * Every row belongs to a model written «proveedor/modelo», and the rows that follow it are its
 * counters until the next model. Anything outside that table is ignored, so the overview and the
 * tool usage above it never leak in.
 */
export function parseOpencodeStats(stdout: string): OpencodeAccountUsage[] {
  const lines = stdout.replace(ANSI_RE, "").split(/\r?\n/);
  const start = lines.findIndex(line => line.includes("MODEL USAGE"));
  if (start < 0) return [];

  const byAccount = new Map<string, OpencodeAccountUsage>();
  let current: OpencodeAccountUsage | undefined;

  for (const raw of lines.slice(start + 1)) {
    const line = raw.replace(/[│┌┐└┘├┤─]/g, " ").trim();
    if (!line) continue;
    // A model row: «proveedor/modelo» on its own.
    const model = /^([\w.-]+)\/([\w.:-]+)$/.exec(line);
    if (model) {
      const id = model[1].toLowerCase();
      current = byAccount.get(id) ?? { id, messages: 0, inputTokens: 0, outputTokens: 0, cachedTokens: 0, costUsd: 0, models: 0 };
      current.models++;
      byAccount.set(id, current);
      continue;
    }
    if (!current) continue;
    const counter = /^(Messages|Input Tokens|Output Tokens|Cache Read|Cache Write|Cost)\s+(.+)$/.exec(line);
    if (!counter) {
      // The table is over: what follows belongs to another section.
      if (/^[A-Z][A-Z ]+$/.test(line)) break;
      continue;
    }
    const value = parseHumanNumber(counter[2]);
    if (counter[1] === "Messages") current.messages += value;
    else if (counter[1] === "Input Tokens") current.inputTokens += value;
    else if (counter[1] === "Output Tokens") current.outputTokens += value;
    else if (counter[1] === "Cache Read" || counter[1] === "Cache Write") current.cachedTokens += value;
    else if (counter[1] === "Cost") current.costUsd += value;
  }
  return [...byAccount.values()];
}

/** The accounts `opencode auth list` says are linked: `●  Google api`. */
export function parseOpencodeAccounts(stdout: string): Array<{ id: string; label: string }> {
  const out: Array<{ id: string; label: string }> = [];
  for (const raw of stdout.replace(ANSI_RE, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line.startsWith("●")) continue;
    // «Google api» / «GitHub Copilot oauth»: the last word is how it was authenticated.
    const rest = line.slice(1).trim().replace(/\s+(api|oauth|wellknown)$/i, "").trim();
    if (!rest) continue;
    out.push({ id: rest.toLowerCase().replace(/[^a-z0-9]/g, ""), label: rest });
  }
  return out;
}

/** Two names for the same account: «GitHub Copilot» from auth, `github-copilot` from a model id. */
function sameAccount(a: string, b: string): boolean {
  const norm = (text: string) => text.toLowerCase().replace(/[^a-z0-9]/g, "");
  return norm(a) === norm(b);
}

async function fetchOpencodeQuota(binaries?: Binaries): Promise<ProviderQuota> {
  const fetchedAt = Date.now();
  const program = binaries?.opencode?.path ?? "opencode";
  const [stats, auth] = await Promise.all([
    getTransport().exec(program, ["stats", "--models"]).catch(() => null),
    getTransport().exec(program, ["auth", "list"]).catch(() => null),
  ]);
  if (!stats || stats.code !== 0) {
    return { provider: "opencode", status: "unavailable", message: translateNow("quota.opencode.unreadable"), fetchedAt, items: [] };
  }

  const usage = parseOpencodeStats(stats.stdout);
  const linked = auth && auth.code === 0 ? parseOpencodeAccounts(auth.stdout) : [];
  const items: QuotaItem[] = [];

  for (const account of usage) {
    const label = linked.find(l => sameAccount(l.id, account.id))?.label ?? account.id;
    items.push({
      label,
      model: account.id,
      note: translateNow("quota.opencode.usage", {
        messages: account.messages,
        input: formatTokens(account.inputTokens),
        output: formatTokens(account.outputTokens),
        cost: formatUsd(account.costUsd),
      }),
    });
  }
  // A key that was just linked has spent nothing, and saying so beats leaving it out.
  for (const account of linked) {
    if (usage.some(u => sameAccount(u.id, account.id))) continue;
    items.push({ label: account.label, model: account.id, note: translateNow("quota.opencode.noUsageYet") });
  }

  return {
    provider: "opencode",
    status: "ok",
    // opencode counts what was spent; the ceiling belongs to the account behind it.
    message: translateNow("quota.opencode.noLimits"),
    fetchedAt,
    items,
  };
}

/** `82200` → `82.2K`, the same shorthand opencode's own table uses. */
function formatTokens(value: number): string {
  if (value >= 1_000_000) return `${(value / 1_000_000).toFixed(1)}M`;
  if (value >= 1_000) return `${(value / 1_000).toFixed(1)}K`;
  return String(Math.round(value));
}

function formatUsd(value: number): string {
  return value >= 0.01 ? `US$${value.toFixed(2)}` : "US$0";
}

/**
 * How long an answer is reused. Quota moves in minutes, not in seconds, and the app asks from
 * four places at once: the rings when they mount, the agent dialog, the timer, and the sweep that
 * follows every run. Without this each of those was a request of its own.
 */
export const QUOTA_CACHE_MS = 60_000;
/** After a 429, the provider is left alone for this long and the last good answer is what shows. */
export const QUOTA_BACKOFF_MS = 5 * 60_000;

interface CacheEntry {
  /** The newest answer, whatever it said. */
  result: ProviderQuota;
  /** The newest answer that actually carried numbers, kept to show while a 429 lasts. */
  lastOk?: ProviderQuota;
  /** Nothing is asked of this provider before this time. */
  backoffUntil?: number;
}

const cache = new Map<ProviderId, CacheEntry>();
/** One request per provider: everyone who asks while it is in flight gets the same answer. */
const inFlight = new Map<ProviderId, Promise<ProviderQuota>>();

/** Forgets everything read so far. For the tests, and for a config that changed under us. */
export function clearQuotaCache(): void {
  cache.clear();
  inFlight.clear();
}

async function readQuota(provider: ProviderId, binaries?: Binaries): Promise<ProviderQuota> {
  try {
    if (provider === "copilot") return await fetchCopilotQuota();
    if (provider === "claude") return await fetchClaudeQuota();
    if (provider === "antigravity") return await fetchAntigravityQuota();
    if (provider === "opencode") return await fetchOpencodeQuota(binaries);
    return {
      provider,
      status: "unavailable",
      message: translateNow("quota.unsupported"),
      fetchedAt: Date.now(),
      items: [],
    };
  } catch (e) {
    return { provider, status: "error", message: e instanceof Error ? e.message : String(e), fetchedAt: Date.now(), items: [] };
  }
}

/**
 * What a provider has left. Shared between callers and cached for a minute; `force` is for the
 * button that says "refresh", which is the user asking on purpose.
 *
 * A provider that answered 429 is not asked again for `QUOTA_BACKOFF_MS`, and what it said last
 * time it worked is what comes back — numbers a few minutes old beat an error where they go.
 */
export async function fetchQuota(
  provider: ProviderId,
  binaries?: Binaries,
  opts?: { force?: boolean },
): Promise<ProviderQuota> {
  const now = Date.now();
  const entry = cache.get(provider);

  if (entry && !opts?.force) {
    if (now - entry.result.fetchedAt < QUOTA_CACHE_MS) return entry.result;
    if (entry.backoffUntil !== undefined && now < entry.backoffUntil) {
      return entry.lastOk ?? entry.result;
    }
  }

  const pending = inFlight.get(provider);
  if (pending) return pending;

  const promise = readQuota(provider, binaries)
    .then(result => {
      const previous = cache.get(provider);
      if (result.rateLimited) {
        const kept = previous?.lastOk;
        cache.set(provider, { result, lastOk: kept, backoffUntil: Date.now() + QUOTA_BACKOFF_MS });
        return kept ?? result;
      }
      cache.set(provider, {
        result,
        lastOk: result.status === "ok" ? result : previous?.lastOk,
      });
      return result;
    })
    .finally(() => {
      inFlight.delete(provider);
    });

  inFlight.set(provider, promise);
  return promise;
}

// ---------------------------------------------------------------------------------------------
// Formatting helpers shared by the UI and the CLI.
// ---------------------------------------------------------------------------------------------

/** Localized "D/M HH:MM" for the app UI. */
export function formatResetsAt(ms?: number): string | undefined {
  if (ms === undefined || Number.isNaN(ms)) return undefined;
  return new Date(ms).toLocaleString(activeLocale(), { day: "numeric", month: "numeric", hour: "2-digit", minute: "2-digit" });
}

/** Plain-text rendering of a single quota row, used by `ainess quota`. */
export function formatQuotaLine(item: QuotaItem): string {
  const bits: string[] = [`${item.label}:`];
  if (item.unlimited) {
    bits.push(translateNow("quota.line.unlimited"));
  } else if (item.entitlement !== undefined && item.remaining !== undefined) {
    const pct = item.percentRemaining !== undefined ? ` (${Math.round(item.percentRemaining)}%)` : "";
    bits.push(`${item.remaining}/${item.entitlement}${pct}`);
  } else if (item.usedPercent !== undefined) {
    bits.push(translateNow("quota.usedPercent", { percent: item.usedPercent }));
  } else if (item.note) {
    bits.push(item.note);
  }
  if (item.resetsAt !== undefined && !Number.isNaN(item.resetsAt)) {
    const d = new Date(item.resetsAt);
    // A midnight-UTC reset came from a date-only field (e.g. copilot's quota_reset_date): show
    // just the date; otherwise it is a real timestamp (e.g. Claude's usage windows).
    const isDateOnly = d.getUTCHours() === 0 && d.getUTCMinutes() === 0;
    const dateStr = d.toISOString().slice(0, 10);
    const when = isDateOnly ? dateStr : `${dateStr} ${d.toISOString().slice(11, 16)}`;
    bits.push(translateNow("quota.line.renews", { date: when }));
  }
  return bits.join(" ");
}
