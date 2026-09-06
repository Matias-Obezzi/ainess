// The agents used to be one global list; from version 10 each project carries its own team and
// the old one survives as a formation. These tests drive the real store through a fake transport.
import { describe, it, expect, vi, beforeEach } from "vitest";
import type { AppConfig, AgentConfig } from "@/types";
import { nullTransport } from "@/lib/transport-null";

/** A v9 config: three global agents, two projects, nothing else that matters here. */
function legacyConfig(): Record<string, unknown> {
  const agents: AgentConfig[] = [
    { id: "root-1", name: "Claude", provider: "claude", role: "planner", parentId: null, autoApprove: false },
    { id: "child-1", name: "Antigravity", provider: "antigravity", role: "implementer", parentId: "root-1", autoApprove: true },
    { id: "child-2", name: "Copilot", provider: "copilot", role: "implementer", parentId: "root-1", autoApprove: true },
  ];
  return {
    version: 9,
    approveDelegations: false,
    remote: { enabled: false, port: 4710, token: "t", tunnel: { provider: "cloudflared", enabled: false } },
    tray: { enabled: true, notifyApprovals: true, notifyResults: true },
    agents,
    projects: [
      { id: "p1", name: "Uno", workspaceDir: "C:\\uno", createdAt: 1 },
      { id: "p2", name: "Dos", workspaceDir: "C:\\dos", createdAt: 2 },
    ],
    lastProjectId: "p1",
    maxRounds: 6,
    skills: [{ id: "s1", name: "Skill", content: "", enabledFor: ["child-1"] }],
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

/** Boots a fresh copy of the store on a config, and hands back what it saved. */
async function boot(config: Record<string, unknown> | null) {
  vi.resetModules();
  const saved: AppConfig[] = [];
  const { setTransport } = await import("@/lib/transport");
  setTransport({
    ...nullTransport,
    loadConfig: async () => (config ? (structuredClone(config) as unknown as AppConfig) : null),
    saveConfig: async (c: AppConfig) => { saved.push(c); },
  });
  const store = await import("@/store");
  await store.useAppStore.getState().init();
  return { store, saved };
}

beforeEach(() => {
  vi.resetModules();
});

describe("migration 9 -> 10", () => {
  it("copies the global team into every project and keeps the first one's ids", async () => {
    const { store } = await boot(legacyConfig());
    const config = store.useAppStore.getState().config;

    expect(config.version).toBe(11);
    expect((config as unknown as { agents?: unknown }).agents).toBeUndefined();

    // The project the user was last on keeps the ids the runtime and the history already name.
    const p1 = config.projects.find(p => p.id === "p1")!;
    expect(p1.agents.map(a => a.id)).toEqual(["root-1", "child-1", "child-2"]);
    expect(p1.agents[1].parentId).toBe("root-1");

    // Every other project gets its own copy, with new ids and the hierarchy remapped.
    const p2 = config.projects.find(p => p.id === "p2")!;
    expect(p2.agents).toHaveLength(3);
    expect(p2.agents.map(a => a.id)).not.toContain("root-1");
    expect(p2.agents[0].parentId).toBeNull();
    expect(p2.agents[1].parentId).toBe(p2.agents[0].id);
    expect(p2.agents.map(a => a.name)).toEqual(["Claude", "Antigravity", "Copilot"]);
  });

  it("saves the old global team as the default formation", async () => {
    const { store } = await boot(legacyConfig());
    const config = store.useAppStore.getState().config;

    expect(config.formations).toHaveLength(1);
    const formation = config.formations[0];
    expect(formation.name).toBe("Mi equipo");
    expect(formation.agents.map(a => a.name)).toEqual(["Claude", "Antigravity", "Copilot"]);
    // A formation is a template: applying it must not collide with the ids already in use.
    expect(formation.agents.map(a => a.id)).not.toContain("root-1");
    expect(config.defaultFormationId).toBe(formation.id);
  });

  it("gives every migrated agent a runtime entry and writes the config back", async () => {
    const { store, saved } = await boot(legacyConfig());
    const state = store.useAppStore.getState();

    expect(Object.keys(state.runtime.p1)).toEqual(["root-1", "child-1", "child-2"]);
    const p2 = state.config.projects.find(p => p.id === "p2")!;
    for (const agent of p2.agents) expect(state.runtime.p2[agent.id]).toBeDefined();
    expect(saved.length).toBeGreaterThan(0);
    expect(saved[saved.length - 1].version).toBe(11);
  });

  it("leaves the per-agent skill assignments of the first project alone", async () => {
    const { store } = await boot(legacyConfig());
    // The ids of the first project survive, so what was enabled for one of its agents still is.
    expect(store.useAppStore.getState().config.skills[0].enabledFor).toEqual(["child-1"]);
  });
});

describe("addProject", () => {
  it("copies the default formation with new ids, remapped parents and a runtime", async () => {
    const { store } = await boot(legacyConfig());
    const { useAppStore } = store;
    const formation = useAppStore.getState().config.formations[0];

    useAppStore.getState().addProject({ name: "Tres", workspaceDir: "C:\\tres" });

    const state = useAppStore.getState();
    const project = state.config.projects.find(p => p.name === "Tres")!;
    expect(project.agents).toHaveLength(3);
    expect(project.agents.map(a => a.name)).toEqual(formation.agents.map(a => a.name));
    // Fresh ids, or two projects would share one runtime entry.
    for (const agent of project.agents) {
      expect(formation.agents.some(a => a.id === agent.id)).toBe(false);
      expect(state.runtime[project.id][agent.id]).toBeDefined();
    }
    const root = project.agents[0];
    expect(root.parentId).toBeNull();
    expect(project.agents[1].parentId).toBe(root.id);
    expect(project.agents[2].parentId).toBe(root.id);
  });

  it("starts with no agents when the formation is explicitly none", async () => {
    const { store } = await boot(legacyConfig());
    store.useAppStore.getState().addProject({ name: "Vacio", workspaceDir: "C:\\vacio" }, { formationId: null });
    const project = store.useAppStore.getState().config.projects.find(p => p.name === "Vacio")!;
    expect(project.agents).toEqual([]);
  });

  it("takes the team the caller hands over as it is", async () => {
    const { store } = await boot(legacyConfig());
    const agents: AgentConfig[] = [
      { id: "own-1", name: "Solo", provider: "claude", role: "planner", parentId: null, autoApprove: false },
    ];
    store.useAppStore.getState().addProject({ name: "Propio", workspaceDir: "C:\\propio", agents });
    const state = store.useAppStore.getState();
    const project = state.config.projects.find(p => p.name === "Propio")!;
    expect(project.agents.map(a => a.id)).toEqual(["own-1"]);
    expect(state.runtime[project.id]["own-1"]).toBeDefined();
  });
});

describe("applyFormation", () => {
  it("adds the formation's team without colliding with the names already there", async () => {
    const { store } = await boot(legacyConfig());
    const { useAppStore } = store;
    const formation = useAppStore.getState().config.formations[0];

    useAppStore.getState().applyFormation("p1", formation.id);

    const state = useAppStore.getState();
    const p1 = state.config.projects.find(p => p.id === "p1")!;
    // The three that were already there plus the three of the formation, renamed to stay unique.
    expect(p1.agents.map(a => a.name)).toEqual([
      "Claude", "Antigravity", "Copilot", "Claude 2", "Antigravity 2", "Copilot 2",
    ]);
    const added = p1.agents.slice(3);
    expect(added[1].parentId).toBe(added[0].id);
    for (const agent of added) expect(state.runtime.p1[agent.id]).toBeDefined();
    // Nothing that was already running loses its runtime row.
    expect(state.runtime.p1["root-1"]).toBeDefined();
  });
});

describe("removeAgent", () => {
  it("re-parents the children instead of deleting them, and only in that project", async () => {
    const { store } = await boot(legacyConfig());
    const { useAppStore } = store;

    useAppStore.getState().removeAgent("p1", "root-1");

    const state = useAppStore.getState();
    const p1 = state.config.projects.find(p => p.id === "p1")!;
    expect(p1.agents.map(a => a.id)).toEqual(["child-1", "child-2"]);
    expect(p1.agents.every(a => a.parentId === null)).toBe(true);
    expect(state.runtime.p1["root-1"]).toBeUndefined();
    // The copy that lives in the other project is untouched.
    expect(state.config.projects.find(p => p.id === "p2")!.agents).toHaveLength(3);
  });
});
