import { create } from "zustand";
import { AppConfig, AgentConfig, Binaries, AgentRuntime, Run, CommMessage, Skill, McpServer, Project, ProviderId, Chat, ChatMessage, ChatParticipant, Approval, ModelInfo, ProviderQuota, ShellInfo, TerminalTab } from "@/types";
import { getTransport } from "@/lib/transport";
import { isTauri } from "@/lib/tauri";
import * as orchestrator from "@/lib/orchestrator";
import * as history from "@/lib/history";
import * as remote from "@/lib/remote";
import * as quota from "@/lib/quota";
import { setLogLevel, log } from "@/lib/logger";
import { forgetPty } from "@/lib/pty-bus";
import { mergeConfig } from "@/lib/config-merge";

/** The config as this process last loaded or saved it: the base for the three-way merge on save. */
let lastSavedConfig: AppConfig | null = null;

/** Which top-level screen the shell is showing. Settings is a modal, not a screen. */
export type Screen = "home" | "project";
/** Project screen body: conversation or agent graph. */
export type ProjectMode = "chat" | "graph";
/** Which section of the settings dialog's sidebar is open. */
export type SettingsSection = "general" | "agents" | "profile" | "presets" | "skills" | "mcp" | "hooks" | "context" | "remote" | "about";
/** One visited view in the shell back/forward history. */
export interface NavEntry {
  screen: Screen;
  projectId: string | null;
  chatId: string | null;
  projectMode: ProjectMode;
}

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
  /** Whether a chat's messages are being loaded from disk for the first time (for a skeleton). */
  chatLoading: Record<string, boolean>;
  /** Session ids per chat per agent. */
  chatSessions: Record<string, Record<string, string>>;
  /** Currently selected chat id. */
  currentChatId: string | null;
  /** Whether a project's history is being loaded from disk for the first time (for a skeleton). */
  historyLoading: Record<string, boolean>;
  /**
   * Chats with a turn in flight, as reported by the snapshot. Only the phone build fills this:
   * in the app (and the CLI) the real answer lives in `lib/chat.ts`, in this process's memory.
   */
  remoteActiveChats: string[];

  // ---- Shell navigation (persisted in localStorage under "ais.ui") ----
  screen: Screen;
  projectMode: ProjectMode;
  commPanelOpen: boolean;
  /** Whether the terminals section of the right dock is open (persisted). */
  termPanelOpen: boolean;
  /** Fraction of the dock height taken by Comunicación when both sections are open (0.3–0.8, persisted). */
  dockSplit: number;
  /** Settings is a modal, not a screen: whether it's currently open. Not persisted. */
  settingsOpen: boolean;
  settingsSection: SettingsSection;
  /** projectId -> collapsed in the sidebar. */
  sidebarCollapsed: Record<string, boolean>;
  /** Whether the main sidebar rail is expanded (persisted). */
  sidebarOpen: boolean;
  /** Back/forward stack of visited views. Not persisted. */
  navHistory: NavEntry[];
  navIndex: number;
  /** Whether the Ctrl+K search palette is open. Not persisted. */
  searchOpen: boolean;
  openHome(): void;
  /** `chatId` null = orchestrator thread; undefined = keep the current chat if it belongs to the project. */
  openProject(projectId: string, chatId?: string | null): void;
  openSettings(section?: SettingsSection): void;
  closeSettings(): void;
  setProjectMode(mode: ProjectMode): void;
  toggleCommPanel(open?: boolean): void;
  toggleTermPanel(open?: boolean): void;
  setDockSplit(value: number): void;
  toggleSidebarProject(projectId: string): void;
  toggleSidebar(open?: boolean): void;
  toggleSearch(open?: boolean): void;
  goBack(): void;
  goForward(): void;

  // ---- Integrated terminals (in memory only, never persisted) ----
  /** Open terminal tabs, in tab-bar order. */
  terminals: TerminalTab[];
  activeTerminalId: string | null;
  /** Shells detected on this machine, loaded once at startup (desktop app only). */
  shells: ShellInfo[];
  openTerminal(opts?: { shellId?: string; cwd?: string }): void;
  closeTerminal(id: string): void;
  setActiveTerminal(id: string): void;
  renameTerminal(id: string, title: string): void;
  markTerminalExited(id: string, code: number | null): void;

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
  /** True while the remote server is starting or stopping, so every UI can disable its toggle. */
  remoteBusy: boolean;
  /** Turns the local remote server on or off, keeping the config in sync. Throws on failure. */
  toggleRemote(enabled: boolean): Promise<void>;
  startRemote(portOverride?: number): Promise<void>;
  stopRemote(): Promise<void>;
  refreshRemoteStatus(): Promise<void>;
  regenerateRemoteToken(): Promise<void>;

  /** Public tunnel on top of the LAN server. */
  tunnelStatus: remote.TunnelStatus;
  startTunnel(): Promise<void>;
  stopTunnel(): Promise<void>;
  refreshTunnelStatus(): Promise<void>;

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
    version: 9,
    approveDelegations: false,
    remote: { enabled: false, port: 4710, token: crypto.randomUUID(), tunnel: { provider: "cloudflared", enabled: false } },
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
    logLevel: "info",
    autoUpdateCheck: true,
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
  termPanelOpen: boolean;
  dockSplit: number;
  settingsSection: SettingsSection;
  sidebarCollapsed: Record<string, boolean>;
  sidebarOpen: boolean;
}

