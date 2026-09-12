// Node implementation of the tunnel commands (used by `ainess serve --tunnel`).
// Mirrors src-tauri/src/tunnel.rs: spawn the binary hidden, read its output until the public
// URL shows up (30 s timeout) and keep the child so it can be stopped and killed on exit.
import { spawn, spawnSync, ChildProcess } from "node:child_process";
import { translateNow } from "@/i18n/useT";
import * as readline from "node:readline";
import {
  extractTunnelUrl,
  isTunnelProvider,
  ngrokDomainFlag,
  tunnelArgs,
  tunnelBinary,
  type NgrokDomainFlag,
  type TunnelOptions,
  type TunnelProvider,
} from "@/lib/tunnel";

const URL_TIMEOUT_MS = 30_000;

let child: ChildProcess | null = null;
let publicUrl: string | null = null;
let currentProvider: TunnelProvider | null = null;

function killTree(c: ChildProcess): void {
  if (process.platform === "win32" && c.pid) {
    spawnSync("taskkill", ["/PID", String(c.pid), "/T", "/F"], { windowsHide: true });
  }
  try {
    c.kill(process.platform === "win32" ? "SIGKILL" : "SIGTERM");
  } catch {
    /* already gone */
  }
}

/** Kills the tunnel synchronously; safe to call from a process exit handler. */
export function killTunnelSync(): void {
  if (child) killTree(child);
  child = null;
  publicUrl = null;
  currentProvider = null;
}

function which(name: string): string | null {
  const res = spawnSync(process.platform === "win32" ? "where" : "which", [name], {
    encoding: "utf-8",
    windowsHide: true,
  });
  if (res.status === 0 && res.stdout) {
    const first = res.stdout.split(/\r?\n/).find(l => l.trim().length > 0);
    if (first) return first.trim();
  }
  return null;
}

async function detect(): Promise<{ cloudflared: string | null; ngrok: string | null }> {
  const { wingetCandidates, registryPathCandidates } = await import("@/lib/transport-node");
  const fs = await import("node:fs");
  // An uninstall can leave the folder or a dangling link behind: only a real file counts.
  const isFile = (p: string): boolean => {
    try { return fs.statSync(p).isFile(); } catch { return false; }
  };
  const find = (name: string): string | null =>
    which(name) ?? [...wingetCandidates(name), ...registryPathCandidates(name)].find(isFile) ?? null;
  return { cloudflared: find("cloudflared"), ngrok: find("ngrok") };
}

/**
 * Which fixed-hostname flag this ngrok build takes. Asking the binary beats guessing from the
 * version: passing the wrong one kills the tunnel with "unknown flag".
 */
function probeNgrokFlag(program: string): NgrokDomainFlag {
  const res = spawnSync(program, ["http", "--help"], { encoding: "utf-8", windowsHide: true });
  const help = `${res.stdout ?? ""}${res.stderr ?? ""}`;
  return help ? ngrokDomainFlag(help) : "--domain";
}

export const nodeTunnel = {
  tunnelStart: async (provider: string, port: number, opts?: TunnelOptions): Promise<{ url: string }> => {
    if (child && publicUrl) return { url: publicUrl };
    const p: TunnelProvider = isTunnelProvider(provider) ? provider : "cloudflared";
    const bin = tunnelBinary(p);
    const paths = await detect();
    const program = p === "ngrok" ? paths.ngrok : paths.cloudflared;
    if (!program) throw new Error(translateNow("tunnel.binaryMissing", { bin }));

    const args = tunnelArgs(p, port, p === "ngrok" ? { ...opts, ngrokFlag: probeNgrokFlag(program) } : opts);
    const proc = spawn(program, args, { stdio: ["ignore", "pipe", "pipe"], windowsHide: true });
    const tail: string[] = [];

    const url = await new Promise<string>((resolve, reject) => {
      let settled = false;
      const finish = (fn: () => void) => {
        if (settled) return;
        settled = true;
        clearTimeout(timer);
        fn();
      };
      const timer = setTimeout(() => {
        finish(() => {
          killTree(proc);
          reject(new Error(translateNow("tunnel.noUrl", { bin, tail: tail.join(" | ") })));
        });
      }, URL_TIMEOUT_MS);

      const onLine = (line: string) => {
        const found = extractTunnelUrl(p, line, opts);
        if (found) {
          finish(() => resolve(found));
          return;
        }
        if (line.trim()) {
          tail.push(line.trim());
          if (tail.length > 8) tail.shift();
        }
      };
      for (const stream of [proc.stdout, proc.stderr]) {
        if (stream) readline.createInterface({ input: stream, crlfDelay: Infinity }).on("line", onLine);
      }
      proc.on("error", err => finish(() => reject(new Error(`No se pudo iniciar \`${bin}\`: ${err.message}`))));
      proc.on("close", code => {
        const hint = p === "ngrok" && tail.some(l => l.includes("authtoken"))
          ? translateNow("tunnel.authtokenHint")
          : "";
        finish(() => reject(new Error(translateNow("tunnel.exited", { bin, code: code ?? "?", hint, tail: tail.join(" | ") }))));
      });
    });

    child = proc;
    publicUrl = url;
    currentProvider = p;
    proc.on("close", () => {
      if (child === proc) killTunnelSync();
    });
    return { url };
  },

  tunnelStop: async (): Promise<void> => {
    killTunnelSync();
  },

  tunnelStatus: async (): Promise<{ running: boolean; url?: string; provider?: string }> => ({
    running: !!child,
    url: publicUrl ?? undefined,
    provider: currentProvider ?? undefined,
  }),

  tunnelDetect: detect,
};
