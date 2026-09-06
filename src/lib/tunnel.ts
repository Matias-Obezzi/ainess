// Public tunnel helpers shared by the app, the CLI and the tests. The process itself is
// spawned by the transport (Rust in src-tauri/src/tunnel.rs, node in src/lib/tunnel-node.ts).

export type TunnelProvider = "cloudflared" | "ngrok";

export const TUNNEL_PROVIDERS: TunnelProvider[] = ["cloudflared", "ngrok"];

export function isTunnelProvider(value: unknown): value is TunnelProvider {
  return value === "cloudflared" || value === "ngrok";
}

/** Name of the executable each provider needs on the machine. */
export function tunnelBinary(provider: TunnelProvider): string {
  return provider === "ngrok" ? "ngrok" : "cloudflared";
}

/** winget command shown in the UI when the binary is missing. */
export function tunnelInstallCommand(provider: TunnelProvider): string {
  // The command ngrok documents on its own site; the Store build lands in WindowsApps.
  return provider === "ngrok" ? "winget install ngrok -s msstore" : "winget install Cloudflare.cloudflared";
}

export function tunnelDescription(provider: TunnelProvider): string {
  return provider === "ngrok"
    ? "Requiere una cuenta y un authtoken (`ngrok config add-authtoken …`). El plan gratis incluye un dominio estático: con eso la URL queda fija."
    : "Sin cuenta ni configuración, pero la URL cambia cada vez. Con un named tunnel y un dominio tuyo en Cloudflare, la URL queda fija.";
}

export interface TunnelOptions {
  /** Fixed hostname, with or without scheme; empty means ephemeral. */
  domain?: string;
  /** cloudflared named tunnel. */
  tunnelName?: string;
  /**
   * Which flag this ngrok build takes for a fixed hostname. ngrok renamed it: `--domain` up to
   * 3.15, `--url` from 3.16 on (`--domain` still works but is deprecated). The caller probes the
   * binary with `ngrokDomainFlag` instead of guessing, because the wrong one aborts the tunnel
   * with "unknown flag".
   */
  ngrokFlag?: NgrokDomainFlag;
}

export type NgrokDomainFlag = "--url" | "--domain";

/**
 * Reads `ngrok http --help` and says which fixed-hostname flag that build understands. Only a
 * line that *starts* with the flag counts, so descriptions mentioning "url" do not match.
 */
export function ngrokDomainFlag(helpOutput: string): NgrokDomainFlag {
  return /^[ \t]*--url([ \t=]|$)/m.test(helpOutput) ? "--url" : "--domain";
}

/** `https://Algo.Ngrok-Free.App/` → `algo.ngrok-free.app`. Returns "" when nothing is left. */
export function normalizeDomain(input: string | undefined | null): string {
  if (!input) return "";
  return input
    .trim()
    .replace(/^https?:\/\//i, "")
    .split(/[/?#]/)[0]
    .replace(/\/+$/, "")
    .toLowerCase();
}

/** true when the config is enough for a fixed URL with that provider. */
export function hasFixedUrl(provider: TunnelProvider, opts?: TunnelOptions): boolean {
  const domain = normalizeDomain(opts?.domain);
  if (!domain) return false;
  if (provider === "ngrok") return true;
  return !!opts?.tunnelName?.trim();
}

/** Public URL the tunnel will have when the config is fixed, or null. */
export function fixedUrl(provider: TunnelProvider, opts?: TunnelOptions): string | null {
  if (!hasFixedUrl(provider, opts)) return null;
  return `https://${normalizeDomain(opts?.domain)}`;
}

/** Arguments used to launch the tunnel against the local remote server. */
export function tunnelArgs(provider: TunnelProvider, port: number, opts?: TunnelOptions): string[] {
  if (provider === "ngrok") {
    const base = ["http", String(port), "--log=stdout", "--log-format=json"];
    const domain = normalizeDomain(opts?.domain);
    if (!domain) return base;
    // `--url` wants a full URL, `--domain` the bare hostname.
    return opts?.ngrokFlag === "--domain"
      ? [...base, "--domain", domain]
      : [...base, "--url", `https://${domain}`];
  }
  if (hasFixedUrl(provider, opts)) {
    return ["tunnel", "--url", `http://127.0.0.1:${port}`, "run", opts!.tunnelName!.trim()];
  }
  return ["tunnel", "--url", `http://127.0.0.1:${port}`];
}

/**
 * Public URL out of one output line: `https://<algo>.trycloudflare.com` for cloudflared
 * (printed on stderr), the `url` field of ngrok's `started tunnel` JSON event for ngrok.
 * With a cloudflared named tunnel there is no URL to print: a line marking the connection as
 * registered means the fixed URL is up. Returns null when the line carries no URL.
 */
export function extractTunnelUrl(provider: TunnelProvider, line: string, opts?: TunnelOptions): string | null {
  if (provider === "ngrok") {
    const matches = line.matchAll(/"url"\s*:\s*"([^"]+)"/g);
    for (const m of matches) {
      if (m[1].startsWith("https://")) return m[1];
    }
    return null;
  }
  if (hasFixedUrl(provider, opts)) {
    if (/registered tunnel connection/i.test(line) || /connection [0-9a-f-]{8,} registered/i.test(line)) {
      return fixedUrl(provider, opts);
    }
    return null;
  }
  const m = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  return m ? m[0] : null;
}
