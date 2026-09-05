import { invoke } from "@tauri-apps/api/core";
import { listen } from "@tauri-apps/api/event";
import { Transport } from "./transport";
import { ipc, onRunOutput, onRunExit } from "./tauri";

// Every file/exec/http/remote capability goes through real Tauri commands (see src-tauri/src/*.rs).
export const tauriTransport: Transport = {
  spawnRun: async (opts) => ipc.spawnRun(opts),
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
  exec: async (program, args, cwd) =>
    invoke<{ code: number | null; stdout: string; stderr: string }>("exec_capture", { program, args, cwd }),
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

  // The Rust server (src-tauri/src/remote.rs) bridges HTTP requests to this webview:
  // commands arrive as `remote-command` events and are answered with `remote_reply`.
  remoteStart: async (port, token) => invoke<{ url: string; ip: string }>("remote_start", { port, token }),
  remoteStop: async () => invoke<void>("remote_stop"),
  remoteStatus: async () => invoke<{ running: boolean; url?: string; ip?: string; clients: number }>("remote_status"),
  remotePushState: async (snapshot) => invoke<void>("remote_push_state", { snapshot }),
  onRemoteCommand: async (h) =>
    listen<{ id: string; action: string; payload: Record<string, unknown> }>("remote-command", async (ev) => {
      const cmd = ev.payload;
      let result: Record<string, unknown>;
      try {
        result = await h(cmd);
      } catch (e) {
        result = { error: String(e instanceof Error ? e.message : e) };
      }
      await invoke("remote_reply", { id: cmd.id, result }).catch(() => {});
    }),
};
