// I/O side of the ngrok account integration: shells out to the ngrok CLI, reads `ngrok.yml` and
// calls the ngrok API. Parsing lives in src/lib/ngrok.ts so it can be unit-tested without a
// transport. See PLAN.md for the security rules (credentials never touch ainess's own config or
// the log file).
import { getTransport } from "@/lib/transport";
import { log, maskSecrets } from "@/lib/logger";
import {
  NGROK_CONFIG_HOME_PATH,
  looksLikeNgrokCredential,
  ngrokApiKey,
  isMissingBinaryError,
  ngrokConfigKeys,
  ngrokUpdateOutcome,
  parseNgrokConfigPath,
  parseNgrokVersion,
  parseReservedDomains,
} from "@/lib/ngrok";

export interface NgrokAccountStatus {
  /** Absolute path of ngrok.yml when it could be located. */
  configPath: string | null;
  hasAuthtoken: boolean;
  hasApiKey: boolean;
  /** Message to show when nothing could be read (ngrok missing, exec unavailable…). */
  error?: string;
}

/** What `installNgrok` is doing, so the UI can narrate it. */
export type NgrokInstallPhase = "installing" | "updating" | "detecting";

/** winget can take a while on a cold source; a version probe never should. */
const INSTALL_TIMEOUT_SECS = 300;

/**
 * Installs ngrok with winget and leaves it on the latest version. Reports each phase as it
 * starts. Throws with the reason when winget is missing or the install fails.
 */
export async function installNgrok(onPhase: (phase: NgrokInstallPhase) => void): Promise<string | null> {
  const transport = getTransport();
  onPhase("installing");
  let res;
  try {
    res = await transport.exec(
      "winget",
      [
        "install",
        "--id", "Ngrok.Ngrok",
        "-e",
        "--accept-package-agreements",
        "--accept-source-agreements",
        "--disable-interactivity",
      ],
      undefined,
      INSTALL_TIMEOUT_SECS,
    );
  } catch (e) {
    throw new Error(`No se pudo ejecutar winget: ${e instanceof Error ? e.message : String(e)}`);
  }
  const output = `${res.stdout}\n${res.stderr}`;
  // winget answers "already installed" with a non-zero code, which is not a failure here.
  if (res.code !== 0 && !/already installed|ya está instalado/i.test(output)) {
    const detail = output.trim().split(/\r?\n/).filter(Boolean).slice(-2).join(" ");
    throw new Error(detail || `winget terminó con código ${res.code}`);
  }

  onPhase("detecting");
  const found = await transport.tunnelDetect();
  if (!found.ngrok) {
    throw new Error("winget terminó pero ngrok sigue sin aparecer. Reiniciá la app y probá de nuevo.");
  }

  onPhase("updating");
  // winget's package lags behind, so the fresh install is brought up to date right away. The
  // updater replaces the binary, so where it ends up is only known after it runs.
  const updated = await ensureNgrokUpToDate(found.ngrok);
  await transport.tunnelDetect().catch(() => null);
  return updated.version;
}

export interface NgrokUpdateState {
  /** `checking` while `ngrok update` runs; the rest is what it ended up doing. */
  status: "checking" | "updated" | "current" | "failed";
  /** Version after the attempt, when it could be read. */
  version: string | null;
  /** Why it failed, already masked. */
  message?: string;
}

let updatePromise: Promise<NgrokUpdateState> | null = null;

/**
 * Keeps the agent current: ngrok refuses to connect when it is older than the minimum its account
 * requires, and winget's package lags behind, so the app runs ngrok's own updater. It runs once per
 * app session; every later caller gets the same result.
 */
export function ensureNgrokUpToDate(ngrokPath = "ngrok"): Promise<NgrokUpdateState> {
  if (!updatePromise) {
    updatePromise = runUpdate(ngrokPath);
    // A failed attempt must not be cached as the session's answer.
    void updatePromise.then(state => {
      if (state.status === "failed") updatePromise = null;
    });
  }
  return updatePromise;
}

type ExecOutcome = { ok: true; stdout: string; stderr: string; code: number | null } | { ok: false; missing: boolean; message: string };

async function runNgrok(path: string, args: string[]): Promise<ExecOutcome> {
  try {
    const res = await getTransport().exec(path, args);
    return { ok: true, stdout: res.stdout, stderr: res.stderr, code: res.code };
  } catch (e) {
    const message = maskSecrets(e instanceof Error ? e.message : String(e));
    return { ok: false, missing: isMissingBinaryError(message), message };
  }
}

