import { create } from "zustand";
import { AppConfig, AgentConfig, Binaries, AgentRuntime, Run, CommMessage, Skill, McpServer, Project, ProviderId, Chat, ChatMessage, ChatParticipant, Approval, ModelInfo, ProviderQuota } from "@/types";
import { getTransport } from "@/lib/transport";
import { isTauri } from "@/lib/tauri";
import * as orchestrator from "@/lib/orchestrator";
import * as history from "@/lib/history";
import * as remote from "@/lib/remote";
import * as quota from "@/lib/quota";

/** Which top-level screen the shell is showing. Settings is a modal, not a screen. */
export type Screen = "home" | "project";
/** Project screen body: conversation or agent graph. */
export type ProjectMode = "chat" | "graph";
/** Which section of the settings dialog's sidebar is open. */
export type SettingsSection = "general" | "agents" | "profile" | "presets" | "skills" | "mcp" | "hooks" | "context" | "remote";

export interface AppState {
  loaded: boolean;
  config: AppConfig;
  binaries: Binaries;
  runtime: Record<string, Record<string, AgentRuntime>>;
  runs: Record<string, Run>;
  messages: CommMessage[];
  activeTaskRunId: Record<string, string | null>;
  currentProjectId: string | null;
  /** Models available per provider (fetched or fixed list). */
  models: Partial<Record<ProviderId, ModelInfo[]>>;
  /** Last known quota per provider. */
  quota: Partial<Record<ProviderId, ProviderQuota>>;
  /** Chat messages in memory, keyed by chatId. */
  chatMessages: Record<string, ChatMessage[]>;
  /** Session ids per chat per agent. */
  chatSessions: Record<string, Record<string, string>>;
  /** Currently selected chat id. */
  currentChatId: string | null;

  // ---- Shell navigation (persisted in localStorage under "ais.ui") ----
  screen: Screen;
  projectMode: ProjectMode;
  commPanelOpen: boolean;
  /** Settings is a modal, not a screen: whether it's currently open. Not persisted. */
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  /** projectId -> collapsed in the sidebar. */
  sidebarCollapsed: Record<string, boolean>;
  openHome(): void;
  /** `chatId` null = orchestrator thread; undefined = keep the current chat if it belongs to the project. */
  openProject(projectId: string, chatId?: string | null): void;
  openSettings(section?: SettingsSection): void;
  closeSettings(): void;
  setProjectMode(mode: ProjectMode): void;
  toggleCommPanel(open?: boolean): void;
  toggleSidebarProject(projectId: string): void;

  init(): Promise<void>;
  saveConfig(): Promise<void>;
  addProject(project: Omit<Project, "id" | "createdAt">): void;
  updateProject(id: string, patch: Partial<Project>): void;
  removeProject(id: string): void;
  setCurrentProject(id: string | null): void;
  setMaxRounds(n: number): void;
  upsertAgent(agent: AgentConfig): void;
  removeAgent(agentId: string): void;
  upsertSkill(skill: Skill): void;
  removeSkill(skillId: string): void;
  upsertMcpServer(server: McpServer): void;
  removeMcpServer(serverId: string): void;
  upsertHook(hook: import("@/types").Hook): void;
  removeHook(id: string): void;
  toggleHook(id: string, enabled: boolean): void;
  testHook(id: string): Promise<void>;
  setSharedContext(text: string): void;
  detectBinaries(): Promise<{ found: ProviderId[]; missing: ProviderId[] }>;
  updateConfig(patch: Partial<AppConfig>): void;
  refreshModels(provider: ProviderId): Promise<ModelInfo[]>;
  refreshQuota(provider: ProviderId): Promise<ProviderQuota>;
  loadQuotaMarks(): Promise<void>;

