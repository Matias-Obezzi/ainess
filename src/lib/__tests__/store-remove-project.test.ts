// Deleting a project has to take everything hanging off it with it. What used to stay behind was
// visible: the approvals of a deleted project kept asking for a decision in the sidebar and in the
// bell, with no project screen left to answer from.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { createTask } from "@/lib/tasks";
import { nullTransport } from "@/lib/transport-null";
import { pendingApprovals } from "@/lib/approvals";
import type { AppConfig, Approval, AppNotification, CommMessage, Run, TerminalTab } from "@/types";

function baseConfig(): Record<string, unknown> {
  return {
    version: 9,
    approveDelegations: true,
    remote: { enabled: false, port: 4710, token: "t", tunnel: { provider: "cloudflared", enabled: false } },
    tray: { enabled: true, notifyApprovals: true, notifyResults: true },
    agents: [{ id: "a1", name: "Claude", provider: "claude", role: "planner", parentId: null, autoApprove: false }],
    projects: [
      { id: "p1", name: "Uno", workspaceDir: "C:\\uno", createdAt: 1 },
      { id: "p2", name: "Dos", workspaceDir: "C:\\dos", createdAt: 2 },
    ],
    lastProjectId: "p1",
    maxRounds: 6,
    skills: [],
    mcpServers: [],
    hooks: [
      { id: "h1", name: "Solo p1", event: "run-finished", enabled: true, filter: { projectId: "p1" }, action: { kind: "notify" } },
      { id: "h2", name: "Global", event: "run-finished", enabled: true, action: { kind: "notify" } },
    ],
    sharedContext: "",
    binaryOverrides: {},
    profile: { name: "", about: "", preferences: "" },
    presets: [],
    autoModel: false,
    chats: [
      { id: "c1", projectId: "p1", name: "Chat uno", mode: "individual", participants: [], createdAt: 1 },
      { id: "c2", projectId: "p2", name: "Chat dos", mode: "individual", participants: [], createdAt: 2 },
    ],
    logLevel: "info",
    autoUpdateCheck: true,
  };
}

const approval = (id: string, projectId: string): Approval => ({
  id,
  projectId,
  kind: "delegation",
  agentId: "a1",
  summary: id,
  payload: { agentId: "a1", projectId, prompt: "hola", parentRunId: null, round: 0 },
  createdAt: 1,
  status: "pending",
});

const notification = (id: string, extra: Partial<AppNotification>): AppNotification => ({
  id, kind: "info", title: id, ts: 1, read: false, ...extra,
});

const run = (id: string, projectId: string): Run => ({
  id, projectId, agentId: "a1", parentRunId: null, rootRunId: id, prompt: "", status: "done",
  startedAt: 1, endedAt: 2, output: "", rawLines: [], childRunIds: [], round: 0,
});

const message = (id: string, projectId: string): CommMessage => ({
  id, ts: 1, projectId, fromAgentId: "a1", kind: "text", text: id,
});

const terminal = (id: string, projectId: string | null): TerminalTab => ({
  id, title: id, shellId: "pwsh", shellPath: "pwsh.exe", cwd: "C:\\", projectId,
});

/** Boots the real store on the config above and seeds every collection with one row per project. */
async function bootAndSeed() {
  vi.resetModules();
  const written: string[] = [];
  const deleted: string[] = [];
  const { setTransport } = await import("@/lib/transport");
  setTransport({
    ...nullTransport,
    loadConfig: async () => structuredClone(baseConfig()) as unknown as AppConfig,
    saveConfig: async () => {},
    writeTextFile: async (path: string) => { written.push(path); return path; },
    deleteFile: async (path: string) => { deleted.push(path); },
  });
  const store = await import("@/store");
  await store.useAppStore.getState().init();

  store.useAppStore.setState(state => ({
    approvals: { a: approval("a", "p1"), b: approval("b", "p2") },
    notifications: [
      notification("n-project", { projectId: "p1" }),
      notification("n-approval", { approvalId: "a" }),
      notification("n-run", { runId: "r1" }),
      notification("n-other", { projectId: "p2" }),
    ],
    runs: { r1: run("r1", "p1"), r2: run("r2", "p2") },
    messages: [message("m1", "p1"), message("m2", "p2")],
    tasks: {
      p1: [createTask({ id: "t1", projectId: "p1", title: "Tarea uno" })],
      p2: [createTask({ id: "t2", projectId: "p2", title: "Tarea dos" })],
    },
    worktrees: { p1: [], p2: [] },
    repoState: { p1: state.repoState.p1, p2: state.repoState.p2 },
    runtime: { p1: {}, p2: {} },
    activeTaskRunId: { p1: "r1", p2: null },
    historyLoading: { p1: false, p2: false },
    sidebarCollapsed: { ...state.sidebarCollapsed, p1: true, p2: false },
    chatMessages: { c1: [], c2: [] },
    chatSessions: { c1: { a1: "s1" }, c2: { a1: "s2" } },
    chatLoading: { c1: false, c2: false },
    remoteActiveChats: ["c1", "c2"],
    focusedTaskId: "t1",
    terminals: [terminal("term-1", "p1"), terminal("term-2", "p2"), terminal("term-3", null)],
    currentProjectId: "p1",
    currentChatId: "c1",
    screen: "project" as const,
    navHistory: [
      { screen: "home" as const, projectId: null, chatId: null, projectMode: "chat" as const },
      { screen: "project" as const, projectId: "p2", chatId: null, projectMode: "chat" as const },
      { screen: "project" as const, projectId: "p1", chatId: "c1", projectMode: "chat" as const },
    ],
    navIndex: 2,
  }));

  return { store, written, deleted };
}

