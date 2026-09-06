// I/O side of the ngrok account integration: shells out to the ngrok CLI, reads `ngrok.yml` and
// calls the ngrok API. Parsing lives in src/lib/ngrok.ts so it can be unit-tested without a
// transport. See PLAN.md for the security rules (credentials never touch ainess's own config or
// the log file).
import { getTransport } from "@/lib/transport";
import { maskSecrets } from "@/lib/logger";
import {
  NGROK_CONFIG_HOME_PATH,
  looksLikeNgrokCredential,
  ngrokApiKey,
  ngrokConfigKeys,
  parseNgrokConfigPath,
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

/** Runs `ngrok config check`, reads the file and reports which credentials are there. */
export async function ngrokAccountStatus(ngrokPath: string): Promise<NgrokAccountStatus> {
  const transport = getTransport();
  let res;
  try {
    res = await transport.exec(ngrokPath, ["config", "check"]);
  } catch (e) {
    return {
      configPath: null,
      hasAuthtoken: false,
      hasApiKey: false,
      error: e instanceof Error ? maskSecrets(e.message) : String(e),
    };
  }

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
