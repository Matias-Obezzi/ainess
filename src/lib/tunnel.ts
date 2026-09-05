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
  return provider === "ngrok" ? "winget install Ngrok.Ngrok" : "winget install Cloudflare.cloudflared";
}

export function tunnelDescription(provider: TunnelProvider): string {
  return provider === "ngrok"
    ? "Requiere una cuenta y un authtoken (`ngrok config add-authtoken …`). La URL es estable en planes pagos."
    : "Sin cuenta ni configuración, pero la URL pública cambia cada vez que prendés el túnel.";
}

/** Arguments used to launch the tunnel against the local remote server. */
export function tunnelArgs(provider: TunnelProvider, port: number): string[] {
  return provider === "ngrok"
    ? ["http", String(port), "--log=stdout", "--log-format=json"]
    : ["tunnel", "--url", `http://127.0.0.1:${port}`];
}

/**
 * Public URL out of one output line: `https://<algo>.trycloudflare.com` for cloudflared
 * (printed on stderr), the `url` field of ngrok's `started tunnel` JSON event for ngrok.
 * Returns null when the line carries no URL.
 */
export function extractTunnelUrl(provider: TunnelProvider, line: string): string | null {
  if (provider === "ngrok") {
    const matches = line.matchAll(/"url"\s*:\s*"([^"]+)"/g);
    for (const m of matches) {
      if (m[1].startsWith("https://")) return m[1];
    }
    return null;
  }
  const m = line.match(/https:\/\/[a-z0-9-]+\.trycloudflare\.com/i);
  return m ? m[0] : null;
}
