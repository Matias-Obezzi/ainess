import { Transport } from "./transport";
import { ipc, onRunOutput, onRunExit } from "./tauri";

export const tauriTransport: Transport = {
  spawnRun: async (opts) => ipc.spawnRun(opts),
  killRun: async (runId) => ipc.killRun(runId),
  onRunOutput: async (h) => onRunOutput(h),
  onRunExit: async (h) => onRunExit(h),
  loadConfig: async () => ipc.loadConfig(),
  saveConfig: async (config) => ipc.saveConfig(config),
  detectBinaries: async () => ipc.detectBinaries(),
  writeTextFile: async (relativePath, content) => (window as any).__TAURI_INVOKE__("write_config_file", { relativePath, content }),
  exec: async (program, args, cwd) => (window as any).__TAURI_INVOKE__("exec_capture", { program, args, cwd }),
  httpPost: async (url, body, headers) => (window as any).__TAURI_INVOKE__("http_post", { url, body, headers }),
};
