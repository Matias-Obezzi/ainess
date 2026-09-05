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
};
