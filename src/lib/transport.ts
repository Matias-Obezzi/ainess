export interface Transport {
  spawnRun(opts: import("@/types").SpawnOptions): Promise<void>;
  killRun(runId: string): Promise<boolean>;
  onRunOutput(h: (e: import("@/types").RunOutputEvent) => void): Promise<() => void>;
  onRunExit(h: (e: import("@/types").RunExitEvent) => void): Promise<() => void>;
  loadConfig(): Promise<import("@/types").AppConfig | null>;
  saveConfig(config: import("@/types").AppConfig): Promise<void>;
  detectBinaries(): Promise<import("@/types").Binaries>;
  writeTextFile(relativePath: string, content: string): Promise<string>;
  readTextFile(relativePath: string): Promise<string | null>;
  exec(program: string, args: string[], cwd?: string): Promise<{ code: number | null, stdout: string, stderr: string }>;
  httpPost(url: string, body: string, headers: Record<string,string>): Promise<{ status: number; body: string }>;
  httpGet(url: string, headers: Record<string,string>): Promise<{ status: number; body: string }>;
  /** Reads a file relative to the user's home directory (read-only, rejects `..`). */
  readHomeFile(relativePath: string): Promise<string | null>;
  /** Reads a file by absolute path (read-only). Null when missing or unreadable. */
  readFileAbs(path: string): Promise<string | null>;

  // LAN remote access (see src/lib/remote.ts). The server lives in the transport because
  // the orchestrator state lives in this process.
  remoteStart(port: number, token: string): Promise<{ url: string; ip: string }>;
  remoteStop(): Promise<void>;
  remoteStatus(): Promise<{ running: boolean; url?: string; ip?: string; clients: number }>;
  remotePushState(snapshot: unknown): Promise<void>;
  /** Register the single handler that answers commands from remote clients. */
  onRemoteCommand(h: (cmd: { id: string; action: string; payload: Record<string, unknown> }) => Promise<Record<string, unknown>>): Promise<() => void>;

  /** Toggles closing the window to the system tray instead of quitting. No-op outside Tauri. */
  setTrayEnabled(enabled: boolean): Promise<void>;

  /** Appends one line to today's log file (see src/lib/logger.ts). Never throws. */
  logAppend(level: string, source: string, message: string): Promise<void>;
  /** Absolute path of the logs folder. */
  logsDir(): Promise<string>;
  /** Opens the logs folder in the file manager. */
  openLogsDir(): Promise<void>;

  // Public tunnel on top of the LAN server (see src/lib/remote.ts).
  tunnelStart(provider: string, port: number, opts?: import("@/lib/tunnel").TunnelOptions): Promise<{ url: string }>;
  tunnelStop(): Promise<void>;
  tunnelStatus(): Promise<{ running: boolean; url?: string; provider?: string; fixed?: boolean }>;
  /** Absolute path of each tunnel binary, or null when it is not installed. */
  tunnelDetect(): Promise<{ cloudflared: string | null; ngrok: string | null }>;

  // Integrated terminals (see src-tauri/src/pty.rs). Desktop app only.
  ptySpawn(opts: { id: string; shell: string; cwd?: string; cols: number; rows: number }): Promise<void>;
  ptyWrite(id: string, data: string): Promise<void>;
  ptyResize(id: string, cols: number, rows: number): Promise<void>;
  ptyKill(id: string): Promise<void>;
  /** Shells available on this machine, best first. Empty outside the desktop app. */
  ptyListShells(): Promise<import("@/types").ShellInfo[]>;
  onPtyOutput(h: (e: import("@/types").PtyOutputEvent) => void): Promise<() => void>;
  onPtyExit(h: (e: import("@/types").PtyExitEvent) => void): Promise<() => void>;
}

let currentTransport: Transport | null = null;

export function setTransport(t: Transport): void {
  currentTransport = t;
}

import { isTauri } from "./tauri";
import { tauriTransport } from "./transport-tauri";
import { nullTransport } from "./transport-null";

export function getTransport(): Transport {
  if (currentTransport) {
    return currentTransport;
  }
  return isTauri() ? tauriTransport : nullTransport;
}
