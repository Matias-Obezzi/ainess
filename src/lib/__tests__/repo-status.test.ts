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

async function boot(projectPatch: Record<string, unknown> = {}) {
  vi.resetModules();
  const ran: string[][] = [];
  // Where each git subcommand was run, which is the whole point when the repo is not the workspace.
  const cwds: Record<string, string> = {};
  const { setTransport } = await import("@/lib/transport");
  setTransport({
    ...nullTransport,
    loadConfig: async () => {
      const cfg = structuredClone(config());
      Object.assign((cfg.projects as Record<string, unknown>[])[0], projectPatch);
      return cfg as unknown as AppConfig;
    },
    saveConfig: async () => {},
    exec: async (program: string, args: string[], cwd?: string) => {
      ran.push([program, ...args]);
      cwds[args[0]] = cwd ?? "";
      if (args[0] === "status") return { code: 0, stdout: STATUS, stderr: "" };
      return { code: 1, stdout: "", stderr: "" };
    },
  });
  const store = await import("@/store");
  await store.useAppStore.getState().init();
  return { store, ran, cwds };
}

const LOG = "6ab9c2f0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6 the one commit\n";

/** A store whose git answers the status, the log, both or neither — one knob per half. */
async function bootHalves(ok: { status: boolean; log: boolean }) {
  vi.resetModules();
  const { setTransport } = await import("@/lib/transport");
  setTransport({
    ...nullTransport,
    loadConfig: async () => structuredClone(config()) as unknown as AppConfig,
    saveConfig: async () => {},
    exec: async (_program: string, args: string[]) => {
      const good = args[0] === "status" ? ok.status : args[0] === "log" ? ok.log : false;
      if (!good) return { code: 128, stdout: "", stderr: "not a git repository" };
      return { code: 0, stdout: args[0] === "status" ? STATUS : LOG, stderr: "" };
    },
  });
  const store = await import("@/store");
  await store.useAppStore.getState().init();
  return store;
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

  it("reads the working tree in the repo, not in the workspace above it", async () => {
    const { store, cwds } = await boot({ repoDir: "C:\\uno\\app" });
    await store.useAppStore.getState().refreshRepoStatus("p1");

    expect(cwds.status).toBe("C:\\uno\\app");
    expect(store.useAppStore.getState().repoState.p1.status?.branch).toBe("feat/watcher");
  });

  it("leaves what it has alone when git says nothing", async () => {
    const store = await bootHalves({ status: false, log: false });
    await store.useAppStore.getState().refreshRepoStatus("p1");
    expect(store.useAppStore.getState().repoState.p1).toBeUndefined();
  });

  // The filesystem events that drive this arrive far faster than git answers, and every call is
  // two processes that can each sit for ten seconds behind an `index.lock` someone else is
  // holding. Starting one per event stacks them with no ceiling; waiting for the one in flight
  // costs nothing, because it started after the write that caused the event anyway.
  it("waits for the read in flight instead of starting another", async () => {
    vi.resetModules();
    const ran: string[][] = [];
    let release: (() => void) | undefined;
    const held = new Promise<void>(resolve => { release = resolve; });

    const { setTransport } = await import("@/lib/transport");
    setTransport({
      ...nullTransport,
      loadConfig: async () => structuredClone(config()) as unknown as AppConfig,
      saveConfig: async () => {},
      exec: async (program: string, args: string[]) => {
        ran.push([program, ...args]);
        await held;
        return { code: 0, stdout: args[0] === "status" ? STATUS : LOG, stderr: "" };
      },
    });
    const store = await import("@/store");
    await store.useAppStore.getState().init();
    ran.length = 0;

    const reads = [
      store.useAppStore.getState().refreshRepoStatus("p1"),
      store.useAppStore.getState().refreshRepoStatus("p1"),
      store.useAppStore.getState().refreshRepoStatus("p1"),
    ];
    // Three events, one read: `git status` and `git log`, once each.
    expect(ran).toHaveLength(2);

    release!();
    await Promise.all(reads);
    expect(ran).toHaveLength(2);
    expect(store.useAppStore.getState().repoState.p1.status?.branch).toBe("feat/watcher");

    // And the guard lets go afterwards: the next event is read, not swallowed.
    await store.useAppStore.getState().refreshRepoStatus("p1");
    expect(ran).toHaveLength(4);
  });

  it("does not let one project's slow read hold up another's", async () => {
    vi.resetModules();
    const ran: string[] = [];
    const { setTransport } = await import("@/lib/transport");
    setTransport({
      ...nullTransport,
      loadConfig: async () => {
        const cfg = structuredClone(config());
        (cfg.projects as Record<string, unknown>[]).push({ id: "p2", name: "Dos", workspaceDir: "C:\\dos", createdAt: 2 });
        return cfg as unknown as AppConfig;
      },
      saveConfig: async () => {},
      exec: async (_program: string, args: string[], cwd?: string) => {
        ran.push(`${cwd}:${args[0]}`);
        return { code: 0, stdout: args[0] === "status" ? STATUS : LOG, stderr: "" };
      },
    });
    const store = await import("@/store");
    await store.useAppStore.getState().init();
    ran.length = 0;

    await Promise.all([
      store.useAppStore.getState().refreshRepoStatus("p1"),
      store.useAppStore.getState().refreshRepoStatus("p2"),
    ]);

    expect(ran).toContain("C:\\uno:status");
    expect(ran).toContain("C:\\dos:status");
  });
});

