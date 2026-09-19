// Since the screen can hold several projects at once, "the project" is no longer one project.
// A pane without focus used to keep the branch and the working tree it had the last time it was
// focused, which is exactly the case the panes were built for: two projects working in parallel.
import { describe, it, expect, vi, afterEach } from "vitest";
import { renderHook } from "@testing-library/react";
import { nullTransport } from "@/lib/transport-null";
import type { AppConfig } from "@/types";

const STATUS = [
  "# branch.oid 6ab9c2f0c1d2e3f4a5b6c7d8e9f0a1b2c3d4e5f6",
  "# branch.head feat/panes",
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
    projects: [
      { id: "p1", name: "Uno", workspaceDir: "C:\\uno", createdAt: 1 },
      { id: "p2", name: "Dos", workspaceDir: "C:\\dos", createdAt: 2 },
    ],
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

/** Every command git and `gh` were asked to run, with the folder each one ran in. */
interface Call { program: string; args: string[]; cwd: string }

async function boot() {
  vi.resetModules();
  const calls: Call[] = [];
  const { setTransport } = await import("@/lib/transport");
  setTransport({
    ...nullTransport,
    loadConfig: async () => structuredClone(config()) as unknown as AppConfig,
    saveConfig: async () => {},
    exec: async (program: string, args: string[], cwd?: string) => {
      calls.push({ program, args, cwd: cwd ?? "" });
      if (program !== "git") return { code: 1, stdout: "", stderr: "gh: command not found" };
      if (args[0] === "rev-parse") return { code: 0, stdout: "true\n", stderr: "" };
      if (args[0] === "status") return { code: 0, stdout: STATUS, stderr: "" };
      return { code: 1, stdout: "", stderr: "" };
    },
  });
  const store = await import("@/store");
  await store.useAppStore.getState().init();
  store.useAppStore.setState({ openProjects: ["p1", "p2"], currentProjectId: "p1" });
  const { useRepoSync } = await import("@/hooks/useRepoSync");
  return { store, calls, useRepoSync };
}

const dirsOf = (calls: Call[], sub: string) =>
  calls.filter(c => c.program === "git" && c.args[0] === sub).map(c => c.cwd);

afterEach(() => {
  vi.useRealTimers();
  vi.resetModules();
});

describe("useRepoSync", () => {
  it("reads every open project when it mounts, not only the focused one", async () => {
    const { store, calls, useRepoSync } = await boot();
    vi.useFakeTimers();
    renderHook(() => useRepoSync());
    await vi.advanceTimersByTimeAsync(0);

    expect(dirsOf(calls, "status").sort()).toEqual(["C:\\dos", "C:\\uno"]);
    expect(store.useAppStore.getState().repoState.p2?.status?.branch).toBe("feat/panes");
  });

  it("keeps reading the pane without focus on the timer", async () => {
    const { calls, useRepoSync } = await boot();
    vi.useFakeTimers();
    renderHook(() => useRepoSync());
    await vi.advanceTimersByTimeAsync(0);
    calls.length = 0;

    await vi.advanceTimersByTimeAsync(60 * 1000);
    expect(dirsOf(calls, "status")).toContain("C:\\dos");
    // The project behind pays for git and not for `gh`: the pull requests are the network, and
    // four projects asking GitHub every minute is a price nobody asked for.
    expect(calls.some(c => c.program === "gh" && c.cwd === "C:\\dos")).toBe(false);
    expect(calls.some(c => c.program === "gh" && c.cwd === "C:\\uno")).toBe(true);
  });
});
