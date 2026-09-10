export interface Transport {
  /** Starts a run. Answers with the process behind it where the platform can say (the app). */
  spawnRun(opts: import("@/types").SpawnOptions): Promise<import("@/types").SpawnedProcess | void>;
  /**
   * Kills the CLI processes a crashed instance left running, and answers with the ids of the runs
   * it actually killed. A process is only killed when it is still the one that run started.
   */
  reapOrphans(orphans: Array<{ runId: string; pid: number; image: string; startedAt: number }>): Promise<string[]>;
  killRun(runId: string): Promise<boolean>;
  onRunOutput(h: (e: import("@/types").RunOutputEvent) => void): Promise<() => void>;
  onRunExit(h: (e: import("@/types").RunExitEvent) => void): Promise<() => void>;
  loadConfig(): Promise<import("@/types").AppConfig | null>;
  saveConfig(config: import("@/types").AppConfig): Promise<void>;
  detectBinaries(): Promise<import("@/types").Binaries>;
  writeTextFile(relativePath: string, content: string): Promise<string>;
  readTextFile(relativePath: string): Promise<string | null>;
  /** `timeoutSecs` defaults to 60; raise it for installers and other slow commands. */
  exec(program: string, args: string[], cwd?: string, timeoutSecs?: number): Promise<{ code: number | null, stdout: string, stderr: string }>;
  httpPost(url: string, body: string, headers: Record<string,string>): Promise<{ status: number; body: string }>;
  httpGet(url: string, headers: Record<string,string>): Promise<{ status: number; body: string }>;
  /** Reads a file relative to the user's home directory (read-only, rejects `..`). */
  readHomeFile(relativePath: string): Promise<string | null>;
  /** Reads a file by absolute path (read-only). Null when missing or unreadable. */
  readFileAbs(path: string): Promise<string | null>;

  /**
   * Which of `paths` are files that exist. Read-only, and it reads none of them — asking
   * `readFileAbs` instead would drag a multi-megabyte lockfile across just to learn its name.
   */
  filesExistAbs(paths: string[]): Promise<string[]>;

  /** Writes a file by absolute path, creating its folder. For the `.ainess/` folder of a project. */
  writeFileAbs(path: string, content: string): Promise<void>;

  /** Writes a file that is not text (an attached image, a PDF), passed base64-encoded. */
  writeFileBytes(path: string, dataB64: string): Promise<void>;

  // Read-only probes for the diagnostics section and `ainess doctor`.
  /**
   * Size, file count and writability of one folder of the app's own storage: the logs folder
   * (`scope` "logs") or the config folder (`scope` "config", optionally narrowed by
   * `relativePath`). Null where there is no filesystem (browser preview, phone build).
   */
  storageStat(scope: "logs" | "config", relativePath?: string): Promise<import("@/types").StorageStat | null>;
  /** True when nothing is listening on `port` here. Null when it cannot be checked. */
  portAvailable(port: number): Promise<boolean | null>;

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

  /**
   * Watches a project's folder and reports back when the repository changed (see
   * src-tauri/src/repo_watch.rs). Only the desktop app can: the CLI and the phone answer nothing
   * and their callers fall back to asking every so often.
   */
  /** Removes a file of the config dir. Missing is not an error. */
  deleteFile(relativePath: string): Promise<void>;

  repoWatchStart(projectId: string, path: string): Promise<void>;
  repoWatchStop(projectId: string): Promise<void>;
  onRepoChanged(h: (e: { projectId: string }) => void): Promise<() => void>;
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