  submitPrompt(text: string, targetAgentId: string, projectId: string, opts?: { model?: string }): Promise<void>;
  instructAgent(agentId: string, text: string, projectId: string, opts?: { model?: string }): Promise<void>;
  stopAgent(agentId: string, projectId: string): Promise<void>;
  stopAll(projectId?: string): Promise<void>;
  resetSession(agentId: string, projectId: string): void;
  clearMessages(projectId?: string): void;
  /** Drops a project's runs and feed, in memory and on disk. */
  clearHistory(projectId: string): Promise<void>;

  // Approvals (delegations waiting for the user's go-ahead)
  approvals: Record<string, Approval>;
  approve(approvalId: string, note?: string): Promise<void>;
  reject(approvalId: string, note?: string): Promise<void>;

  // LAN remote access
  remoteStatus: { running: boolean; url?: string; ip?: string; clients: number; error?: string };
  startRemote(portOverride?: number): Promise<void>;
  stopRemote(): Promise<void>;
  refreshRemoteStatus(): Promise<void>;
  regenerateRemoteToken(): Promise<void>;

  // Chat actions
  createChat(opts: { projectId: string; name: string; mode: "individual" | "shared"; participants: ChatParticipant[] }): string;
  updateChat(id: string, patch: Partial<Pick<Chat, "name" | "participants">>): void;
  removeChat(id: string): void;
  setCurrentChat(id: string | null): void;
  sendChatMessage(chatId: string, text: string): Promise<void>;
  stopChat(chatId: string): Promise<void>;
  loadChatMessages(chatId: string): Promise<void>;
}

function generateSeedConfig(): AppConfig {
  const claudeId = crypto.randomUUID();
  const antigravityId = crypto.randomUUID();
  const copilotId = crypto.randomUUID();

  return {
    version: 8,
    approveDelegations: false,
    remote: { enabled: false, port: 4710, token: crypto.randomUUID() },
    tray: { enabled: true, notifyApprovals: true, notifyResults: true },
    projects: [],
    lastProjectId: null,
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
    agents: [
      {
        id: claudeId,
        name: "Claude",
        provider: "claude",
        role: "planner",
        parentId: null,
        autoApprove: false,
        color: "#d97757",
      },
      {
        id: antigravityId,
        name: "Antigravity",
        provider: "antigravity",
        role: "implementer",
        parentId: claudeId,
        model: "gemini-3.1-pro-high",
        autoApprove: true,
        description: "Implementa cambios de código en el workspace usando Antigravity (Gemini)",
        color: "#4f8cff",
      },
      {
        id: copilotId,
        name: "Copilot",
        provider: "copilot",
        role: "implementer",
        parentId: claudeId,
        autoApprove: true,
        description: "Implementa cambios de código usando GitHub Copilot CLI",
        color: "#8b5cf6",
      }
    ]
  };
}

/** Shell layout preferences, kept out of the config file (per-machine, not per-project). */
interface UiPrefs {
  screen: Screen;
  projectMode: ProjectMode;
  commPanelOpen: boolean;
  settingsSection: SettingsSection;
  sidebarCollapsed: Record<string, boolean>;
}

const UI_PREFS_KEY = "ais.ui";
const defaultUiPrefs: UiPrefs = {
  screen: "home",
  projectMode: "chat",
  commPanelOpen: false,
  settingsSection: "general",
  sidebarCollapsed: {},
};

const VALID_SETTINGS_SECTIONS: SettingsSection[] = ["general", "agents", "profile", "presets", "skills", "mcp", "hooks", "context", "remote"];

/** Old builds stored "settings" as a screen and "resources" as a settings tab; both were removed. */
function sanitizeSettingsSection(value: unknown): SettingsSection {
  if (value === "resources") return "profile";
  if (typeof value === "string" && (VALID_SETTINGS_SECTIONS as string[]).includes(value)) return value as SettingsSection;
  return "general";
}