const UI_PREFS_KEY = "ais.ui";
const defaultUiPrefs: UiPrefs = {
  screen: "home",
  projectMode: "chat",
  commPanelOpen: false,
  termPanelOpen: false,
  dockSplit: 0.5,
  settingsSection: "general",
  sidebarCollapsed: {},
  sidebarOpen: true,
};

const VALID_SETTINGS_SECTIONS: SettingsSection[] = ["general", "agents", "profile", "presets", "skills", "mcp", "hooks", "context", "remote", "about"];

/** Old builds stored "settings" as a screen and "resources" as a settings tab; both were removed. */
function sanitizeSettingsSection(value: unknown): SettingsSection {
  if (value === "resources") return "profile";
  if (typeof value === "string" && (VALID_SETTINGS_SECTIONS as string[]).includes(value)) return value as SettingsSection;
  return "general";
}

/** The dock divider never lets either section shrink below a usable height. */
export const MIN_DOCK_SPLIT = 0.3;
export const MAX_DOCK_SPLIT = 0.8;

function clampDockSplit(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : defaultUiPrefs.dockSplit;
  return Math.min(MAX_DOCK_SPLIT, Math.max(MIN_DOCK_SPLIT, n));
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
      termPanelOpen: parsed.termPanelOpen === true,
      dockSplit: clampDockSplit(parsed.dockSplit),
      settingsSection: sanitizeSettingsSection(parsed.settingsSection),
      sidebarCollapsed: parsed.sidebarCollapsed && typeof parsed.sidebarCollapsed === "object" ? parsed.sidebarCollapsed : {},
      sidebarOpen: parsed.sidebarOpen !== false,
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
      termPanelOpen: s.termPanelOpen,
      dockSplit: s.dockSplit,
      settingsSection: s.settingsSection,
      sidebarCollapsed: s.sidebarCollapsed,
      sidebarOpen: s.sidebarOpen,
    };
    localStorage.setItem(UI_PREFS_KEY, JSON.stringify(prefs));
  } catch {
    // Private mode / quota: layout preferences are not worth failing over.
  }
}

/** Hard cap on open terminals: eight PTYs is already a lot of live shells. */
export const MAX_TERMINALS = 8;

/** Cap on the back/forward stack: enough for a session, small enough to stay cheap. */
const MAX_NAV = 50;

function sameNavEntry(a: NavEntry, b: NavEntry): boolean {
  return a.screen === b.screen && a.projectId === b.projectId && a.chatId === b.chatId && a.projectMode === b.projectMode;
}

/** Records a view the user navigated to, dropping whatever was ahead in the stack. */
function pushNav(entry: NavEntry): void {
  useAppStore.setState(s => {
    const current = s.navHistory[s.navIndex];
    if (current && sameNavEntry(current, entry)) return {};
    const navHistory = [...s.navHistory.slice(0, s.navIndex + 1), entry].slice(-MAX_NAV);
    return { navHistory, navIndex: navHistory.length - 1 };
  });
}

