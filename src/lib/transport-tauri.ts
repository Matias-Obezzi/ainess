import { invoke } from "@tauri-apps/api/core";
import { Transport } from "./transport";
import { ipc, listenOnce, onRunOutput, onRunExit } from "./tauri";
import type { PtyExitEvent, PtyOutputEvent, ShellInfo, StorageStat } from "@/types";

// Every file/exec/http/remote capability goes through real Tauri commands (see src-tauri/src/*.rs).
export const tauriTransport: Transport = {
  spawnRun: async (opts) => ipc.spawnRun(opts),
  reapOrphans: async (orphans) => ipc.reapOrphans(orphans),
  killRun: async (runId) => ipc.killRun(runId),
  onRunOutput: async (h) => onRunOutput(h),
  onRunExit: async (h) => onRunExit(h),
  loadConfig: async () => ipc.loadConfig(),
  saveConfig: async (config) => ipc.saveConfig(config),
  detectBinaries: async () => ipc.detectBinaries(),
  writeTextFile: async (relativePath, content) =>
    invoke<string>("write_config_file", { relativePath, content }),
  readTextFile: async (relativePath) => {
    try {
      return await invoke<string | null>("read_config_file", { relativePath });
    } catch {
      return null;
    }
  },
  exec: async (program, args, cwd, timeoutSecs) =>
    invoke<{ code: number | null; stdout: string; stderr: string }>("exec_capture", { program, args, cwd, timeoutSecs }),
  httpPost: async (url, body, headers) =>
    invoke<{ status: number; body: string }>("http_post", { url, body, headers }),
  httpGet: async (url, headers) =>
    invoke<{ status: number; body: string }>("http_get", { url, headers }),
  readHomeFile: async (relativePath) => {
    try {
      return await invoke<string | null>("read_home_file", { relativePath });
    } catch {
      return null;
    }
  },
  writeFileAbs: async (path, content) => invoke<void>("write_file_abs", { path, content }),
  writeFileBytes: async (path, dataB64) => invoke<void>("write_file_bytes", { path, dataB64 }),

  readFileAbs: async (path) => {
    try {
      return await invoke<string | null>("read_file_abs", { path });
    } catch {
      return null;
    }
  },

  storageStat: async (scope, relativePath) => {
    try {
      return await invoke<StorageStat>("storage_stat", { scope, relativePath: relativePath ?? null });
    } catch {
      return null;
    }
  },
  portAvailable: async (port) => {
    try {
      return await invoke<boolean>("port_available", { port });
    } catch {
      return null;
    }
  },

  // The Rust server (src-tauri/src/remote.rs) bridges HTTP requests to this webview:
  // commands arrive as `remote-command` events and are answered with `remote_reply`.
  remoteStart: async (port, token) => invoke<{ url: string; ip: string }>("remote_start", { port, token }),
  remoteStop: async () => invoke<void>("remote_stop"),
  remoteStatus: async () => invoke<{ running: boolean; url?: string; ip?: string; clients: number }>("remote_status"),
  remotePushState: async (snapshot) => invoke<void>("remote_push_state", { snapshot }),
  onRemoteCommand: async (h) =>
    listenOnce<{ id: string; action: string; payload: Record<string, unknown> }>("remote-command", async (cmd) => {
      let result: Record<string, unknown>;
      try {
        result = await h(cmd);
      } catch (e) {
        result = { error: String(e instanceof Error ? e.message : e) };
      }
      await invoke("remote_reply", { id: cmd.id, result }).catch(() => {});
    }),

  setTrayEnabled: async (enabled) => invoke<void>("set_tray_enabled", { enabled }),

  logAppend: async (level, source, message) => {
    try {
      await invoke<void>("log_append", { level, source, message });
    } catch {
      /* logging must never surface an error */
    }
  },

  logsDir: async () => invoke<string>("logs_dir"),
  openLogsDir: async () => invoke<void>("open_logs_dir"),

  tunnelStart: async (provider, port, opts) =>
    invoke<{ url: string }>("tunnel_start", { provider, port, domain: opts?.domain ?? null, tunnelName: opts?.tunnelName ?? null }),
  tunnelStop: async () => invoke<void>("tunnel_stop"),
  tunnelStatus: async () => invoke<{ running: boolean; url?: string; provider?: string; fixed?: boolean }>("tunnel_status"),
  tunnelDetect: async () => invoke<{ cloudflared: string | null; ngrok: string | null }>("tunnel_detect"),

  ptySpawn: async (opts) => invoke<void>("pty_spawn", opts),
  ptyWrite: async (id, data) => invoke<void>("pty_write", { id, data }),
  ptyResize: async (id, cols, rows) => invoke<void>("pty_resize", { id, cols, rows }),
  ptyKill: async (id) => invoke<void>("pty_kill", { id }),
  ptyListShells: async () => invoke<ShellInfo[]>("pty_list_shells"),
  onPtyOutput: async (h) => listenOnce<PtyOutputEvent>("pty-output", h),
  onPtyExit: async (h) => listenOnce<PtyExitEvent>("pty-exit", h),

  deleteFile: async (relativePath) => invoke<void>("delete_config_file", { relativePath }),

  repoWatchStart: async (projectId, path) => invoke<void>("repo_watch_start", { projectId, path }),
  repoWatchStop: async (projectId) => invoke<void>("repo_watch_stop", { projectId }),
  onRepoChanged: async (h) => listenOnce<{ projectId: string }>("repo-changed", h),
};
