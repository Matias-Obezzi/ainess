import { Transport } from "./transport";

export const nullTransport: Transport = {
  spawnRun: async () => {},
  killRun: async () => false,
  onRunOutput: async () => () => {},
  onRunExit: async () => () => {},
  loadConfig: async () => null,
  saveConfig: async () => {},
  detectBinaries: async () => ({}),
  writeTextFile: async (path) => path,
  readTextFile: async () => null,
  exec: async (_program, _args, _cwd) => ({ code: null, stdout: "", stderr: "" }),
  httpPost: async () => { throw new Error("null transport"); }
};
