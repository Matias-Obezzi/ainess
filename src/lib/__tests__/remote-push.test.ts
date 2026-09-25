// What reaches the phone while it is connected. The server lives in the backend and outlives a
// reload of the frontend, so this process can come back with the page still connected: if nobody
// wires the store to that server again, nothing is ever pushed and the phone keeps the state it
// had — a project created afterwards never shows up there.
//
// The other half is what is NOT pushed: building a snapshot walks every project and serializes the
// lot on the thread that draws the app, so with no phone connected it is not built at all. That
// only holds while the phone that connects later is brought up to date, which is what most of
// these tests are about.
import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
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

/** How long a wait has to allow for: the push throttle plus a look at the client count. */
const WAIT = 5000;

/** Set by every boot so the watch interval of a finished test is stopped. */
let stopLast: (() => Promise<void>) | null = null;

/**
 * @param alreadyRunning what the backend answers: true stands for "the frontend just reloaded".
 * @param clients how many phones the backend reports; `"fail"` stands for a backend that does not
 *   answer, which has to behave like the old code and push anyway.
 */
async function boot(alreadyRunning: boolean, clients: number | "fail" = 1) {
  vi.resetModules();
  const pushed: string[] = [];
  const started: number[] = [];
  const state = { clients };
  const { setTransport } = await import("@/lib/transport");
  setTransport({
    ...nullTransport,
    loadConfig: async () => structuredClone(baseConfig()) as unknown as AppConfig,
    saveConfig: async () => {},
    remoteStatus: async () => {
      if (state.clients === "fail") throw new Error("no answer");
      return { running: alreadyRunning, clients: state.clients };
    },
    remoteStart: async (port: number) => { started.push(port); return { url: "http://192.168.0.2:4710", ip: "192.168.0.2" }; },
    remotePushState: async (json: string) => { pushed.push(json); },
  });
  const store = await import("@/store");
  await store.useAppStore.getState().init();
  stopLast = () => store.useAppStore.getState().stopRemote();
  const last = () => JSON.parse(pushed[pushed.length - 1]) as RemoteSnapshot;
  return { store, pushed, started, state, last };
}

beforeEach(() => { vi.resetModules(); });
// The client watch is an interval: without this it keeps ticking into the next test's timers.
afterEach(async () => {
  await stopLast?.().catch(() => {});
  stopLast = null;
});

describe("remote push", () => {
  it("pushes a snapshot with the new project when the server was started here", async () => {
    const { store, pushed, started, last } = await boot(false);
    expect(started).toEqual([4710]);
    const atBoot = pushed.length;

    store.useAppStore.getState().addProject({ name: "Dos", workspaceDir: "C:\\dos" });

    await vi.waitFor(() => expect(pushed.length).toBeGreaterThan(atBoot), { timeout: WAIT });
    expect(last().projects.map(p => p.name)).toContain("Dos");
  });

  it("keeps pushing when the server was already up, without starting a second one", async () => {
    const { store, pushed, started, last } = await boot(true);
    // Adopting it means no second server and a first snapshot right away.
    expect(started).toEqual([]);
    expect(pushed.length).toBeGreaterThan(0);
    const atBoot = pushed.length;

    store.useAppStore.getState().addProject({ name: "Dos", workspaceDir: "C:\\dos" });

    await vi.waitFor(() => expect(pushed.length).toBeGreaterThan(atBoot), { timeout: WAIT });
    expect(last().projects.map(p => p.name)).toContain("Dos");
  });

  it("builds nothing while no phone is connected", async () => {
    const { store, pushed } = await boot(false, 0);
    expect(pushed).toEqual([]);

    store.useAppStore.getState().addProject({ name: "Dos", workspaceDir: "C:\\dos" });

    // Long enough for the throttle and for a couple of looks at the client count.
    await new Promise(r => setTimeout(r, 3500));
    expect(pushed).toEqual([]);
  });

  it("sends what happened while nobody was connected as soon as one connects", async () => {
    const { store, pushed, state, last } = await boot(false, 0);
    store.useAppStore.getState().addProject({ name: "Dos", workspaceDir: "C:\\dos" });
    await new Promise(r => setTimeout(r, 500));
    expect(pushed).toEqual([]);

    state.clients = 1;

    await vi.waitFor(() => expect(pushed.length).toBe(1), { timeout: WAIT });
    expect(last().projects.map(p => p.name)).toContain("Dos");
  });

  it("pushes on a phone connecting even with nothing pending", async () => {
    const { pushed, state } = await boot(false, 0);
    // First connection drains the push the boot left pending.
    state.clients = 1;
    await vi.waitFor(() => expect(pushed.length).toBe(1), { timeout: WAIT });

    state.clients = 0;
    await new Promise(r => setTimeout(r, 2000));
    expect(pushed.length).toBe(1);

    // Nothing changed in the store meanwhile, so nothing is pending — but the snapshot the backend
    // is holding is old, and it is what it answers /api/state and the first SSE event with.
    state.clients = 2;
    await vi.waitFor(() => expect(pushed.length).toBe(2), { timeout: WAIT });
    expect(JSON.parse(pushed[1]).serverTime).toBeGreaterThanOrEqual(JSON.parse(pushed[0]).serverTime);
  });

  it("pushes anyway while the client count is unknown", async () => {
    const { store, pushed, last } = await boot(false, "fail");
    // A backend that cannot say how many phones are listening is no reason to freeze one.
    await vi.waitFor(() => expect(pushed.length).toBeGreaterThan(0), { timeout: WAIT });
    const atBoot = pushed.length;

    store.useAppStore.getState().addProject({ name: "Dos", workspaceDir: "C:\\dos" });

    await vi.waitFor(() => expect(pushed.length).toBeGreaterThan(atBoot), { timeout: WAIT });
    expect(last().projects.map(p => p.name)).toContain("Dos");
  });

  it("serializes the snapshot once per push", async () => {
    const { store, pushed } = await boot(false);
    const spy = vi.spyOn(JSON, "stringify");
    const atBoot = pushed.length;

    store.useAppStore.getState().addProject({ name: "Dos", workspaceDir: "C:\\dos" });
    await vi.waitFor(() => expect(pushed.length).toBeGreaterThan(atBoot), { timeout: WAIT });

    // Only the snapshot is counted: the store serializes its config to save it as well.
    const snapshotPasses = spy.mock.calls.filter(([value]) =>
      typeof value === "object" && value !== null && "serverTime" in (value as Record<string, unknown>));
    spy.mockRestore();
    const pushes = pushed.length - atBoot;
    expect(pushes).toBeGreaterThan(0);
    // One pass per push: the size check that decides whether to trim is what produced the bytes.
    expect(snapshotPasses.length).toBe(pushes);
  });
});
