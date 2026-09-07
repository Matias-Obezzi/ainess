// A filesystem event asks for the cheap half of the repo state: the branch and the working tree,
// with no `gh` and no network behind it. The pull requests do not change when a file does, and
// putting a call to GitHub behind every save would make the watcher unusable.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { nullTransport } from "@/lib/transport-null";
import type { AppConfig } from "@/types";

const STATUS = [
  "# branch.oid 6ab9c2f0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6",
  "# branch.head feat/watcher",
  "# branch.upstream origin/feat/watcher",
  "# branch.ab +2 -0",
  "1 .M N... 100644 100644 100644 aaa bbb src/store.ts",
  "",
].join("\n");

function config(): Record<string, unknown> {
  return {
    version: 9,
    approveDelegations: false,
    remote: { enabled: false, port: 4710, token: "t", tunnel: { provider: "cloudflared", enabled: false } },
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

async function boot() {
  vi.resetModules();
  const ran: string[][] = [];
  const { setTransport } = await import("@/lib/transport");
  setTransport({
    ...nullTransport,
    loadConfig: async () => structuredClone(config()) as unknown as AppConfig,
    saveConfig: async () => {},
    exec: async (program: string, args: string[]) => {
      ran.push([program, ...args]);
      if (args[0] === "status") return { code: 0, stdout: STATUS, stderr: "" };
      return { code: 1, stdout: "", stderr: "" };
    },
  });
  const store = await import("@/store");
  await store.useAppStore.getState().init();
  return { store, ran };
}

beforeEach(() => { vi.resetModules(); });

describe("refreshRepoStatus", () => {
  it("reads the working tree with git alone, never the pull requests", async () => {
    const { store, ran } = await boot();
    await store.useAppStore.getState().refreshRepoStatus("p1");

    const state = store.useAppStore.getState().repoState.p1;
    expect(state.status?.branch).toBe("feat/watcher");
    expect(state.status?.dirty).toBe(1);
    expect(state.status?.ahead).toBe(2);
    expect(ran.every(cmd => cmd[0] === "git")).toBe(true);
    expect(ran.some(cmd => cmd[0] === "gh")).toBe(false);
  });

  it("keeps the pull requests that were already read", async () => {
    const { store } = await boot();
    const pr = { number: 7, title: "Un PR", state: "OPEN", isDraft: false, headRefName: "feat/x", url: "u", updatedAt: "now" };
    store.useAppStore.setState(s => ({
      repoState: { ...s.repoState, p1: { isRepo: true, status: null, pullRequests: [pr] as never, fetchedAt: 1 } },
    }));
    await store.useAppStore.getState().refreshRepoStatus("p1");

    const state = store.useAppStore.getState().repoState.p1;
    expect(state.pullRequests).toHaveLength(1);
    expect(state.status?.branch).toBe("feat/watcher");
  });

  it("leaves what it has alone when git says nothing", async () => {
    vi.resetModules();
    const { setTransport } = await import("@/lib/transport");
    setTransport({
      ...nullTransport,
      loadConfig: async () => structuredClone(config()) as unknown as AppConfig,
      saveConfig: async () => {},
      exec: async () => ({ code: 128, stdout: "", stderr: "not a git repository" }),
    });
    const store = await import("@/store");
    await store.useAppStore.getState().init();
    await store.useAppStore.getState().refreshRepoStatus("p1");
    expect(store.useAppStore.getState().repoState.p1).toBeUndefined();
  });
});
