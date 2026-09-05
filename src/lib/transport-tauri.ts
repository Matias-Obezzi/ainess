import { invoke } from "@tauri-apps/api/core";
import { Transport } from "./transport";
import { ipc, onRunOutput, onRunExit } from "./tauri";

// Every file/exec/http capability goes through real Tauri commands (see src-tauri/src/*.rs).
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
};