// The two halves are read in one `Promise.all`, and git can fail on either. Whichever one came
// back has to land: dropping the commits because the status failed threw away a read that had
// just succeeded, and the board went back to not knowing whether a run's work was committed.
describe("refreshRepoStatus, one half at a time", () => {
  /** A state already on screen, so "kept" and "never read" can be told apart. */
  function seed(store: typeof import("@/store"), status: unknown, commits: unknown) {
    store.useAppStore.setState(s => ({
      repoState: {
        ...s.repoState,
        p1: { isRepo: true, status, pullRequests: [], commits, fetchedAt: 1 } as never,
      },
    }));
  }

  it("keeps both when git reads both", async () => {
    const store = await bootHalves({ status: true, log: true });
    await store.useAppStore.getState().refreshRepoStatus("p1");

    const state = store.useAppStore.getState().repoState.p1;
    expect(state.status?.branch).toBe("feat/watcher");
    expect(state.commits?.map(c => c.subject)).toEqual(["the one commit"]);
  });

  it("keeps the commits it read when the status failed", async () => {
    const store = await bootHalves({ status: false, log: true });
    seed(store, { branch: "old" }, undefined);
    await store.useAppStore.getState().refreshRepoStatus("p1");

    const state = store.useAppStore.getState().repoState.p1;
    expect(state.commits?.map(c => c.subject)).toEqual(["the one commit"]);
    // The status that was there is still there: unreadable is not the same as gone.
    expect(state.status?.branch).toBe("old");
  });

  it("keeps the commits it had when the log failed", async () => {
    const store = await bootHalves({ status: true, log: false });
    seed(store, null, [{ hash: "abc", subject: "an older commit" }]);
    await store.useAppStore.getState().refreshRepoStatus("p1");

    const state = store.useAppStore.getState().repoState.p1;
    expect(state.status?.branch).toBe("feat/watcher");
    expect(state.commits?.map(c => c.subject)).toEqual(["an older commit"]);
  });

  it("writes a state with no status when only the log read, on a project never read before", async () => {
    const store = await bootHalves({ status: false, log: true });
    await store.useAppStore.getState().refreshRepoStatus("p1");

    const state = store.useAppStore.getState().repoState.p1;
    // git answered about the folder, so it is a repo; the branch fills in on the next pass.
    expect(state.isRepo).toBe(true);
    expect(state.status).toBeNull();
    expect(state.commits).toHaveLength(1);
  });
});
