// What the phone can ask the PC to do. The board could be moved from there but not written to,
// which is half of what a board is for.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { nullTransport } from "@/lib/transport-null";
import type { AppConfig } from "@/types";

function baseConfig(): Record<string, unknown> {
  return {
    version: 9,
    approveDelegations: false,
    remote: { enabled: false, port: 4710, token: "t", tunnel: { provider: "cloudflared", enabled: false } },
    tray: { enabled: true, notifyApprovals: true, notifyResults: true },
    agents: [{ id: "a1", name: "Claude", provider: "claude", role: "planner", parentId: null, autoApprove: false }],
    projects: [{ id: "p1", name: "Uno", workspaceDir: "C:\\uno", createdAt: 1 }],
    lastProjectId: "p1",
    maxRounds: 6,
    skills: [], mcpServers: [], hooks: [], sharedContext: "", binaryOverrides: {},
    profile: { name: "", about: "", preferences: "" },
    presets: [], autoModel: false, chats: [], logLevel: "info", autoUpdateCheck: true,
  };
}

async function boot() {
  vi.resetModules();
  const { setTransport } = await import("@/lib/transport");
  setTransport({
    ...nullTransport,
    loadConfig: async () => structuredClone(baseConfig()) as unknown as AppConfig,
    saveConfig: async () => {},
  });
  const store = await import("@/store");
  await store.useAppStore.getState().init();
  const remote = await import("@/lib/remote");
  return { store, run: remote.handleRemoteCommand };
}

beforeEach(() => { vi.resetModules(); });

describe("the task command", () => {
  it("writes a card the PC then owns", async () => {
    const { store, run } = await boot();
    const answer = await run("task", { op: "create", projectId: "p1", title: "  Revisar el deploy  " });

    expect(answer.ok).toBe(true);
    const tasks = store.useAppStore.getState().tasks.p1;
    expect(tasks).toHaveLength(1);
    expect(tasks[0].title).toBe("Revisar el deploy");
    // The id it answers with is the one the board will carry.
    expect(answer.taskId).toBe(tasks[0].id);
  });

  it("takes an agent of that project, and ignores one that is not", async () => {
    const { store, run } = await boot();
    const own = store.useAppStore.getState().config.projects[0].agents![0].id;
    await run("task", { op: "create", projectId: "p1", title: "Mía", agentId: own });
    await run("task", { op: "create", projectId: "p1", title: "Ajena", agentId: "de-otro-proyecto" });

    const tasks = store.useAppStore.getState().tasks.p1;
    expect(tasks.find(t => t.title === "Mía")?.agentId).toBe(own);
    expect(tasks.find(t => t.title === "Ajena")?.agentId).toBeUndefined();
  });

  it("refuses what it cannot place", async () => {
    const { run } = await boot();
    expect(await run("task", { op: "create", projectId: "p1", title: "   " })).toHaveProperty("error");
    expect(await run("task", { op: "create", projectId: "no-existe", title: "Algo" })).toHaveProperty("error");
    // Everything else still needs the id of the task it is about.
    expect(await run("task", { op: "move", status: "done" })).toHaveProperty("error");
  });

  it("still moves, archives and deletes", async () => {
    const { store, run } = await boot();
    const created = await run("task", { op: "create", projectId: "p1", title: "Una" });
    const id = created.taskId as string;

    await run("task", { taskId: id, op: "move", status: "done", index: 0 });
    expect(store.useAppStore.getState().tasks.p1[0].status).toBe("done");

    await run("task", { taskId: id, op: "archive" });
    expect(store.useAppStore.getState().tasks.p1[0].archived).toBe(true);

    await run("task", { taskId: id, op: "delete" });
    expect(store.useAppStore.getState().tasks.p1).toHaveLength(0);
  });
});
