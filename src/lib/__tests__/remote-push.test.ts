// What reaches the phone while it is connected. The server lives in the backend and outlives a
// reload of the frontend, so this process can come back with the page still connected: if nobody
// wires the store to that server again, nothing is ever pushed and the phone keeps the state it
// had — a project created afterwards never shows up there.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { nullTransport } from "@/lib/transport-null";
import type { AppConfig } from "@/types";
import type { RemoteSnapshot } from "@/lib/remote";

function baseConfig(): Record<string, unknown> {
  return {
    version: 9,
    approveDelegations: true,
    remote: { enabled: true, port: 4710, token: "t", tunnel: { provider: "cloudflared", enabled: false } },
    tray: { enabled: true, notifyApprovals: true, notifyResults: true },
    agents: [],
    projects: [{ id: "p1", name: "Uno", workspaceDir: "C:\\uno", createdAt: 1 }],
    lastProjectId: "p1",
    maxRounds: 6,
    skills: [],
    mcpServers: [],
    hooks: [],
    sharedContext: "",
    binaryOverrides: {},
    profile: { name: "", about: "", preferences: "" },
    presets: [],
    autoModel: false,
    chats: [],
    logLevel: "info",
    autoUpdateCheck: true,
  };
}

/** @param alreadyRunning what the backend answers: true stands for "the frontend just reloaded". */
async function boot(alreadyRunning: boolean) {
  vi.resetModules();
  const pushed: RemoteSnapshot[] = [];
  const started: number[] = [];
  const { setTransport } = await import("@/lib/transport");
  setTransport({
    ...nullTransport,
    loadConfig: async () => structuredClone(baseConfig()) as unknown as AppConfig,
    saveConfig: async () => {},
    remoteStatus: async () => ({ running: alreadyRunning, clients: alreadyRunning ? 1 : 0 }),
    remoteStart: async (port: number) => { started.push(port); return { url: "http://192.168.0.2:4710", ip: "192.168.0.2" }; },
    remotePushState: async (snapshot: unknown) => { pushed.push(snapshot as RemoteSnapshot); },
  });
  const store = await import("@/store");
  await store.useAppStore.getState().init();
  return { store, pushed, started };
}

beforeEach(() => { vi.resetModules(); });

describe("remote push", () => {
  it("pushes a snapshot with the new project when the server was started here", async () => {
    const { store, pushed, started } = await boot(false);
    expect(started).toEqual([4710]);
    const atBoot = pushed.length;

    store.useAppStore.getState().addProject({ name: "Dos", workspaceDir: "C:\\dos" });

    await vi.waitFor(() => expect(pushed.length).toBeGreaterThan(atBoot), { timeout: 2000 });
    expect(pushed[pushed.length - 1].projects.map(p => p.name)).toContain("Dos");
  });

  it("keeps pushing when the server was already up, without starting a second one", async () => {
    const { store, pushed, started } = await boot(true);
    // Adopting it means no second server and a first snapshot right away.
    expect(started).toEqual([]);
    expect(pushed.length).toBeGreaterThan(0);
    const atBoot = pushed.length;

    store.useAppStore.getState().addProject({ name: "Dos", workspaceDir: "C:\\dos" });

    await vi.waitFor(() => expect(pushed.length).toBeGreaterThan(atBoot), { timeout: 2000 });
    expect(pushed[pushed.length - 1].projects.map(p => p.name)).toContain("Dos");
  });
});