/** localStorage does not exist in the CLI/node build, so every access is guarded. */
function loadUiPrefs(): UiPrefs {
  if (typeof localStorage === "undefined") return { ...defaultUiPrefs };
  try {
    const raw = localStorage.getItem(UI_PREFS_KEY);
    if (!raw) return { ...defaultUiPrefs };
    const parsed = JSON.parse(raw) as Partial<UiPrefs>;
    return {
      screen: parsed.screen === "project" ? "project" : "home",
      projectMode: parsed.projectMode === "graph" ? "graph" : "chat",
      commPanelOpen: parsed.commPanelOpen === true,
      settingsSection: sanitizeSettingsSection(parsed.settingsSection),
      sidebarCollapsed: parsed.sidebarCollapsed && typeof parsed.sidebarCollapsed === "object" ? parsed.sidebarCollapsed : {},
    };
  } catch {
    return { ...defaultUiPrefs };
  }
}

function saveUiPrefs(): void {
  if (typeof localStorage === "undefined") return;
  try {
    const s = useAppStore.getState();
    const prefs: UiPrefs = {
      screen: s.screen,
      projectMode: s.projectMode,
      commPanelOpen: s.commPanelOpen,
      settingsSection: s.settingsSection,
      sidebarCollapsed: s.sidebarCollapsed,
    };
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode / quota: layout preferences are not worth failing over.
  }
}

let initPromise: Promise<void> | null = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
function debouncedSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    useAppStore.getState().saveConfig();
  }, 300);
}

