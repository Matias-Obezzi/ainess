// Pure parsing/constants for the ngrok account integration (see src/lib/ngrok-account.ts for the
// I/O side). No secrets are ever logged: the functions here only report *whether* a credential
// is present, never its value (except `ngrokApiKey`, whose result must stay in memory only).

export const NGROK_AUTHTOKEN_URL = "https://dashboard.ngrok.com/get-started/your-authtoken";
export const NGROK_API_KEYS_URL = "https://dashboard.ngrok.com/api-keys";
export const NGROK_DOMAINS_URL = "https://dashboard.ngrok.com/domains";

/** Home-relative fallback when `ngrok config check` cannot be run (Windows). */
export const NGROK_CONFIG_HOME_PATH = "AppData/Local/ngrok/ngrok.yml";

/** `Valid configuration file at C:\...\ngrok.yml` → the path, or null. */
export function parseNgrokConfigPath(output: string): string | null {
  const m = output.match(/Valid configuration file at\s+(.+)/i);
  return m ? m[1].trim() : null;
}

function stripYamlComment(line: string): string {
  // ngrok.yml has no strings that legitimately contain `#`, so a plain split is enough.
  const idx = line.indexOf("#");
  return idx >= 0 ? line.slice(0, idx) : line;
}

/** Value of `key: value` on a (non-comment) line, or null when the key is absent/commented/empty. */
function findYamlValue(yaml: string, key: string): string | null {
  const re = new RegExp(`^\\s*${key}\\s*:\\s*(.*)$`);
  for (const rawLine of yaml.split(/\r?\n/)) {
    const line = stripYamlComment(rawLine);
    const m = line.match(re);
    if (!m) continue;
    const value = m[1].trim().replace(/^['"]|['"]$/g, "").trim();
    if (value) return value;
  }
  return null;
}

/**
 * Which credentials the config file already has, without ever returning their values.
 * Handles both the v2 layout (top level) and the v3 one (under `agent:`), and ignores
 * commented-out lines and keys with an empty value.
 */
export function ngrokConfigKeys(yaml: string | null): { authtoken: boolean; apiKey: boolean } {
  if (!yaml) return { authtoken: false, apiKey: false };
  return {
    authtoken: findYamlValue(yaml, "authtoken") !== null,
    apiKey: findYamlValue(yaml, "api_key") !== null,
  };
}

/** Reads the `api_key` value out of the config file (needed to call the API). null when absent. */
export function ngrokApiKey(yaml: string | null): string | null {
  if (!yaml) return null;
  return findYamlValue(yaml, "api_key");
}

/** `{ reserved_domains: [{ domain }] }` → `["algo.ngrok-free.app"]`. Tolerates a bare array. */
export function parseReservedDomains(body: string): string[] {
  try {
    const parsed = JSON.parse(body);
    const list = Array.isArray(parsed) ? parsed : parsed?.reserved_domains;
    if (!Array.isArray(list)) return [];
    return list
      .map((d: unknown) => (d && typeof d === "object" ? (d as Record<string, unknown>).domain : undefined))
      .filter((d: unknown): d is string => typeof d === "string" && d.length > 0);
  } catch {
    return [];
  }
}

/** `ngrok version 3.20.1` → `3.20.1`, or null when the output says something else. */
export function parseNgrokVersion(output: string): string | null {
  const m = output.match(/\bversion\s+v?(\d+\.\d+\.\d+\S*)/i) ?? output.match(/\bv?(\d+\.\d+\.\d+)\b/);
  return m ? m[1] : null;
}

/** What `ngrok update` did. `current` also covers an output we cannot read: nothing changed. */
export type NgrokUpdateOutcome = "updated" | "current" | "failed";

export function ngrokUpdateOutcome(output: string, code: number | null): NgrokUpdateOutcome {
  if (code !== 0) return "failed";
  const text = output.toLowerCase();
  if (/no update|already|up to date|up-to-date/.test(text)) return "current";
  if (/success|updated|installed|new version/.test(text)) return "updated";
  return "current";
}

/** Cheap paste check before shelling out: non-empty, no whitespace, at least 20 chars. */
export function looksLikeNgrokCredential(value: string): boolean {
  return value.length >= 20 && !/\s/.test(value);
}