async function runUpdate(ngrokPath: string): Promise<NgrokUpdateState> {
  let path = ngrokPath;
  let res = await runNgrok(path, ["update"]);
  if (!res.ok && res.missing) {
    // ngrok's own updater replaces the file, and an uninstall leaves the old path behind, so a
    // path from an earlier detection can be stale. Look the binary up again before giving up.
    const found = await getTransport().tunnelDetect().catch(() => ({ ngrok: null, cloudflared: null }));
    if (!found.ngrok) {
      log.warn("tunnel", "no se pudo actualizar ngrok: no está instalado");
      return { status: "failed", version: null, message: "ngrok no está instalado" };
    }
    path = found.ngrok;
    res = await runNgrok(path, ["update"]);
  }
  if (!res.ok) {
    log.warn("tunnel", `no se pudo actualizar ngrok: ${res.message}`);
    return { status: "failed", version: null, message: res.message };
  }

  const outcome = ngrokUpdateOutcome(`${res.stdout}\n${res.stderr}`, res.code);
  const versionRes = await runNgrok(path, ["--version"]);
  const version = versionRes.ok ? parseNgrokVersion(`${versionRes.stdout}\n${versionRes.stderr}`) : null;
  if (outcome === "failed") {
    const message = maskSecrets((res.stderr || res.stdout || "").trim().split(/\r?\n/).slice(-2).join(" ")) || "no se pudo actualizar";
    log.warn("tunnel", `no se pudo actualizar ngrok: ${message}`);
    return { status: "failed", version, message };
  }
  log.info("tunnel", outcome === "updated" ? `ngrok actualizado${version ? ` a ${version}` : ""}` : "ngrok ya estaba al día");
  return { status: outcome, version };
}

/** Runs `ngrok config check`, reads the file and reports which credentials are there. */
export async function ngrokAccountStatus(ngrokPath: string): Promise<NgrokAccountStatus> {
  const transport = getTransport();
  const probe = await runNgrok(ngrokPath, ["config", "check"]);
  if (!probe.ok) {
    // A missing binary is "not installed", which the Proveedor row already says: no error here.
    return {
      configPath: null,
      hasAuthtoken: false,
      hasApiKey: false,
      error: probe.missing ? undefined : probe.message,
    };
  }
  const res = probe;

  const configPath = parseNgrokConfigPath(res.stdout) ?? parseNgrokConfigPath(res.stderr);

  let yaml: string | null = null;
  if (configPath) {
    yaml = await transport.readFileAbs(configPath);
  } else {
    yaml = await transport.readHomeFile(NGROK_CONFIG_HOME_PATH);
  }

  if (yaml === null) {
    // No config file yet is the normal state for someone who just installed ngrok, not an error.
    return { configPath: configPath, hasAuthtoken: false, hasApiKey: false };
  }

  const keys = ngrokConfigKeys(yaml);
  return { configPath, hasAuthtoken: keys.authtoken, hasApiKey: keys.apiKey };
}

/** `ngrok config add-authtoken|add-api-key <value>`. Throws with the masked stderr on failure. */
export async function saveNgrokCredential(ngrokPath: string, kind: "authtoken" | "api-key", value: string): Promise<void> {
  if (!looksLikeNgrokCredential(value)) {
    throw new Error(kind === "authtoken" ? "Eso no parece un authtoken de ngrok" : "Eso no parece una API key de ngrok");
  }
  const subcommand = kind === "authtoken" ? "add-authtoken" : "add-api-key";
  const res = await getTransport().exec(ngrokPath, ["config", subcommand, value]);
  if (res.code !== 0) {
    throw new Error(maskSecrets(res.stderr || `ngrok config ${subcommand} falló`));
  }
}

/** Reserved domains of the account. Throws a clear error when there is no API key or it is rejected. */
export async function ngrokReservedDomains(ngrokPath: string): Promise<string[]> {
  const transport = getTransport();
  const res = await transport.exec(ngrokPath, ["config", "check"]);
  const configPath = parseNgrokConfigPath(res.stdout) ?? parseNgrokConfigPath(res.stderr);
  const yaml = configPath ? await transport.readFileAbs(configPath) : await transport.readHomeFile(NGROK_CONFIG_HOME_PATH);
  const apiKey = ngrokApiKey(yaml);
  if (!apiKey) {
    throw new Error("Falta la API key de ngrok");
  }

  const httpRes = await transport.httpGet("https://api.ngrok.com/reserved_domains", {
    Authorization: `Bearer ${apiKey}`,
    "ngrok-version": "2",
  });
  if (httpRes.status === 401 || httpRes.status === 403) {
    throw new Error("La API key de ngrok no es válida");
  }
  if (httpRes.status !== 200) {
    throw new Error(`La API de ngrok respondió HTTP ${httpRes.status}`);
  }
  return parseReservedDomains(httpRes.body);
}