export const useAppStore = create<AppState>()((set, get) => ({
  loaded: false,
  config: { version: 8, approveDelegations: false, remote: { enabled: false, port: 4710, token: "" }, tray: { enabled: true, notifyApprovals: true, notifyResults: true }, agents: [], projects: [], lastProjectId: null, maxRounds: 6, skills: [], mcpServers: [], hooks: [], sharedContext: "", binaryOverrides: {}, profile: { name: "", about: "", preferences: "" }, presets: [], autoModel: false, chats: [] } as AppConfig,
  binaries: {},
  models: {},
  quota: {},
  runtime: {},
  runs: {},
  messages: [],
  activeTaskRunId: {},
  currentProjectId: null,
  chatMessages: {},
  chatSessions: {},
  currentChatId: null,
  approvals: {},

  ...(() => {
    const prefs = loadUiPrefs();
    // The saved screen is only restored once the project list is known (see runInit).
    return { ...prefs, screen: "home" as Screen, settingsOpen: false };
  })(),

  openHome: () => {
    set({ screen: "home" });
    saveUiPrefs();
  },

  openProject: (projectId, chatId) => {
    const state = get();
    const sameProject = state.currentProjectId === projectId;
    let nextChatId: string | null;
    if (chatId === undefined) {
      // Keep the open chat only when it belongs to this project.
      const current = state.currentChatId ? state.config.chats.find(c => c.id === state.currentChatId) : undefined;
      nextChatId = sameProject && current && current.projectId === projectId ? current.id : null;
    } else {
      nextChatId = chatId;
    }
    if (!sameProject) state.setCurrentProject(projectId);
    set({ currentChatId: nextChatId, screen: "project" });
    if (nextChatId) void state.loadChatMessages(nextChatId);
    saveUiPrefs();
  },

  openSettings: (section) => {
    set(s => ({ settingsOpen: true, settingsSection: section ?? s.settingsSection }));
    saveUiPrefs();
  },

  closeSettings: () => {
    set({ settingsOpen: false });
  },

  setProjectMode: (mode) => {
    set({ projectMode: mode });
    saveUiPrefs();
  },

  toggleCommPanel: (open) => {
    set(s => ({ commPanelOpen: open ?? !s.commPanelOpen }));
    saveUiPrefs();
  },

  toggleSidebarProject: (projectId) => {
    set(s => ({ sidebarCollapsed: { ...s.sidebarCollapsed, [projectId]: !s.sidebarCollapsed[projectId] } }));
    saveUiPrefs();
  },

  approve: (approvalId, note) => orchestrator.approveApproval(approvalId, note),
  reject: (approvalId, note) => orchestrator.rejectApproval(approvalId, note),

  remoteStatus: { running: false, clients: 0 },
  startRemote: async (portOverride) => {
    try {
      const status = await remote.startRemote(portOverride);
      set({ remoteStatus: status });
    } catch (e) {
      set({ remoteStatus: { running: false, clients: 0, error: e instanceof Error ? e.message : String(e) } });
      throw e;
    }
  },
  stopRemote: async () => {
    await remote.stopRemote();
    set({ remoteStatus: { running: false, clients: 0 } });
  },
  refreshRemoteStatus: async () => {
    const status = await getTransport().remoteStatus();
    set(state => ({ remoteStatus: { ...status, error: status.running ? undefined : state.remoteStatus.error } }));
  },
  regenerateRemoteToken: async () => {
    const wasRunning = get().remoteStatus.running;
    if (wasRunning) await get().stopRemote();
    set(state => ({ config: { ...state.config, remote: { ...state.config.remote, token: crypto.randomUUID() } } }));
    await get().saveConfig();
    if (wasRunning) await get().startRemote();
  },

  init: () => {
    // Idempotent: StrictMode mounts twice and both calls must share one initialization.
    if (!initPromise) initPromise = runInit();
    return initPromise;
  },

  saveConfig: async () => {
    await getTransport().saveConfig(get().config);
  },

  addProject: (project) => {
    set((state) => {
      const id = crypto.randomUUID();
      const newProject: Project = { ...project, id, createdAt: Date.now() };
      // Every agent needs a runtime entry in the new project, or the first run there crashes.
      const projectRuntime: Record<string, AgentRuntime> = {};
      for (const agent of state.config.agents) {
        projectRuntime[agent.id] = { agentId: agent.id, status: "idle", queuedInstructions: [] };
      }
      return {
        config: { ...state.config, projects: [...state.config.projects, newProject] },
        runtime: { ...state.runtime, [id]: projectRuntime },
      };
    });
    debouncedSave();
  },

  updateProject: (id, patch) => {
    set((state) => {
      const newProjects = state.config.projects.map(p => p.id === id ? { ...p, ...patch } : p);
      return { config: { ...state.config, projects: newProjects } };
    });
    debouncedSave();
  },

  removeProject: (id) => {
    // stopAll(id) is an async action, so we do it here, but zustand set is sync.
    // The plan says "mata sus runs primero con stopAll(projectId)". 
    // Wait, the orchestrator might be async, so we just call it.
    orchestrator.stopAll(id);
    history.forgetHistory(id);
    set((state) => {
      const newProjects = state.config.projects.filter(p => p.id !== id);
      const newRuntime = { ...state.runtime };
      delete newRuntime[id];
      const newActiveTask = { ...state.activeTaskRunId };
      delete newActiveTask[id];
      // clear messages for project
      const newMessages = state.messages.filter(m => m.projectId !== id);
      const newRuns = Object.fromEntries(Object.entries(state.runs).filter(([_, r]) => r.projectId !== id));
      // Chats belong to the project, so they go with it (otherwise they stay orphaned in config).
      const newChats = state.config.chats.filter(c => c.projectId !== id);
      const wasCurrent = state.currentProjectId === id;
      return {
        config: { ...state.config, projects: newProjects, chats: newChats },
        runtime: newRuntime,
        activeTaskRunId: newActiveTask,
        messages: newMessages,
        runs: newRuns,
        currentProjectId: wasCurrent ? null : state.currentProjectId,
        currentChatId: wasCurrent ? null : state.currentChatId,
        // Losing the open project drops the user back to the home screen.
        screen: wasCurrent && state.screen === "project" ? ("home" as Screen) : state.screen,
      };
    });
    saveUiPrefs();
    debouncedSave();
  },

  setCurrentProject: (id) => {
    set((state) => ({ currentProjectId: id, config: { ...state.config, lastProjectId: id } }));
    if (id) void history.loadHistory(id);
    debouncedSave();
  },

  setMaxRounds: (n) => {
    set((state) => ({ config: { ...state.config, maxRounds: n } }));
    debouncedSave();
  },

  upsertAgent: (agent) => {
    set((state) => {
      const idx = state.config.agents.findIndex(a => a.id === agent.id);
      const newAgents = [...state.config.agents];
      if (idx >= 0) {
        newAgents[idx] = agent;
      } else {
        newAgents.push(agent);
      }
      const newRuntime = { ...state.runtime };
      for (const p of state.config.projects) {
        if (!newRuntime[p.id]) newRuntime[p.id] = {};
        if (!newRuntime[p.id][agent.id]) {
          newRuntime[p.id][agent.id] = { agentId: agent.id, status: "idle", queuedInstructions: [] };
        }
      }
      return { config: { ...state.config, agents: newAgents }, runtime: newRuntime };
    });
    debouncedSave();
  },

  removeAgent: (agentId) => {
    set((state) => {
      const agent = state.config.agents.find(a => a.id === agentId);
      const newAgents = state.config.agents.filter(a => a.id !== agentId).map(a => {
        if (a.parentId === agentId) {
          return { ...a, parentId: agent?.parentId || null };
        }
        return a;
      });
      // Cleanup enabledFor in skills and mcpServers
      const newSkills = state.config.skills.map(s => {
        if (s.enabledFor !== "all") {
          return { ...s, enabledFor: s.enabledFor.filter(id => id !== agentId) };
        }
        return s;
      });
      const newMcp = state.config.mcpServers.map(s => {
        if (s.enabledFor !== "all") {
          return { ...s, enabledFor: s.enabledFor.filter(id => id !== agentId) };
        }
        return s;
      });
      const newRuntime = { ...state.runtime };
      for (const pId of Object.keys(newRuntime)) {
        newRuntime[pId] = { ...newRuntime[pId] };
        delete newRuntime[pId][agentId];
      }
      return { config: { ...state.config, agents: newAgents, skills: newSkills, mcpServers: newMcp }, runtime: newRuntime };
    });
    debouncedSave();
  },

  upsertSkill: (skill) => {
    set((state) => {
      const idx = state.config.skills.findIndex(s => s.id === skill.id || s.name.toLowerCase() === skill.name.toLowerCase());
      const newSkills = [...state.config.skills];
      if (idx >= 0) {
        newSkills[idx] = skill;
      } else {
        newSkills.push(skill);
      }
      return { config: { ...state.config, skills: newSkills } };
    });
    debouncedSave();
  },

  removeSkill: (skillId) => {
    set((state) => {
      const newSkills = state.config.skills.filter(s => s.id !== skillId && s.name.toLowerCase() !== skillId.toLowerCase());
      return { config: { ...state.config, skills: newSkills } };
    });
    debouncedSave();
  },

  upsertMcpServer: (server) => {
    set((state) => {
      const idx = state.config.mcpServers.findIndex(s => s.id === server.id || s.name.toLowerCase() === server.name.toLowerCase());
      const newMcp = [...state.config.mcpServers];
      if (idx >= 0) {
        newMcp[idx] = server;
      } else {
        newMcp.push(server);
      }
      return { config: { ...state.config, mcpServers: newMcp } };
    });
    debouncedSave();
  },

  removeMcpServer: (serverId) => {
    set((state) => {
      const newMcp = state.config.mcpServers.filter(s => s.id !== serverId && s.name.toLowerCase() !== serverId.toLowerCase());
      return { config: { ...state.config, mcpServers: newMcp } };
    });
    debouncedSave();
  },

  upsertHook: (hook) => {
    set((state) => {
      const idx = state.config.hooks.findIndex(h => h.id === hook.id);
      const newHooks = [...state.config.hooks];
      if (idx >= 0) newHooks[idx] = hook;
      else newHooks.push(hook);
      return { config: { ...state.config, hooks: newHooks } };
    });
    debouncedSave();
  },

  removeHook: (id) => {
    set((state) => ({ config: { ...state.config, hooks: state.config.hooks.filter(h => h.id !== id) } }));
    debouncedSave();
  },

  toggleHook: (id, enabled) => {
    set((state) => ({
      config: {
        ...state.config,
        hooks: state.config.hooks.map(h => h.id === id ? { ...h, enabled } : h)
      }
    }));
    debouncedSave();
  },

  testHook: async (id) => {
    const hook = get().config.hooks.find(h => h.id === id);
    if (!hook) return;
    const { testHookAction } = await import("@/lib/hooks");
    await testHookAction(hook);
  },

  setSharedContext: (text) => {
    set((state) => ({ config: { ...state.config, sharedContext: text } }));
    debouncedSave();
  },

  updateConfig: (patch) => {
    set((state) => ({ config: { ...state.config, ...patch } }));
    if (patch.tray && isTauri()) {
      void getTransport().setTrayEnabled(patch.tray.enabled).catch(() => {});
    }
    debouncedSave();
  },

  detectBinaries: async () => {
    const detected = await getTransport().detectBinaries();
    const config = get().config;
    const overrides = config.binaryOverrides || {};
    const finalBinaries: Binaries = { ...detected };
    
    for (const [provider, overridePath] of Object.entries(overrides)) {
      if (!overridePath) continue;
      const id = provider as ProviderId;
      try {
        const res = await getTransport().exec(overridePath, ["--version"]);
        if (res.code === 0) {
          finalBinaries[id] = { path: overridePath, version: res.stdout.trim() };
        } else {
          finalBinaries[id] = { path: overridePath, version: null };
        }
      } catch (e) {
        finalBinaries[id] = { path: overridePath, version: null };
      }
    }
    set({ binaries: finalBinaries });

    const providerIds = Object.keys(finalBinaries) as ProviderId[];
    const found = providerIds.filter(p => finalBinaries[p]?.path && finalBinaries[p]?.version !== null);
    const missing = providerIds.filter(p => !found.includes(p));
    return { found, missing };
  },

  refreshModels: async (provider) => {
    const models = await quota.listModels(provider, get().binaries);
    set(state => ({ models: { ...state.models, [provider]: models } }));
    return models;
  },

  refreshQuota: async (provider) => {
    const result = await quota.fetchQuota(provider);
    set(state => ({ quota: { ...state.quota, [provider]: result } }));
    return result;
  },

  loadQuotaMarks: async () => {
    const pools = await quota.antigravityQuota();
    if (Object.keys(pools).length === 0) return;
    const result = await quota.fetchQuota("antigravity");
    set(state => ({ quota: { ...state.quota, antigravity: result } }));
  },

  submitPrompt: async (text, targetAgentId, projectId, opts) => {
    await orchestrator.submitPrompt(text, targetAgentId, projectId, opts);
  },

  instructAgent: async (agentId, text, projectId, opts) => {
    await orchestrator.instructAgent(agentId, text, projectId, opts);
  },

  stopAgent: async (agentId, projectId) => {
    await orchestrator.stopAgent(agentId, projectId);
  },

  stopAll: async (projectId) => {
    await orchestrator.stopAll(projectId);
  },

  resetSession: (agentId, projectId) => {
    set((state) => {
      if (!state.runtime[projectId]) return state;
      const r = state.runtime[projectId][agentId];
      if (!r) return state;
      return { 
        runtime: { 
          ...state.runtime, 
          [projectId]: { 
            ...state.runtime[projectId], 
            [agentId]: { ...r, sessionId: undefined } 
          } 
        } 
      };
    });
  },

  clearMessages: (projectId) => {
    if (projectId) {
      void history.clearHistory(projectId);
      return;
    }
    set({ messages: [] });
    for (const p of get().config.projects) void history.clearHistory(p.id);
  },

  clearHistory: (projectId) => history.clearHistory(projectId),

  // ---- Chat actions ----
  createChat: (opts) => {
    const id = crypto.randomUUID();
    const chat: Chat = { id, ...opts, createdAt: Date.now() };
    set((state) => ({
      config: { ...state.config, chats: [...state.config.chats, chat] },
      currentChatId: id,
    }));
    debouncedSave();
    return id;
  },

  updateChat: (id, patch) => {
    set((state) => ({
      config: {
        ...state.config,
        chats: state.config.chats.map(c => c.id === id ? { ...c, ...patch } : c)
      }
    }));
    debouncedSave();
  },

  removeChat: (id) => {
    set((state) => {
      const newChats = state.config.chats.filter(c => c.id !== id);
      const newChatMessages = { ...state.chatMessages };
      delete newChatMessages[id];
      const newSessions = { ...state.chatSessions };
      delete newSessions[id];
      return {
        config: { ...state.config, chats: newChats },
        chatMessages: newChatMessages,
        chatSessions: newSessions,
        currentChatId: state.currentChatId === id ? null : state.currentChatId,
      };
    });
    debouncedSave();
  },

  setCurrentChat: (id) => {
    set({ currentChatId: id });
  },

  sendChatMessage: async (chatId, text) => {
    const { sendChatMessage } = await import("@/lib/chat");
    await sendChatMessage(chatId, text);
  },

  stopChat: async (chatId) => {
    const { stopChat } = await import("@/lib/chat");
    await stopChat(chatId);
  },

  loadChatMessages: async (chatId) => {
    const { loadChatMessages } = await import("@/lib/chat");
    await loadChatMessages(chatId);
  },
}));

