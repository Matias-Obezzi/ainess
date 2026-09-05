import { Transport } from "./transport";

export const nullTransport: Transport = {
  spawnRun: async () => {},
  killRun: async () => false,
  onRunOutput: async () => () => {},
  onRunExit: async () => () => {},
  loadConfig: async () => null,
  saveConfig: async () => {},
  detectBinaries: async () => ({}),
};
