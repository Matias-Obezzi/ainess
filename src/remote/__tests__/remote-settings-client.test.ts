// The desktop page's configuration screens are the app's own, run against the host: the config is
// asked for apart from the snapshot, the store's actions edit it locally, and only what the user
// changed travels back — except the theme, which belongs to this browser.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import type { AppConfig } from "@/types";
import type { RemoteSnapshot } from "@/lib/remote";
import { REMOTE_THEME_KEY } from "@/lib/remote-settings-keys";
import { useAppStore } from "@/store";
import * as client from "@/remote/remote-settings-client";
import * as remote from "@/remote/remote-client";

const calls: Array<{ path: string; body?: Record<string, unknown> }> = [];
let hostConfig: AppConfig;
let version = 1;

vi.mock("@/remote/remote-client", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/remote/remote-client")>();
  return {
    ...actual,
    api: vi.fn(async (path: string, body?: Record<string, unknown>) => {
      calls.push({ path, body });
      if (path === "/api/settings" && body?.op === "get") {
        const { remoteConfigView } = await import("@/lib/remote-settings");
        return { version, home: "C:\\Users\\host", config: remoteConfigView(hostConfig) };
      }
      return { ok: true };
    }),
  };
});

function makeHostConfig(): AppConfig {
  return {
    version: 14, language: "es", approveDelegations: false,
    remote: { enabled: true, port: 4710, token: "t", tunnel: { provider: "cloudflared", enabled: false } },
    tray: { enabled: true, notifyApprovals: true, notifyResults: true },
    projects: [{
      id: "p1", name: "Uno", workspaceDir: "C:\\uno", createdAt: 1, sharedContext: "notas del host",
      agents: [{ id: "a1", name: "Claude", provider: "claude", role: "planner", parentId: null, autoApprove: true, systemPrompt: "sé breve" }],
    }],
    formations: [{ id: "f1", name: "Equipo", agents: [] }], defaultFormationId: null, lastProjectId: "p1",
    maxRounds: 6, maxConcurrentRuns: 0, skills: [], sharedContext: "", binaryOverrides: {},
    mcpServers: [{ id: "m1", name: "GitHub", transport: "stdio", command: "npx", env: { TOKEN: "secret" }, enabledFor: "all" }],
    profile: { name: "Host", about: "", preferences: "" }, presets: [], autoModel: false, hooks: [], chats: [],
    logLevel: "info", autoUpdateCheck: true, autoArchiveDoneDays: null,
  } as AppConfig;
}

function snapshot(): RemoteSnapshot {
  return {
    serverTime: Date.now(), language: "es",
    projects: [{ id: "p1", name: "Uno", workspaceDir: "C:\\uno", createdAt: 1, activeTaskRunId: null, running: 0 }],
    agents: [{ id: "a1", name: "Claude", provider: "claude", role: "planner", parentId: null, projectId: "p1" }],
    runtime: {}, messages: [], approvals: [], questions: [], runs: [], chats: [], chatMessages: {},
    binaries: {}, activeChats: [], tasks: [], quota: {}, configVersion: version,
  };
}

/** The store as a page that has not connected yet has it, actions included. */
const pristine = useAppStore.getState();

function boot() {
  client.resetRemoteSettings();
  useAppStore.setState(pristine, true);
  return { store: useAppStore, client, remote };
}

const settingsUpdates = () => calls.filter(c => c.path === "/api/settings" && c.body?.op === "update").map(c => c.body!.patch);

