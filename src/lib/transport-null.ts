import { Transport } from "./transport";

// Used by the plain-browser preview (vite dev without Tauri): nothing can run or persist.
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
  httpPost: async () => { throw new Error("null transport"); },
  httpGet: async () => ({ status: 0, body: "" }),
  readHomeFile: async () => null,
  remoteStart: async () => { throw new Error("El acceso remoto no está disponible en el navegador"); },
  remoteStop: async () => {},
  remoteStatus: async () => ({ running: false, clients: 0 }),
  remotePushState: async () => {},
  onRemoteCommand: async () => () => {},
};
