import { Transport } from "./transport";
import { translateNow } from "@/i18n/useT";

const notAvailable = () => translateNow("app.desktopOnly");

/**
 * Transport of the phone build (see src/remote/): the orchestrator runs on the PC, so nothing
 * here can spawn, read or persist anything. The store is filled from the snapshot and every
 * action that does something is replaced by an HTTP call (see src/remote/remote-client.ts).
 * `httpGet`/`httpPost` are real because the browser can do them; the rest is inert.
 */
export const remoteTransport: Transport = {
  spawnRun: async () => {},
  reapOrphans: async () => [],
  killRun: async () => false,
  onRunOutput: async () => () => {},
  onRunExit: async () => () => {},
  loadConfig: async () => null,
  saveConfig: async () => {},
  detectBinaries: async () => ({}),
  writeTextFile: async (path) => path,
  readTextFile: async () => null,
  exec: async () => ({ code: null, stdout: "", stderr: "" }),
  httpPost: async (url, body, headers) => {
    const res = await fetch(url, { method: "POST", headers, body });
    return { status: res.status, body: await res.text() };
  },
  httpGet: async (url, headers) => {
    const res = await fetch(url, { headers });
    return { status: res.status, body: await res.text() };
  },
  readHomeFile: async () => null,
  writeFileAbs: async () => {},
  writeFileBytes: async () => {},
  readFileAbs: async () => null,
  filesExistAbs: async () => [],
  storageStat: async () => null,
  portAvailable: async () => null,
  remoteStart: async () => { throw new Error(notAvailable()); },
  remoteStop: async () => {},
  remoteStatus: async () => ({ running: false, clients: 0 }),
  remotePushState: async () => {},
  onRemoteCommand: async () => () => {},
  setTrayEnabled: async () => {},
  configureTray: async () => {},
  requestAttention: async () => {},
  logAppend: async () => {},
  logsDir: async () => "",
  openLogsDir: async () => { throw new Error(notAvailable()); },
  tunnelStart: async () => { throw new Error(notAvailable()); },
  tunnelStop: async () => {},
  tunnelStatus: async () => ({ running: false }),
  tunnelDetect: async () => ({ cloudflared: null, ngrok: null }),
  ptySpawn: async () => { throw new Error(notAvailable()); },
  ptyWrite: async () => { throw new Error(notAvailable()); },
  ptyResize: async () => { throw new Error(notAvailable()); },
  ptyKill: async () => { throw new Error(notAvailable()); },
  ptyListShells: async () => [],
  onPtyOutput: async () => () => {},
  onPtyExit: async () => () => {},
  deleteFile: async () => {},
  repoWatchStart: async () => {},
  repoWatchStop: async () => {},
  onRepoChanged: async () => () => {},
};