beforeEach(() => {
  vi.resetModules();
});

describe("removeProject", () => {
  it("drops the pending approvals of the project and keeps the other project's", async () => {
    const { store } = await bootAndSeed();
    store.useAppStore.getState().removeProject("p1");
    const { approvals } = store.useAppStore.getState();
    expect(approvals.a).toBeUndefined();
    expect(approvals.b).toBeDefined();
  });

  it("drops the notifications about the project, its approvals and its runs", async () => {
    const { store } = await bootAndSeed();
    store.useAppStore.getState().removeProject("p1");
    expect(store.useAppStore.getState().notifications.map(n => n.id)).toEqual(["n-other"]);
  });

  it("clears everything keyed by the project", async () => {
    const { store } = await bootAndSeed();
    store.useAppStore.getState().removeProject("p1");
    const s = store.useAppStore.getState();
    expect(s.config.projects.map(p => p.id)).toEqual(["p2"]);
    expect(Object.keys(s.runs)).toEqual(["r2"]);
    expect(s.messages.map(m => m.id)).toEqual(["m2"]);
    expect(s.tasks.p1).toBeUndefined();
    expect(s.tasks.p2).toHaveLength(1);
    for (const map of [s.worktrees, s.runtime, s.activeTaskRunId, s.historyLoading, s.sidebarCollapsed]) {
      expect(Object.keys(map)).not.toContain("p1");
      expect(Object.keys(map)).toContain("p2");
    }
    expect(s.repoState.p1).toBeUndefined();
    expect(s.focusedTaskId).toBeNull();
  });

  it("takes the project's chats, their messages and their sessions", async () => {
    const { store, deleted } = await bootAndSeed();
    store.useAppStore.getState().removeProject("p1");
    const s = store.useAppStore.getState();
    expect(s.config.chats.map(c => c.id)).toEqual(["c2"]);
    for (const map of [s.chatMessages, s.chatSessions, s.chatLoading]) {
      expect(Object.keys(map)).toEqual(["c2"]);
    }
    expect(s.remoteActiveChats).toEqual(["c2"]);
    expect(s.currentChatId).toBeNull();
    // Its file goes with it: emptied, it would sit in the folder for as long as the app lives.
    await vi.waitFor(() => expect(deleted).toContain("chats/c1.json"));
    // And so do the project's own two.
    expect(deleted).toContain("history/p1.json");
    expect(deleted).toContain("tasks/p1.json");
  });

  it("drops a hook that only fired for that project and keeps the global one", async () => {
    const { store } = await bootAndSeed();
    store.useAppStore.getState().removeProject("p1");
    expect(store.useAppStore.getState().config.hooks.map(h => h.id)).toEqual(["h2"]);
  });

  it("leaves no back/forward entry pointing at the project", async () => {
    const { store } = await bootAndSeed();
    store.useAppStore.getState().removeProject("p1");
    const s = store.useAppStore.getState();
    expect(s.navHistory.some(e => e.projectId === "p1")).toBe(false);
    expect(s.navIndex).toBeLessThan(s.navHistory.length);
    expect(s.navIndex).toBeGreaterThanOrEqual(0);
    expect(s.screen).toBe("home");
    expect(s.currentProjectId).toBeNull();
  });

  // Second line of defence: the store is not the only writer of `approvals`.
  it("hides an approval whose project no longer exists, whoever wrote it", async () => {
    const { store } = await bootAndSeed();
    store.useAppStore.getState().removeProject("p1");
    // The CLI or the phone can push one back in for a project this process already dropped.
    store.useAppStore.setState(state => ({ approvals: { ...state.approvals, ghost: approval("ghost", "p1") } }));
    const s = store.useAppStore.getState();
    expect(pendingApprovals(s.approvals, s.config.projects).map(a => a.id)).toEqual(["b"]);
  });

  it("keeps the shells running but detaches them from the project", async () => {
    const { store } = await bootAndSeed();
    store.useAppStore.getState().removeProject("p1");
    const { terminals } = store.useAppStore.getState();
    expect(terminals).toHaveLength(3);
    expect(terminals.find(t => t.id === "term-1")?.projectId).toBeNull();
    expect(terminals.find(t => t.id === "term-2")?.projectId).toBe("p2");
  });
});
