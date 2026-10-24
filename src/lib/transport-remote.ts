import { Transport } from "./transport";
import { translateNow } from "@/i18n/useT";
async function remoteApi(path: string, body?: Record<string, unknown>) {
  const { api } = await import("@/remote/remote-client");
  return api(path, body);
}

const notAvailable = () => translateNow("app.desktopOnly");

/** The host's home folder, as the settings answer said (see src/remote/remote-settings-client.ts). */
let remoteHome: string | null = null;

export function setRemoteHomeDir(home: string | null): void {
  remoteHome = home;
}

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
  // The runs live on the PC: the phone has no pipe of its own to write to.
  writeStdin: async () => false,
  closeStdin: async () => false,
  onRunOutput: async () => () => {},
  onRunExit: async () => () => {},
  loadConfig: async () => null,
  saveConfig: async () => {},
  detectBinaries: async () => ({}),
  whichProgram: async () => null,
  // The adapter is installed on the PC, by the PC.
  acpManagedStatus: async () => null,
  acpManagedEnsure: async () => null,
  acpManagedCancel: async () => {},
  onAcpSetup: async () => () => {},
  writeTextFile: async (path) => path,
  readTextFile: async () => null,
  configFileStamp: async () => null,
  exec: async (program, args, cwd, timeoutSecs) => {
    if (program !== "git" || !cwd) return { code: null, stdout: "", stderr: "" };
    try {
      const res = await remoteApi("/api/fs", { op: "git", args, cwd, timeoutSecs });
      return {
        code: typeof res.code === "number" ? res.code : null,
        stdout: typeof res.stdout === "string" ? res.stdout : "",
        stderr: typeof res.stderr === "string" ? res.stderr : "",
      };
    } catch {
      return { code: null, stdout: "", stderr: "" };
    }
  },
  httpPost: async (url, body, headers) => {
    const res = await fetch(url, { method: "POST", headers, body });
    return { status: res.status, body: await res.text() };
  },
  httpPatch: async (url, body, headers) => {
    const res = await fetch(url, { method: "PATCH", headers, body });
    return { status: res.status, body: await res.text() };
  },
  httpPut: async (url, body, headers) => {
    const res = await fetch(url, { method: "PUT", headers, body });
    return { status: res.status, body: await res.text() };
  },
  httpGet: async (url, headers) => {
    const res = await fetch(url, { headers });
    return { status: res.status, body: await res.text() };
  },
  readHomeFile: async () => null,
  // An extension's command is resolved against the host's home, which is where it runs.
  homeDir: async () => remoteHome,
  installExtension: async () => null,
  removeExtension: async () => {},
  oauthConnect: async () => { throw new Error("connectors sign in from the desktop app"); },
  // Whether the host holds a token, never the token: signing in opens a browser on the host, so it
  // is done there, but the page can tell and can sign out.
  oauthStatus: async (id) => {
    try {
      const res = await remoteApi("/api/settings", { op: "oauthStatus", id });
      return { connected: res.connected === true, expiresAt: typeof res.expiresAt === "number" ? res.expiresAt : null };
    } catch {
      return { connected: false, expiresAt: null };
    }
  },
  oauthAccessToken: async () => null,
  oauthDisconnect: async (id) => {
    await remoteApi("/api/settings", { op: "oauthDisconnect", id });
  },
  listDir: async () => null,
  copySkillDir: async () => {},
  removeSkillDir: async () => {},
  unpackSkill: async () => null,
  clonePluginRepo: async () => null,
  removePluginDir: async () => {},
  realPath: async (path) => path,
  writeFileAbs: async () => {},
  writeFileBytes: async (path, base64) => {
    await remoteApi("/api/fs", { op: "writeBytes", path, base64 });
  },
  readFileAbs: async (path) => {
    try {
      const res = await remoteApi("/api/fs", { op: "readText", path });
      return typeof res.text === "string" ? res.text : null;
    } catch {
      return null;
    }
  },
  readFileBytes: async (path, maxBytes) => {
    try {
      const res = await remoteApi("/api/fs", { op: "readBytes", path, maxBytes });
      return typeof res.data === "string" ? res.data : null;
    } catch {
      return null;
    }
  },
  filesExistAbs: async (paths) => {
    try {
      const res = await remoteApi("/api/fs", { op: "exists", paths });
      return Array.isArray(res.paths) ? (res.paths as string[]) : [];
    } catch {
      return [];
    }
  },
  listSubdirs: async () => [],
  detectEditors: async () => [],
  openInEditor: async () => {},
  storageStat: async () => null,
  portAvailable: async () => null,
  listeningPorts: async () => [],
  killPortProcess: async () => {},
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