/** Restores a recorded view without touching the history stack. */
function applyNav(entry: NavEntry): void {
  const state = useAppStore.getState();
  const projectExists = !!entry.projectId && state.config.projects.some(p => p.id === entry.projectId);
  // The project may have been deleted since it was visited; fall back to home instead of a blank screen.
  const screen: Screen = entry.screen === "project" && !projectExists ? "home" : entry.screen;
  if (entry.projectId && projectExists && entry.projectId !== state.currentProjectId) {
    state.setCurrentProject(entry.projectId);
  }
  useAppStore.setState({
    screen,
    currentChatId: screen === "project" ? entry.chatId : state.currentChatId,
    projectMode: entry.projectMode,
  });
  if (screen === "project" && entry.chatId) void state.loadChatMessages(entry.chatId);
  saveUiPrefs();
}

/** Derived flags for the title bar arrows. */
export const canGoBack = (s: AppState): boolean => s.navIndex > 0;
export const canGoForward = (s: AppState): boolean => s.navIndex < s.navHistory.length - 1;

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
  config: { version: 9, approveDelegations: false, remote: { enabled: false, port: 4710, token: "", tunnel: { provider: "cloudflared", enabled: false } }, tray: { enabled: true, notifyApprovals: true, notifyResults: true }, agents: [], projects: [], lastProjectId: null, maxRounds: 6, skills: [], mcpServers: [], hooks: [], sharedContext: "", binaryOverrides: {}, profile: { name: "", about: "", preferences: "" }, presets: [], autoModel: false, chats: [], logLevel: "info", autoUpdateCheck: true } as AppConfig,
  binaries: {},
  models: {},
  quota: {},
  runtime: {},
  runs: {},
  messages: [],
  activeTaskRunId: {},
  currentProjectId: null,
  chatMessages: {},
  chatLoading: {},
  chatSessions: {},
  currentChatId: null,
  historyLoading: {},
  remoteActiveChats: [],
  approvals: {},
  navHistory: [{ screen: "home" as Screen, projectId: null, chatId: null, projectMode: "chat" as ProjectMode }],
  navIndex: 0,
  searchOpen: false,
  terminals: [],
  activeTerminalId: null,
  shells: [],

  ...(() => {
    const prefs = loadUiPrefs();
    // The saved screen is only restored once the project list is known (see runInit).
    return { ...prefs, screen: "home" as Screen, settingsOpen: false };
  })(),

  openHome: () => {
    const state = get();
    set({ screen: "home" });
    pushNav({ screen: "home", projectId: state.currentProjectId, chatId: state.currentChatId, projectMode: state.projectMode });
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
    pushNav({ screen: "project", projectId, chatId: nextChatId, projectMode: state.projectMode });
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
    const state = get();
    set({ projectMode: mode });
    pushNav({ screen: state.screen, projectId: state.currentProjectId, chatId: state.currentChatId, projectMode: mode });
    saveUiPrefs();
  },

  toggleCommPanel: (open) => {
    set(s => ({ commPanelOpen: open ?? !s.commPanelOpen }));
    saveUiPrefs();
  },

  toggleTermPanel: (open) => {
    set(s => ({ termPanelOpen: open ?? !s.termPanelOpen }));
    saveUiPrefs();
  },

  setDockSplit: (value) => {
    set({ dockSplit: clampDockSplit(value) });
    saveUiPrefs();
  },

  toggleSidebarProject: (projectId) => {
    set(s => ({ sidebarCollapsed: { ...s.sidebarCollapsed, [projectId]: !s.sidebarCollapsed[projectId] } }));
    saveUiPrefs();
  },

  toggleSidebar: (open) => {
    set(s => ({ sidebarOpen: open ?? !s.sidebarOpen }));
    saveUiPrefs();
  },

  toggleSearch: (open) => {
    set(s => ({ searchOpen: open ?? !s.searchOpen }));
  },

  goBack: () => {
    const { navIndex, navHistory } = get();
    if (navIndex <= 0) return;
    const next = navIndex - 1;
    set({ navIndex: next });
    applyNav(navHistory[next]);
  },

  goForward: () => {
    const { navIndex, navHistory } = get();
    if (navIndex >= navHistory.length - 1) return;
    const next = navIndex + 1;
    set({ navIndex: next });
    applyNav(navHistory[next]);
  },

  approve: (approvalId, note) => orchestrator.approveApproval(approvalId, note),
  reject: (approvalId, note) => orchestrator.rejectApproval(approvalId, note),

  remoteStatus: { running: false, clients: 0 },
  remoteBusy: false,
  toggleRemote: async (enabled) => {
    const before = get().config.remote;
    set({ remoteBusy: true });
    get().updateConfig({ remote: { ...before, enabled } });
    try {
      if (enabled) {
        await get().startRemote();
      } else {
        await get().stopRemote();
        // The tunnel forwards to this server: it cannot outlive it.
        const remote = get().config.remote;
        if (remote.tunnel.enabled) {
          get().updateConfig({ remote: { ...remote, tunnel: { ...remote.tunnel, enabled: false } } });
        }
      }
    } catch (e) {
      get().updateConfig({ remote: { ...get().config.remote, enabled: false } });
      throw e;
    } finally {
      set({ remoteBusy: false });
    }
  },
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
    // The tunnel forwards to the local server: without it, it points at nothing.
    if (get().tunnelStatus.running) await get().stopTunnel().catch(() => {});
    await remote.stopRemote();
    set({ remoteStatus: { running: false, clients: 0 } });
  },

  tunnelStatus: { running: false },
  startTunnel: async () => {
    try {
      const status = await remote.startTunnel();
      set({ tunnelStatus: status });
    } catch (e) {
      const message = e instanceof Error ? e.message : String(e);
      log.error("tunnel", message);
      set({ tunnelStatus: { running: false, error: message } });
      throw e;
    }
  },
  stopTunnel: async () => {
    await remote.stopTunnel();
    set({ tunnelStatus: { running: false } });
  },
  refreshTunnelStatus: async () => {
    const status = await getTransport().tunnelStatus();
    set(state => ({
      tunnelStatus: status.running
        ? { ...status }
        : { running: false, error: state.tunnelStatus.running ? "Se cayó el túnel" : state.tunnelStatus.error },
    }));
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

  // ---- Integrated terminals ----
  openTerminal: (opts) => {
    const state = get();
    if (state.terminals.length >= MAX_TERMINALS) return;
    const shells = state.shells;
    if (shells.length === 0) {
      log.warn("terminal", "no hay ningún shell disponible en esta máquina");
      return;
    }
    const shell = (opts?.shellId && shells.find(sh => sh.id === opts.shellId)) || shells[0];
    const project = selectProject(state, state.currentProjectId);
    const cwd = opts?.cwd ?? project?.workspaceDir ?? "";
    // Titles are numbered per shell so two PowerShells are still telling apart.
    const used = state.terminals.filter(t => t.shellId === shell.id).length + 1;
    const terminal: TerminalTab = {
      id: `term-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      title: `${shell.label} ${used}`,
      shellId: shell.id,
      shellPath: shell.path,
      cwd,
      projectId: state.currentProjectId,
      exited: null,
    };
    set(s => ({
      terminals: [...s.terminals, terminal],
      activeTerminalId: terminal.id,
      termPanelOpen: true,
    }));
    saveUiPrefs();
    log.info("terminal", `nueva terminal ${terminal.title} (${shell.path}) en ${cwd || "home"}`);
  },

  closeTerminal: (id) => {
    const state = get();
    const index = state.terminals.findIndex(t => t.id === id);
    if (index === -1) return;
    forgetPty(id);
    void getTransport().ptyKill(id).catch(e => log.warn("terminal", `no se pudo cerrar ${id}: ${e}`));
    const terminals = state.terminals.filter(t => t.id !== id);
    let activeTerminalId = state.activeTerminalId;
    if (activeTerminalId === id) {
      const neighbour = terminals[Math.min(index, terminals.length - 1)];
      activeTerminalId = neighbour ? neighbour.id : null;
    }
    set({ terminals, activeTerminalId });
  },

  setActiveTerminal: (id) => {
    if (!get().terminals.some(t => t.id === id)) return;
    set({ activeTerminalId: id });
  },

  renameTerminal: (id, title) => {
    const clean = title.trim();
    if (!clean) return;
    set(s => ({ terminals: s.terminals.map(t => (t.id === id ? { ...t, title: clean.slice(0, 40) } : t)) }));
  },

  markTerminalExited: (id, code) => {
    set(s => ({ terminals: s.terminals.map(t => (t.id === id ? { ...t, exited: code } : t)) }));
  },

  init: () => {
    // Idempotent: StrictMode mounts twice and both calls must share one initialization.
    if (!initPromise) initPromise = runInit();
    return initPromise;
  },

  saveConfig: async () => {
    // Several processes share the file (app, `ais run`, `ais serve`): merge with what is on disk
    // so a project or chat another process added since we loaded is not wiped by our copy.
    let disk: AppConfig | null = null;
    try { disk = await getTransport().loadConfig(); } catch { /* unreadable: our copy wins */ }
    const merged = mergeConfig(disk, get().config, lastSavedConfig);
    await getTransport().saveConfig(merged);
    lastSavedConfig = merged;
    if (merged !== get().config) set({ config: merged });
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
    if (patch.logLevel) setLogLevel(patch.logLevel);
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
            [agentId]: { ...r, sessionId: undefined, sessionUpdatedAt: Date.now() }
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
    const state = get();
    if (state.currentChatId === id) return;
    set({ currentChatId: id });
    if (state.screen === "project" && state.currentProjectId) {
      pushNav({ screen: "project", projectId: state.currentProjectId, chatId: id, projectMode: state.projectMode });
    }
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
      } as unknown as AppConfig;
      isSeed = true;
    }

    // Migration to version 9: file logging, update checks and the public tunnel.
    if ((config.version as number) < 9 || !config.remote?.tunnel) {
      config = {
        ...config,
        version: 9,
        logLevel: config.logLevel ?? "info",
        autoUpdateCheck: config.autoUpdateCheck ?? true,
        remote: {
          ...config.remote,
          tunnel: config.remote?.tunnel ?? { provider: "cloudflared", enabled: false },
        },
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
    lastSavedConfig = config;
    set({
      config,
      runtime,
      currentProjectId: lastProjectValid ? config.lastProjectId : null,
      screen,
      projectMode: prefs.projectMode,
      commPanelOpen: prefs.commPanelOpen,
      termPanelOpen: prefs.termPanelOpen,
      dockSplit: prefs.dockSplit,
      settingsSection: prefs.settingsSection,
      sidebarCollapsed: prefs.sidebarCollapsed,
      sidebarOpen: prefs.sidebarOpen,
      navHistory: [{
        screen,
        projectId: lastProjectValid ? config.lastProjectId : null,
        chatId: null,
        projectMode: prefs.projectMode,
      }],
      navIndex: 0,
    });

    setLogLevel(config.logLevel ?? "info");
    log.info("app", `configuración cargada (${config.projects.length} proyectos, ${config.agents.length} agentes)`);

    if (isTauri()) {
      void getTransport().setTrayEnabled(config.tray.enabled).catch(() => {});
      // Terminals need the list of shells before the first tab can be opened.
      void getTransport()
        .ptyListShells()
        .then(shells => set({ shells }))
        .catch(e => log.warn("terminal", `no se pudieron detectar los shells: ${e}`));
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

    // Remote access is opt-in; a failure (port busy) must not break startup. A reload of the
    // frontend finds the server already up: adopt it instead of trying to start a second one.
    if (config.remote?.enabled) {
      await get().refreshRemoteStatus().catch(() => {});
      if (!get().remoteStatus.running) await get().startRemote().catch(() => {});
      if (config.remote.tunnel?.enabled && get().remoteStatus.running) {
        await get().startTunnel().catch(() => {});
      }
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
