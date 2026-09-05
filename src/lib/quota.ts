// Model lists and remaining-quota lookups per provider. See PLAN.md ("Modelos y cuota") for the
// data sources (endpoints, headers, files) this module relies on.
import { Binaries, ModelInfo, ProviderId, ProviderQuota, QuotaItem } from "@/types";
import { getTransport } from "@/lib/transport";
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
  return PROVIDERS[provider]?.models || [];
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
      message: "Instalá GitHub CLI (gh) e iniciá sesión con `gh auth login`",
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
      label: "Ventana de 5 h",
      usedPercent: obj.five_hour.utilization,
      resetsAt: Date.parse(obj.five_hour.resets_at),
    });
  }
  if (obj.seven_day) {
    items.push({
      label: "Semana",
      usedPercent: obj.seven_day.utilization,
      resetsAt: Date.parse(obj.seven_day.resets_at),
    });
  }
  if (obj.seven_day_opus) {
    items.push({
      label: "Semana (Opus)",
      model: "opus",
      usedPercent: obj.seven_day_opus.utilization,
      resetsAt: Date.parse(obj.seven_day_opus.resets_at),
    });
  }
  if (obj.seven_day_sonnet) {
    items.push({
      label: "Semana (Sonnet)",
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
    return { provider: "claude", status: "unavailable", message: "Iniciá sesión en Claude Code", fetchedAt, items: [] };
  }

  let token: string | undefined;
  try {
    const parsed = JSON.parse(text);
    token = parsed?.claudeAiOauth?.accessToken;
  } catch {
    return { provider: "claude", status: "error", message: "No se pudo leer las credenciales de Claude Code", fetchedAt, items: [] };
  }
  if (!token) {
    return { provider: "claude", status: "unavailable", message: "Iniciá sesión en Claude Code", fetchedAt, items: [] };
  }

  try {
    const res = await getTransport().httpGet("https://api.anthropic.com/api/oauth/usage", {
      Authorization: `Bearer ${token}`,
      "anthropic-beta": "oauth-2025-04-20",
    });
    if (res.status === 401) {
      return { provider: "claude", status: "error", message: "Token vencido: abrí Claude Code para renovarlo", fetchedAt, items: [] };
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
// Antigravity quota: no endpoint, inferred from run outcomes.
// ---------------------------------------------------------------------------------------------

const POOL_LABELS: Record<string, string> = {
  gemini: "Pool Gemini",
  claude: "Pool Claude",
  "gpt-oss": "Pool GPT-OSS",
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
      label: POOL_LABELS[pool] || `Pool ${pool}`,
      model: pool,
      unlimited: !exhausted,
      resetsAt: exhausted ? mark.exhaustedUntil : undefined,
      note: exhausted ? undefined : "Disponible",
    });
  }
  return {
    provider: "antigravity",
    status: "ok",
    message: "Antigravity no expone la cuota: se infiere de los errores de los runs.",
    fetchedAt,
    items,
  };
}

// ---------------------------------------------------------------------------------------------
// Entry point.
// ---------------------------------------------------------------------------------------------

export async function fetchQuota(provider: ProviderId): Promise<ProviderQuota> {
  try {
    if (provider === "copilot") return await fetchCopilotQuota();
    if (provider === "claude") return await fetchClaudeQuota();
    if (provider === "antigravity") return await fetchAntigravityQuota();
    return {
      provider,
      status: "unavailable",
      message: "Este proveedor no expone su cuota",
      fetchedAt: Date.now(),
      items: [],
    };
  } catch (e) {
    return { provider, status: "error", message: e instanceof Error ? e.message : String(e), fetchedAt: Date.now(), items: [] };
  }
}