async function runInit(): Promise<void> {
    const { set, get } = { set: useAppStore.setState, get: useAppStore.getState };
    let config = await getTransport().loadConfig();
    let isSeed = false;
    if (!config) {
      config = generateSeedConfig();
      isSeed = true;
    }
    
    // Migration to version 3
    if ((config.version as number) < 3) {
      const oldConfig = config as any;
      let projects: Project[] = [];
      let lastProjectId = null;
      if (oldConfig.workspaceDir) {
        lastProjectId = crypto.randomUUID();
        projects.push({
          id: lastProjectId,
          name: "Principal",
          workspaceDir: oldConfig.workspaceDir,
          createdAt: Date.now()
        });
      }
      config = {
        ...config,
        version: 4,
        projects,
        lastProjectId,
        skills: config.skills || [],
        mcpServers: config.mcpServers || [],
        sharedContext: config.sharedContext || ""
      } as unknown as AppConfig;
      delete (config as any).workspaceDir;
      isSeed = true; // force save
    }

    // Migration to version 4
    if ((config.version as number) < 4) {
      config = {
        ...config,
        version: 4,
        binaryOverrides: config.binaryOverrides || {},
        profile: config.profile || { name: "", about: "", preferences: "" },
        presets: config.presets || [],
        autoModel: config.autoModel || false
      } as unknown as AppConfig;
      isSeed = true;
    }

    // Migration to version 5
    if ((config.version as number) < 5) {
      config = {
        ...config,
        version: 5,
        hooks: config.hooks || [],
      } as unknown as AppConfig;
      isSeed = true;
    }

    // Migration to version 6
    if ((config.version as number) < 6) {
      config = {
        ...config,
        version: 6,
        chats: config.chats || [],
      } as unknown as AppConfig;
      isSeed = true;
    }

    // Migration to version 7: approvals gate and LAN remote access.
    if ((config.version as number) < 7 || !config.remote) {
      config = {
        ...config,
        version: 7,
        approveDelegations: config.approveDelegations ?? false,
        remote: config.remote ?? { enabled: false, port: 4710, token: crypto.randomUUID() },
      } as unknown as AppConfig;
      isSeed = true;
    }

    // Migration to version 8: system tray and notifications, on by default.
    if ((config.version as number) < 8 || !config.tray) {
      config = {
        ...config,
        version: 8,
        tray: config.tray ?? { enabled: true, notifyApprovals: true, notifyResults: true },
      } as AppConfig;
      isSeed = true;
    }

    
    const runtime: Record<string, Record<string, AgentRuntime>> = {};
    for (const p of config.projects) {
      runtime[p.id] = {};
      for (const a of config.agents) {
        runtime[p.id][a.id] = { agentId: a.id, status: "idle", queuedInstructions: [] };
      }
    }

    // Restore the shell layout; the saved screen only counts when its project still exists.
    const prefs = loadUiPrefs();
    const lastProjectValid = !!config.lastProjectId && config.projects.some(p => p.id === config.lastProjectId);
    const screen: Screen = lastProjectValid ? "project" : "home";
    set({
      config,
      runtime,
      currentProjectId: lastProjectValid ? config.lastProjectId : null,
      screen,
      projectMode: prefs.projectMode,
      commPanelOpen: prefs.commPanelOpen,
      settingsSection: prefs.settingsSection,
      sidebarCollapsed: prefs.sidebarCollapsed,
    });

    if (isTauri()) {
      void getTransport().setTrayEnabled(config.tray.enabled).catch(() => {});
    }

    if (isSeed) {
      await get().saveConfig();
    }
    
    await get().detectBinaries();
    await get().loadQuotaMarks();
    await orchestrator.attachListeners();

    // Restore runs and feed: every project when there are few, otherwise only the last one.
    history.attachHistoryPersistence();
    const toLoad = config.projects.length <= 5
      ? config.projects.map(p => p.id)
      : (config.lastProjectId ? [config.lastProjectId] : []);
    await Promise.all(toLoad.map(id => history.loadHistory(id)));
    history.startHistorySync();

    set({ loaded: true });

    // Remote access is opt-in; a failure (port busy) must not break startup.
    if (config.remote?.enabled) {
      await get().startRemote().catch(() => {});
    }
}