describe("the desktop page's settings", () => {
  const storage = new Map<string, string>();

  beforeEach(() => {
    calls.length = 0;
    version = 1;
    hostConfig = makeHostConfig();
    storage.clear();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => storage.get(k) ?? null,
      setItem: (k: string, v: string) => { storage.set(k, v); },
      removeItem: (k: string) => { storage.delete(k); },
    });
  });

  afterEach(() => { vi.unstubAllGlobals(); });

  it("loads the host's config beside the snapshot, the projects whole and the secrets masked", async () => {
    const { store, client } = boot();
    client.hydrateWithSettings(snapshot());
    await vi.waitFor(() => expect(store.getState().config.profile.name).toBe("Host"));

    const config = store.getState().config;
    expect(config.formations.map(f => f.name)).toEqual(["Equipo"]);
    expect(config.projects[0].sharedContext).toBe("notas del host");
    expect(config.projects[0].agents[0]).toMatchObject({ systemPrompt: "sé breve", autoApprove: true });
    expect(config.mcpServers[0].env?.TOKEN).not.toBe("secret");
  });

  it("asks again only when the snapshot says the config moved", async () => {
    const { store, client } = boot();
    client.hydrateWithSettings(snapshot());
    await vi.waitFor(() => expect(store.getState().config.profile.name).toBe("Host"));
    const gets = () => calls.filter(c => c.body?.op === "get").length;
    expect(gets()).toBe(1);

    client.hydrateWithSettings(snapshot());
    expect(gets()).toBe(1);

    version = 2;
    hostConfig.profile = { name: "Otro", about: "", preferences: "" };
    client.hydrateWithSettings(snapshot());
    await vi.waitFor(() => expect(store.getState().config.profile.name).toBe("Otro"));
  });

  it("sends what the user changed and nothing the host poured in", async () => {
    const { store, client } = boot();
    client.hydrateWithSettings(snapshot());
    await vi.waitFor(() => expect(store.getState().config.profile.name).toBe("Host"));
    client.installRemoteSettings();

    store.getState().updateConfig({ profile: { name: "Bruno", about: "", preferences: "" } });
    store.getState().setSharedContext("p1", "notas nuevas");
    await store.getState().saveConfig();

    expect(settingsUpdates()).toEqual([{
      config: { profile: { name: "Bruno", about: "", preferences: "" } },
      projects: [{ id: "p1", sharedContext: "notas nuevas" }],
    }]);
  });

  it("keeps an edit on its way when a snapshot lands before it is sent", async () => {
    const { store, client } = boot();
    client.hydrateWithSettings(snapshot());
    await vi.waitFor(() => expect(store.getState().config.profile.name).toBe("Host"));
    client.installRemoteSettings();

    store.getState().setSharedContext("p1", "a medio guardar");
    client.hydrateWithSettings(snapshot());
    expect(store.getState().config.projects[0].sharedContext).toBe("a medio guardar");
  });

  it("keeps the theme in this browser and never sends it", async () => {
    const { store, client } = boot();
    client.hydrateWithSettings(snapshot());
    await vi.waitFor(() => expect(store.getState().config.profile.name).toBe("Host"));
    client.installRemoteSettings();

    const theme = { preset: "nord", vars: { primary: "#88c0d0" } };
    store.getState().updateConfig({ theme });
    await store.getState().saveConfig();

    expect(JSON.parse(storage.get(REMOTE_THEME_KEY)!)).toEqual(theme);
    expect(settingsUpdates()).toEqual([]);

    // A new page starts on it, and the host's config does not take it away.
    boot();
    client.restoreRemoteTheme();
    client.hydrateWithSettings(snapshot());
    await vi.waitFor(() => expect(store.getState().config.profile.name).toBe("Host"));
    expect(store.getState().config.theme).toEqual(theme);
  });

  it("leaves deleting a project to the host", async () => {
    const { store, client } = boot();
    client.hydrateWithSettings(snapshot());
    await vi.waitFor(() => expect(store.getState().config.profile.name).toBe("Host"));
    client.installRemoteSettings();

    store.getState().removeProject("p1");
    await vi.waitFor(() => expect(calls.some(c => c.body?.op === "removeProject" && c.body.projectId === "p1")).toBe(true));
    expect(settingsUpdates()).toEqual([]);
  });

  it("puts the host's values back when the host refuses a change", async () => {
    const { store, client, remote } = boot();
    client.hydrateWithSettings(snapshot());
    await vi.waitFor(() => expect(store.getState().config.profile.name).toBe("Host"));
    client.installRemoteSettings();

    vi.mocked(remote.api).mockImplementationOnce(async () => { throw new Error("no"); });
    store.getState().updateConfig({ maxRounds: 9 });
    await store.getState().saveConfig();
    expect(store.getState().config.maxRounds).toBe(6);
  });
});