export function selectChildren(state: AppState, agentId: string): AgentConfig[] {
  return state.config.agents.filter(a => a.parentId === agentId);
}

export function selectRoots(state: AppState): AgentConfig[] {
  return state.config.agents.filter(a => a.parentId === null);
}

export function selectAgent(state: AppState, id: string): AgentConfig | undefined {
  return state.config.agents.find(a => a.id === id);
}

export function selectSkillsFor(state: AppState, agentId: string): Skill[] {
  return state.config.skills.filter(s => s.enabledFor === "all" || s.enabledFor.includes(agentId));
}

export function selectMcpFor(state: AppState, agentId: string): McpServer[] {
  return state.config.mcpServers.filter(s => s.enabledFor === "all" || s.enabledFor.includes(agentId));
}

export function selectRuntime(state: AppState, projectId: string | null | undefined, agentId: string): AgentRuntime {
  if (!projectId) return { agentId, status: "idle", queuedInstructions: [] };
  const projectRuntime = state.runtime[projectId];
  if (!projectRuntime) return { agentId, status: "idle", queuedInstructions: [] };
  return projectRuntime[agentId] || { agentId, status: "idle", queuedInstructions: [] };
}

export function selectProjectMessages(state: AppState, projectId: string | null | undefined): CommMessage[] {
  if (!projectId) return [];
  return state.messages.filter(m => m.projectId === projectId || (!m.projectId && m.kind === "system"));
}

export function selectRunningCount(state: AppState, projectId?: string): number {
  let count = 0;
  if (projectId) {
    const projectRuntime = state.runtime[projectId];
    if (!projectRuntime) return 0;
    for (const r of Object.values(projectRuntime)) {
      if (r.status === "working" || r.status === "waiting") count++;
    }
    return count;
  }
  // Count across all projects
  for (const pr of Object.values(state.runtime)) {
    for (const r of Object.values(pr)) {
      if (r.status === "working" || r.status === "waiting") count++;
    }
  }
  return count;
}

export function selectProject(state: AppState, id: string | null | undefined): Project | undefined {
  if (!id) return undefined;
  return state.config.projects.find(p => p.id === id);
}

// Dev-only hook so the app can be driven from a debugger / e2e script.
if (import.meta.env.DEV) {
  if (typeof window !== "undefined") {
    (window as unknown as { __ais?: typeof useAppStore }).__ais = useAppStore;
  }
}
