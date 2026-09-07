import { create } from "zustand";
import { AppConfig, AgentConfig, AgentQuestion, AgentWorktree, Binaries, AgentRuntime, Run, CommMessage, Skill, McpServer, Project, Formation, ProviderId, Chat, ChatMessage, ChatParticipant, Approval, AppNotification, ModelInfo, ProviderQuota, ShellInfo, TerminalTab, Task, TaskStatus } from "@/types";
import { getTransport } from "@/lib/transport";
import { isTauri } from "@/lib/tauri";
import * as orchestrator from "@/lib/orchestrator";
import * as history from "@/lib/history";
import * as taskStore from "@/lib/task-store";
import * as taskLogic from "@/lib/tasks";
import { reconcileProject } from "@/lib/task-reconcile";
import * as remote from "@/lib/remote";
import * as quota from "@/lib/quota";
import { readRepoState, readRepoStatus, type RepoState } from "@/lib/git-repo";
import { setLogLevel, log } from "@/lib/logger";
import { forgetPty } from "@/lib/pty-bus";
import { mergeConfig } from "@/lib/config-merge";
import * as notifications from "@/lib/notifications";
import { translateNow } from "@/i18n/useT";
// sections.ts only has a type-import back to store, no runtime cycle.
import { ALL_SETTINGS_SECTION_IDS } from "@/components/settings/sections";
import * as notificationStore from "@/lib/notification-store";

/** The config as this process last loaded or saved it: the base for the three-way merge on save. */
let lastSavedConfig: AppConfig | null = null;

/**
 * Forgets deleted conversations: their turn in flight and their file on disk. `lib/chat.ts` imports
 * this module, so it is loaded on demand here, the same as the other chat actions below.
 */
function forgetChats(chatIds: string[]): void {
  if (chatIds.length === 0) return;
  void import("@/lib/chat").then(m => { for (const id of chatIds) m.forgetChat(id); }).catch(() => {});
}

/** Which top-level screen the shell is showing. Settings is a modal, not a screen. */
export type Screen = "home" | "project";
/** Project screen body: task board, conversation or agent graph. */
export type ProjectMode = "tasks" | "chat" | "graph";
/** How the tasks of a project are shown: kanban columns or dependency graph. */
export type TaskView = "board" | "graph";
/** Which section of the settings dialog's sidebar is open. */
export type SettingsSection = "general" | "agents" | "profile" | "presets" | "skills" | "mcp" | "hooks" | "context" | "remote" | "diagnostics" | "about";
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
  /** Last known repository state per project (branch, changes, pull requests). */
  repoState: Record<string, RepoState>;
  /** Git worktrees per project, one per agent that works in its own branch (see src/lib/worktree.ts). */
  worktrees: Record<string, AgentWorktree[]>;
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

  /** Tasks per project, loaded from disk on demand (see src/lib/task-store.ts). */
  tasks: Record<string, Task[]>;

  // ---- Shell navigation (persisted in localStorage under "ais.ui") ----
  screen: Screen;
  projectMode: ProjectMode;
  /** Board or dependency graph, inside the Tareas mode (persisted). */
  taskView: TaskView;
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
  /** Whether the Ctrl+/ shortcuts dialog is open. Not persisted. */
  shortcutsOpen: boolean;
  /** Task the board should open its detail dialog on (set by the search palette). Not persisted. */
  focusedTaskId: string | null;
  openHome(): void;
  /** `chatId` null = orchestrator thread; undefined = keep the current chat if it belongs to the project. */
  openProject(projectId: string, chatId?: string | null): void;
  openSettings(section?: SettingsSection): void;
  closeSettings(): void;
  setProjectMode(mode: ProjectMode): void;
  setTaskView(view: TaskView): void;
  toggleCommPanel(open?: boolean): void;
  toggleTermPanel(open?: boolean): void;
  setDockSplit(value: number): void;
  toggleSidebarProject(projectId: string): void;
  toggleSidebar(open?: boolean): void;
  toggleSearch(open?: boolean): void;
  toggleShortcuts(open?: boolean): void;
  /** Asks the task board to open (or close, with null) one task's detail. */
  focusTask(taskId: string | null): void;
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
  /**
   * Creates a project and its team. `agents` wins when given (the project dialog hands over the
   * list the user edited); otherwise the formation applies: `formationId` when set, the default
   * one when the option is absent, and none when it is explicitly null.
   */
  addProject(project: Omit<Project, "id" | "createdAt" | "agents"> & { agents?: AgentConfig[] }, opts?: { formationId?: string | null }): void;
  updateProject(id: string, patch: Partial<Project>): void;
  removeProject(id: string): void;
  setCurrentProject(id: string | null): void;
  setMaxRounds(n: number): void;
  /** Adds an agent to a project's team (replacing the one with the same id, if any). */
  addAgent(projectId: string, agent: AgentConfig): void;
  updateAgent(projectId: string, agentId: string, patch: Partial<AgentConfig>): void;
  /** Removes an agent; its children are re-parented to its own parent, never deleted. */
  removeAgent(projectId: string, agentId: string): void;
  /** Copies the agents of a formation into a project's team, with fresh ids. */
  applyFormation(projectId: string, formationId: string): void;
  upsertFormation(formation: Formation): void;
  removeFormation(formationId: string): void;
  setDefaultFormation(formationId: string | null): void;
  /** Saves a project's current team as a reusable formation and returns its id. */
  saveProjectAsFormation(projectId: string, name: string): string | undefined;
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
  /** Re-reads the git state of a project's workspace. Read-only, and never throws. */
  refreshRepoState(projectId: string): Promise<void>;
  /**
   * Re-reads only the local half (branch and working tree), for when the folder itself says it
   * changed. Cheap enough to run on every save; the pull requests stay on `refreshRepoState`.
   */
  refreshRepoStatus(projectId: string): Promise<void>;

  // ---- Agent worktrees (src/lib/worktree.ts) ----
  /** Records (or replaces) the worktree an agent works in. */
  setWorktree(projectId: string, worktree: AgentWorktree): void;
  /** Forgets a worktree record. The folder on disk is only removed by `removeWorktree`. */
  forgetWorktree(projectId: string, agentId: string): void;

  submitPrompt(text: string, targetAgentId: string, projectId: string, opts?: { model?: string }): Promise<void>;
  instructAgent(agentId: string, text: string, projectId: string, opts?: { model?: string }): Promise<void>;
  stopAgent(agentId: string, projectId: string): Promise<void>;
  stopAll(projectId?: string): Promise<void>;
  resetSession(agentId: string, projectId: string): void;
  clearMessages(projectId?: string): void;
  /** Drops a project's runs and feed, in memory and on disk. */
  clearHistory(projectId: string): Promise<void>;

  // ---- Tasks (board and dependency graph, see src/lib/tasks.ts) ----
  loadTasks(projectId: string): Promise<void>;
  addTask(projectId: string, partial?: Partial<Task>): Task;
  updateTask(id: string, patch: Partial<Task>): void;
  /** `index` counts the target column without the moved task. */
  moveTask(id: string, status: TaskStatus, index: number): void;
  removeTask(id: string): void;
  archiveTask(id: string, archived?: boolean): void;
  /** Makes `id` depend on `dependsOnId`. Returns false when it would close a loop. */
  linkTaskDependency(id: string, dependsOnId: string): boolean;
  unlinkTaskDependency(id: string, dependsOnId: string): void;

  /**
   * Questions agents asked, with the options they offered (see `parseQuestions`). Kept beside the
   * approvals because they are the same kind of thing: a run that stopped needing the user.
   */
  questions: Record<string, AgentQuestion>;
  /** Answers one and lets the agent carry on with what was chosen. */
  answerQuestion(questionId: string, answer: string[]): void;

  // Approvals (delegations waiting for the user's go-ahead)
  approvals: Record<string, Approval>;
  approve(approvalId: string, note?: string): Promise<void>;
  reject(approvalId: string, note?: string): Promise<void>;

  // ---- Notification center (the bell in the window bar; in memory only) ----
  /** Newest first, capped at `MAX_NOTIFICATIONS`. Never written to disk. */
  notifications: AppNotification[];
  /** Whether the bell's panel is open. Not persisted. */
  notificationsOpen: boolean;
  notify(n: notifications.NotificationInput): void;
  markNotificationsRead(): void;
  markNotificationRead(id: string): void;
  /** Everything said about one approval stops asking once the user decided. */
  markApprovalNotificationsRead(approvalId: string): void;
  dismissNotification(id: string): void;
  clearNotifications(): void;
  toggleNotifications(open?: boolean): void;

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

/**
 * A fresh install: no projects, no agents, no formations.
 *
 * It used to come with a team already made — a planner and two implementers, on Claude Code,
 * Antigravity and Copilot. It read as a suggestion of what a team looks like, but it is really a
 * claim about the machine: whoever installs this may have none of those CLIs, and the first thing
 * they got was a team wired to programs that are not there. Everyone builds their own.
 */
function generateSeedConfig(): AppConfig {
  return {
    version: 12,
    language: null,
    approveDelegations: false,
    remote: { enabled: false, port: 4710, token: crypto.randomUUID(), tunnel: { provider: "cloudflared", enabled: false } },
    tray: { enabled: true, notifyApprovals: true, notifyResults: true },
    projects: [],
    formations: [],
    defaultFormationId: null,
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
    autoArchiveDoneDays: null,
  };
}

/**
 * Copies a team keeping its shape: every agent gets a new id and every `parentId` is remapped to
 * the new id of its parent (a parent that is not in the list becomes a root, so nothing is lost).
 */
export function cloneAgentsMapped(agents: AgentConfig[]): { agents: AgentConfig[]; idMap: Map<string, string> } {
  const idMap = new Map(agents.map(a => [a.id, crypto.randomUUID()]));
  return {
    idMap,
    agents: agents.map(a => ({
      ...a,
      id: idMap.get(a.id)!,
      parentId: a.parentId ? idMap.get(a.parentId) ?? null : null,
    })),
  };
}

export function cloneAgents(agents: AgentConfig[]): AgentConfig[] {
  return cloneAgentsMapped(agents).agents;
}

/**
 * Re-points a formation's skill and MCP assignments at the agents it just created. A resource that
 * is enabled for everyone, or that no longer exists, is left alone.
 */
export function applyAssignments(
  config: AppConfig,
  formation: Formation,
  idMap: Map<string, string>,
): Pick<AppConfig, "skills" | "mcpServers"> {
  const assignments = formation.assignments;
  if (!assignments) return { skills: config.skills, mcpServers: config.mcpServers };
  const wanted = { skills: new Map<string, string[]>(), mcpServers: new Map<string, string[]>() };
  for (const [formationAgentId, resources] of Object.entries(assignments)) {
    const newAgentId = idMap.get(formationAgentId);
    if (!newAgentId) continue;
    for (const kind of ["skills", "mcpServers"] as const) {
      for (const resourceId of resources[kind] ?? []) {
        const list = wanted[kind].get(resourceId) ?? [];
        list.push(newAgentId);
        wanted[kind].set(resourceId, list);
      }
    }
  }
  const grow = <T extends { id: string; enabledFor: "all" | string[] }>(items: T[], map: Map<string, string[]>): T[] =>
    items.map(item => {
      const add = map.get(item.id);
      if (!add || item.enabledFor === "all") return item;
      return { ...item, enabledFor: [...item.enabledFor, ...add.filter(id => !item.enabledFor.includes(id))] };
    });
  return { skills: grow(config.skills, wanted.skills), mcpServers: grow(config.mcpServers, wanted.mcpServers) };
}

/** A runtime entry per agent: without it the first run of a project crashes. */
function runtimeFor(agents: AgentConfig[]): Record<string, AgentRuntime> {
  const runtime: Record<string, AgentRuntime> = {};
  for (const a of agents) runtime[a.id] = { agentId: a.id, status: "idle", queuedInstructions: [] };
  return runtime;
}

/** Shell layout preferences, kept out of the config file (per-machine, not per-project). */
interface UiPrefs {
  screen: Screen;
  projectMode: ProjectMode;
  taskView: TaskView;
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
  projectMode: "tasks",
  taskView: "board",
  commPanelOpen: false,
  termPanelOpen: false,
  dockSplit: 0.5,
  settingsSection: "general",
  sidebarCollapsed: {},
  sidebarOpen: true,
};

const VALID_PROJECT_MODES: ProjectMode[] = ["tasks", "chat", "graph"];

// Derived from sections.ts so adding a new section only requires one edit.
const VALID_SETTINGS_SECTIONS: SettingsSection[] = ALL_SETTINGS_SECTION_IDS;

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
      projectMode: VALID_PROJECT_MODES.includes(parsed.projectMode as ProjectMode) ? (parsed.projectMode as ProjectMode) : "tasks",
      taskView: parsed.taskView === "graph" ? "graph" : "board",
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
      taskView: s.taskView,
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

/** Repo reads in flight, per project, so the timer and the run-finished trigger never overlap. */
const repoReads = new Map<string, Promise<void>>();

/** Which project a task belongs to, plus that project's list: tasks are keyed by project. */
function findTaskProject(state: AppState, taskId: string): [string, Task[]] | undefined {
  for (const [projectId, list] of Object.entries(state.tasks)) {
    if (list.some(t => t.id === taskId)) return [projectId, list];
  }
  return undefined;
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
  config: { version: 12, language: null, approveDelegations: false, remote: { enabled: false, port: 4710, token: "", tunnel: { provider: "cloudflared", enabled: false } }, tray: { enabled: true, notifyApprovals: true, notifyResults: true }, projects: [], formations: [], defaultFormationId: null, lastProjectId: null, maxRounds: 6, skills: [], mcpServers: [], hooks: [], sharedContext: "", binaryOverrides: {}, profile: { name: "", about: "", preferences: "" }, presets: [], autoModel: false, chats: [], logLevel: "info", autoUpdateCheck: true, autoArchiveDoneDays: null } as AppConfig,
  binaries: {},
  models: {},
  quota: {},
  repoState: {},
  worktrees: {},
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
  questions: {},
  tasks: {},
  navHistory: [{ screen: "home" as Screen, projectId: null, chatId: null, projectMode: "chat" as ProjectMode }],
  navIndex: 0,
  searchOpen: false,
  shortcutsOpen: false,
  focusedTaskId: null,
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
    // Opening a project lands on its board; asking for a chat lands on the chat. Keeping the
    // current chat (chatId undefined) means "come back here", so the mode is left alone.
    const nextMode: ProjectMode = chatId === undefined ? state.projectMode : chatId === null ? "tasks" : "chat";
    if (!sameProject) state.setCurrentProject(projectId);
    set({ currentChatId: nextChatId, screen: "project", projectMode: nextMode });
    pushNav({ screen: "project", projectId, chatId: nextChatId, projectMode: nextMode });
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

  setTaskView: (view) => {
    set({ taskView: view });
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

  toggleShortcuts: (open) => {
    set(s => ({ shortcutsOpen: open ?? !s.shortcutsOpen }));
  },

  focusTask: (taskId) => {
    set({ focusedTaskId: taskId });
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

  notifications: [],
  notificationsOpen: false,
  notify: (n) => {
    set(state => ({
      notifications: notifications.pushNotification(state.notifications, n, { id: crypto.randomUUID(), ts: Date.now() }),
    }));
  },
  markNotificationsRead: () => {
    set(state => ({ notifications: notifications.markAllRead(state.notifications) }));
  },
  markNotificationRead: (id) => {
    set(state => ({ notifications: notifications.markRead(state.notifications, id) }));
  },
  markApprovalNotificationsRead: (approvalId) => {
    set(state => ({ notifications: notifications.markApprovalRead(state.notifications, approvalId) }));
  },
  dismissNotification: (id) => {
    set(state => ({ notifications: notifications.dismissNotification(state.notifications, id) }));
  },
  clearNotifications: () => {
    set({ notifications: [] });
  },
  toggleNotifications: (open) => {
    set(s => ({ notificationsOpen: open ?? !s.notificationsOpen }));
  },

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
    const fell = get().tunnelStatus.running && !status.running;
    set(state => ({
      tunnelStatus: status.running
        ? { ...status }
        : { running: false, error: state.tunnelStatus.running ? "Se cayó el túnel" : state.tunnelStatus.error },
    }));
    if (fell) {
      get().notify({ kind: "tunnel", title: translateNow("notify.tunnelDown"), body: translateNow("notify.tunnelDownBody") });
    }
  },
  refreshRemoteStatus: async () => {
    const status = await getTransport().remoteStatus();
    // The server outlives a reload of the frontend, and this process comes back not knowing it:
    // adopt it here, or it would never push another snapshot to the phone (see adoptRemote).
    if (status.running) await remote.adoptRemote().catch(() => {});
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

  addProject: (project, opts) => {
    set((state) => {
      const id = crypto.randomUUID();
      // The dialog hands over the team the user edited; without one, the formation decides.
      let agents: AgentConfig[];
      // A formation can also carry which skills and MCP servers its agents had.
      let resources: Partial<Pick<AppConfig, "skills" | "mcpServers">> = {};
      if (project.agents) {
        agents = project.agents;
      } else {
        const formationId = opts && "formationId" in opts ? opts.formationId : state.config.defaultFormationId;
        const formation = formationId ? state.config.formations.find(f => f.id === formationId) : undefined;
        if (formation) {
          const cloned = cloneAgentsMapped(formation.agents);
          agents = cloned.agents;
          resources = applyAssignments(state.config, formation, cloned.idMap);
        } else {
          agents = [];
        }
      }
      const newProject: Project = { ...project, agents, id, createdAt: Date.now() };
      return {
        config: { ...state.config, ...resources, projects: [...state.config.projects, newProject] },
        runtime: { ...state.runtime, [id]: runtimeFor(agents) },
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

  /**
   * Deleting a project takes everything hanging off it with it. Anything keyed by (or pointing at)
   * the project has to go in this one pass: what stays behind keeps showing up in the shell —
   * pending approvals in the sidebar badge, bell notifications, back/forward entries that navigate
   * to a project that no longer exists — with no screen left to clear it from.
   */
  removeProject: (id) => {
    const before = get();
    const chatIds = before.config.chats.filter(c => c.projectId === id).map(c => c.id);
    // Side effects first: killing the runs and emptying the files is async, the `set` below is not.
    orchestrator.stopAll(id);
    history.forgetHistory(id);
    taskStore.forgetTasks(id);
    forgetChats(chatIds);

    set((state) => {
      const goneChats = new Set(chatIds);
      const newProjects = state.config.projects.filter(p => p.id !== id);
      const newRuntime = { ...state.runtime };
      delete newRuntime[id];
      const newActiveTask = { ...state.activeTaskRunId };
      delete newActiveTask[id];
      const newRepoState = { ...state.repoState };
      delete newRepoState[id];
      // The folders on disk are left alone on purpose: deleting a project must never run
      // `git worktree remove` behind the user's back.
      const newWorktrees = { ...state.worktrees };
      delete newWorktrees[id];
      const newMessages = state.messages.filter(m => m.projectId !== id);
      const goneRuns = new Set(Object.values(state.runs).filter(r => r.projectId === id).map(r => r.id));
      const newRuns = Object.fromEntries(Object.entries(state.runs).filter(([, r]) => r.projectId !== id));
      const goneTasks = new Set((state.tasks[id] ?? []).map(t => t.id));
      const newTasks = { ...state.tasks };
      delete newTasks[id];
      // Chats belong to the project, so they go with it (otherwise they stay orphaned in config).
      const newChats = state.config.chats.filter(c => c.projectId !== id);
      // A hook that only fires for this project can never fire again.
      const newHooks = state.config.hooks.filter(h => h.filter?.projectId !== id);

      // Approvals waiting for the user: the run they would launch is gone with the project.
      const goneApprovals = new Set(
        Object.values(state.approvals).filter(a => a.projectId === id).map(a => a.id),
      );
      const newApprovals = Object.fromEntries(
        Object.entries(state.approvals).filter(([, a]) => a.projectId !== id),
      );
      const newQuestions = Object.fromEntries(
        Object.entries(state.questions).filter(([, q]) => q.projectId !== id),
      );
      // Whatever the bell said about this project (or about one of its approvals or runs) goes too.
      const newNotifications = state.notifications.filter(n =>
        n.projectId !== id
        && !(n.approvalId && goneApprovals.has(n.approvalId))
        && !(n.runId && goneRuns.has(n.runId)),
      );

      const dropByChat = <T,>(map: Record<string, T>): Record<string, T> =>
        Object.fromEntries(Object.entries(map).filter(([chatId]) => !goneChats.has(chatId)));

      const newHistoryLoading = { ...state.historyLoading };
      delete newHistoryLoading[id];
      const newSidebarCollapsed = { ...state.sidebarCollapsed };
      delete newSidebarCollapsed[id];

      // Back/forward must not offer a project that is gone; the index follows what is left.
      const keptNav = state.navHistory.filter(e => e.projectId !== id);
      const droppedBefore = state.navHistory.slice(0, state.navIndex + 1).filter(e => e.projectId === id).length;
      const navHistory = keptNav.length > 0 ? keptNav : [{ screen: "home" as Screen, projectId: null, chatId: null, projectMode: "chat" as ProjectMode }];
      const navIndex = Math.min(Math.max(state.navIndex - droppedBefore, 0), navHistory.length - 1);

      const wasCurrent = state.currentProjectId === id;
      const chatGone = state.currentChatId ? goneChats.has(state.currentChatId) : false;
      return {
        config: { ...state.config, projects: newProjects, chats: newChats, hooks: newHooks },
        runtime: newRuntime,
        activeTaskRunId: newActiveTask,
        repoState: newRepoState,
        worktrees: newWorktrees,
        messages: newMessages,
        runs: newRuns,
        tasks: newTasks,
        approvals: newApprovals,
        questions: newQuestions,
        notifications: newNotifications,
        chatMessages: dropByChat(state.chatMessages),
        chatSessions: dropByChat(state.chatSessions),
        chatLoading: dropByChat(state.chatLoading),
        remoteActiveChats: state.remoteActiveChats.filter(c => !goneChats.has(c)),
        historyLoading: newHistoryLoading,
        sidebarCollapsed: newSidebarCollapsed,
        navHistory,
        navIndex,
        // The search palette may have asked the board to open a card of this project.
        focusedTaskId: state.focusedTaskId && goneTasks.has(state.focusedTaskId) ? null : state.focusedTaskId,
        // The shells keep running (only their tab, `exit` or closing the app may kill one), but
        // they no longer belong to anything.
        terminals: state.terminals.map(t => (t.projectId === id ? { ...t, projectId: null } : t)),
        currentProjectId: wasCurrent ? null : state.currentProjectId,
        currentChatId: wasCurrent || chatGone ? null : state.currentChatId,
        // Losing the open project drops the user back to the home screen.
        screen: wasCurrent && state.screen === "project" ? ("home" as Screen) : state.screen,
      };
    });
    saveUiPrefs();
    debouncedSave();
  },

  setCurrentProject: (id) => {
    set((state) => ({ currentProjectId: id, config: { ...state.config, lastProjectId: id } }));
    if (id) {
      // Both, then the board: a card whose run ended while the app was closed is still sitting in
      // "en curso" and only the history says so (see lib/task-reconcile.ts).
      void Promise.all([history.loadHistory(id), get().loadTasks(id)])
        .then(() => reconcileProject(id))
        .catch(() => {});
    }
    debouncedSave();
  },

  setMaxRounds: (n) => {
    set((state) => ({ config: { ...state.config, maxRounds: n } }));
    debouncedSave();
  },

  addAgent: (projectId, agent) => {
    set((state) => {
      const project = state.config.projects.find(p => p.id === projectId);
      if (!project) return state;
      const agents = [...(project.agents ?? [])];
      const idx = agents.findIndex(a => a.id === agent.id);
      if (idx >= 0) agents[idx] = agent;
      else agents.push(agent);
      return {
        config: { ...state.config, projects: state.config.projects.map(p => p.id === projectId ? { ...p, agents } : p) },
        runtime: {
          ...state.runtime,
          [projectId]: {
            ...(state.runtime[projectId] ?? {}),
            [agent.id]: state.runtime[projectId]?.[agent.id] ?? { agentId: agent.id, status: "idle", queuedInstructions: [] },
          },
        },
      };
    });
    debouncedSave();
  },

  updateAgent: (projectId, agentId, patch) => {
    set((state) => ({
      config: {
        ...state.config,
        projects: state.config.projects.map(p => p.id === projectId
          ? { ...p, agents: (p.agents ?? []).map(a => a.id === agentId ? { ...a, ...patch, id: a.id } : a) }
          : p),
      },
    }));
    debouncedSave();
  },

  removeAgent: (projectId, agentId) => {
    set((state) => {
      const project = state.config.projects.find(p => p.id === projectId);
      if (!project) return state;
      const agent = (project.agents ?? []).find(a => a.id === agentId);
      // Orphans would disappear from the board: the children move up to their grandparent.
      const agents = (project.agents ?? [])
        .filter(a => a.id !== agentId)
        .map(a => (a.parentId === agentId ? { ...a, parentId: agent?.parentId ?? null } : a));
      // The agent is gone, so are the per-agent assignments that named it.
      const newSkills = state.config.skills.map(sk =>
        sk.enabledFor === "all" ? sk : { ...sk, enabledFor: sk.enabledFor.filter(id => id !== agentId) });
      const newMcp = state.config.mcpServers.map(m =>
        m.enabledFor === "all" ? m : { ...m, enabledFor: m.enabledFor.filter(id => id !== agentId) });
      const projectRuntime = { ...(state.runtime[projectId] ?? {}) };
      delete projectRuntime[agentId];
      return {
        config: {
          ...state.config,
          projects: state.config.projects.map(p => p.id === projectId ? { ...p, agents } : p),
          skills: newSkills,
          mcpServers: newMcp,
        },
        runtime: { ...state.runtime, [projectId]: projectRuntime },
      };
    });
    debouncedSave();
  },

  applyFormation: (projectId, formationId) => {
    set((state) => {
      const formation = state.config.formations.find(f => f.id === formationId);
      const project = state.config.projects.find(p => p.id === projectId);
      if (!formation || !project) return state;
      // A delegation resolves by name, so an agent joining a team that already has that name
      // comes in as "Claude 2" instead of making both ambiguous.
      const team = [...(project.agents ?? [])];
      const cloned = cloneAgentsMapped(formation.agents);
      const agents = cloned.agents.map(agent => {
        const named = { ...agent, name: nextAgentName(team, agent.name) };
        team.push(named);
        return named;
      });
      return {
        config: {
          ...state.config,
          ...applyAssignments(state.config, formation, cloned.idMap),
          projects: state.config.projects.map(p => p.id === projectId ? { ...p, agents: [...(p.agents ?? []), ...agents] } : p),
        },
        // The history and the runtime of the agents already there are left alone.
        runtime: { ...state.runtime, [projectId]: { ...(state.runtime[projectId] ?? {}), ...runtimeFor(agents) } },
      };
    });
    debouncedSave();
  },

  upsertFormation: (formation) => {
    set((state) => {
      const formations = [...state.config.formations];
      const idx = formations.findIndex(f => f.id === formation.id);
      if (idx >= 0) formations[idx] = formation;
      else formations.push(formation);
      return { config: { ...state.config, formations } };
    });
    debouncedSave();
  },

  removeFormation: (formationId) => {
    set((state) => ({
      config: {
        ...state.config,
        formations: state.config.formations.filter(f => f.id !== formationId),
        defaultFormationId: state.config.defaultFormationId === formationId ? null : state.config.defaultFormationId,
      },
    }));
    debouncedSave();
  },

  setDefaultFormation: (formationId) => {
    set((state) => ({ config: { ...state.config, defaultFormationId: formationId } }));
    debouncedSave();
  },

  saveProjectAsFormation: (projectId, name) => {
    const project = get().config.projects.find(p => p.id === projectId);
    if (!project) return undefined;
    const config = get().config;
    const cloned = cloneAgentsMapped(project.agents ?? []);
    // What each agent had enabled travels with the template, keyed by its id inside the formation.
    const assignments: NonNullable<Formation["assignments"]> = {};
    for (const agent of project.agents ?? []) {
      const formationAgentId = cloned.idMap.get(agent.id);
      if (!formationAgentId) continue;
      const skills = config.skills.filter(s => s.enabledFor !== "all" && s.enabledFor.includes(agent.id)).map(s => s.id);
      const mcpServers = config.mcpServers.filter(m => m.enabledFor !== "all" && m.enabledFor.includes(agent.id)).map(m => m.id);
      if (skills.length || mcpServers.length) assignments[formationAgentId] = { skills, mcpServers };
    }
    const formation: Formation = {
      id: crypto.randomUUID(),
      name: name.trim() || project.name,
      description: `Equipo de ${project.name}`,
      agents: cloned.agents,
      ...(Object.keys(assignments).length ? { assignments } : {}),
    };
    set((state) => ({ config: { ...state.config, formations: [...state.config.formations, formation] } }));
    debouncedSave();
    return formation.id;
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
    // opencode is asked through its own binary, so it needs the path that was detected.
    const result = await quota.fetchQuota(provider, get().binaries);
    set(state => ({ quota: { ...state.quota, [provider]: result } }));
    return result;
  },

  loadQuotaMarks: async () => {
    const pools = await quota.antigravityQuota();
    if (Object.keys(pools).length === 0) return;
    const result = await quota.fetchQuota("antigravity");
    set(state => ({ quota: { ...state.quota, antigravity: result } }));
  },

  refreshRepoState: async (projectId) => {
    const project = selectProject(get(), projectId);
    if (!project?.workspaceDir) return;
    // The 60 s timer, opening the project and the end of a run can all land at once; one read per
    // project at a time is plenty and keeps git from being called three times over.
    const inFlight = repoReads.get(projectId);
    if (inFlight) return inFlight;
    const read = readRepoState(project.workspaceDir)
      .then(state => {
        set(s => ({ repoState: { ...s.repoState, [projectId]: state } }));
      })
      .catch(() => {
        /* a repo we cannot read is not worth an error: the UI just shows nothing */
      })
      .finally(() => {
        repoReads.delete(projectId);
      });
    repoReads.set(projectId, read);
    return read;
  },

  refreshRepoStatus: async (projectId) => {
    const project = selectProject(get(), projectId);
    if (!project?.workspaceDir) return;
    const status = await readRepoStatus(project.workspaceDir).catch(() => null);
    if (!status) return;
    set(s => {
      const before = s.repoState[projectId];
      // Nothing read the whole state yet: this half is still better than an empty header, and the
      // pull requests fill in on the next slow pass.
      const next: RepoState = before
        ? { ...before, status, fetchedAt: Date.now() }
        : { isRepo: true, status, pullRequests: [], fetchedAt: Date.now() };
      return { repoState: { ...s.repoState, [projectId]: next } };
    });
  },

  answerQuestion: (questionId, answer) => {
    const question = get().questions[questionId];
    if (!question || question.status !== "pending") return;
    set(state => ({
      questions: {
        ...state.questions,
        [questionId]: { ...question, status: "answered", answer, answeredAt: Date.now() },
      },
    }));
    orchestrator.resumeWithAnswer(question, answer);
  },

  setWorktree: (projectId, worktree) => {
    set(state => {
      const list = state.worktrees[projectId] ?? [];
      const idx = list.findIndex(w => w.agentId === worktree.agentId);
      const next = idx >= 0 ? list.map((w, i) => (i === idx ? worktree : w)) : [...list, worktree];
      return { worktrees: { ...state.worktrees, [projectId]: next } };
    });
  },

  forgetWorktree: (projectId, agentId) => {
    set(state => {
      const list = state.worktrees[projectId];
      if (!list) return state;
      return { worktrees: { ...state.worktrees, [projectId]: list.filter(w => w.agentId !== agentId) } };
    });
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

  // ---- Task actions ----
  // Every mutation rewrites one project's array, so the persistence subscription only has to
  // compare `state.tasks[projectId]` to know what to save.
  loadTasks: (projectId) => taskStore.loadTasks(projectId),

  addTask: (projectId, partial) => {
    const state = get();
    const status = partial?.status ?? "backlog";
    const list = state.tasks[projectId] ?? [];
    const task = taskLogic.createTask({
      ...partial,
      projectId,
      status,
      order: partial?.order ?? taskLogic.sortColumn(list, status).length,
    });
    set(s => ({ tasks: { ...s.tasks, [projectId]: [...(s.tasks[projectId] ?? []), task] } }));
    return task;
  },

  updateTask: (id, patch) => {
    set(s => {
      const entry = findTaskProject(s, id);
      if (!entry) return {};
      const [projectId, list] = entry;
      return {
        tasks: {
          ...s.tasks,
          [projectId]: list.map(t => (t.id === id ? { ...t, ...patch, id: t.id, projectId: t.projectId, updatedAt: Date.now() } : t)),
        },
      };
    });
  },

  moveTask: (id, status, index) => {
    set(s => {
      const entry = findTaskProject(s, id);
      if (!entry) return {};
      const [projectId, list] = entry;
      const next = taskLogic.moveTask(list, id, status, index);
      return next === list ? {} : { tasks: { ...s.tasks, [projectId]: next } };
    });
  },

  removeTask: (id) => {
    set(s => {
      const entry = findTaskProject(s, id);
      if (!entry) return {};
      const [projectId, list] = entry;
      return { tasks: { ...s.tasks, [projectId]: taskLogic.removeTask(list, id) } };
    });
  },

  archiveTask: (id, archived = true) => {
    get().updateTask(id, { archived });
  },

  linkTaskDependency: (id, dependsOnId) => {
    const state = get();
    const entry = findTaskProject(state, id);
    if (!entry) return false;
    const [projectId, list] = entry;
    const next = taskLogic.linkDependency(list, id, dependsOnId);
    if (next === list) return false;
    set(s => ({ tasks: { ...s.tasks, [projectId]: next } }));
    return true;
  },

  unlinkTaskDependency: (id, dependsOnId) => {
    set(s => {
      const entry = findTaskProject(s, id);
      if (!entry) return {};
      const [projectId, list] = entry;
      const next = taskLogic.unlinkDependency(list, id, dependsOnId);
      return next === list ? {} : { tasks: { ...s.tasks, [projectId]: next } };
    });
  },

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
    forgetChats([id]);
    set((state) => {
      const newChats = state.config.chats.filter(c => c.id !== id);
      const newChatMessages = { ...state.chatMessages };
      delete newChatMessages[id];
      const newSessions = { ...state.chatSessions };
      delete newSessions[id];
      const newLoading = { ...state.chatLoading };
      delete newLoading[id];
      return {
        config: { ...state.config, chats: newChats },
        chatMessages: newChatMessages,
        chatSessions: newSessions,
        chatLoading: newLoading,
        remoteActiveChats: state.remoteActiveChats.filter(c => c !== id),
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
          createdAt: Date.now(),
          agents: []
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
      } as unknown as AppConfig;
      isSeed = true;
    }

    
    // Migration to version 10: agents stop being global and become each project's own team.
    if ((config.version as number) < 10) {
      const legacy: AgentConfig[] = ((config as unknown as { agents?: AgentConfig[] }).agents) ?? [];
      const projects: Project[] = config.projects ?? [];
      // The runtime, the history and the `enabledFor` on disk name the old ids: the project the
      // user was last on keeps them, so nothing of what it was doing is lost.
      const lastProjectId = config.lastProjectId;
      const keepIds = projects.some(p => p.id === lastProjectId) ? lastProjectId : projects[0]?.id;
      const migratedProjects = projects.map(p => ({
        ...p,
        agents: p.agents ?? (p.id === keepIds ? legacy.map(a => ({ ...a })) : cloneAgents(legacy)),
      }));
      const formations: Formation[] = config.formations ?? [];
      let defaultFormationId = config.defaultFormationId ?? null;
      if (legacy.length > 0 && formations.length === 0) {
        // The team that used to be global survives as the template new projects start from.
        const formation: Formation = {
          id: crypto.randomUUID(),
          name: "Mi equipo",
          description: "El equipo que compartían todos los proyectos",
          agents: cloneAgents(legacy),
        };
        formations.push(formation);
        defaultFormationId = formation.id;
      }
      config = {
        ...config,
        version: 10,
        projects: migratedProjects,
        formations,
        defaultFormationId,
      } as unknown as AppConfig;
      delete (config as unknown as { agents?: AgentConfig[] }).agents;
      isSeed = true;
    }

    // Migration to version 11: the UI can be read in several languages.
    if ((config.version as number) < 11) {
      config = {
        ...config,
        version: 11,
        language: config.language ?? null,
      } as unknown as AppConfig;
      isSeed = true;
    }

    // Migration to version 12: the board can archive its own done tasks (off until it is asked to).
    if ((config.version as number) < 12) {
      config = {
        ...config,
        version: 12,
        autoArchiveDoneDays: config.autoArchiveDoneDays ?? null,
      } as AppConfig;
      isSeed = true;
    }

    // A project written by an older build (or by a partial merge) may still have no team.
    config.projects = config.projects.map(p => (p.agents ? p : { ...p, agents: [] }));

    const runtime: Record<string, Record<string, AgentRuntime>> = {};
    for (const p of config.projects) {
      runtime[p.id] = runtimeFor(p.agents);
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
      taskView: prefs.taskView,
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
    const agentCount = config.projects.reduce((n, p) => n + p.agents.length, 0);
    log.info("app", `configuración cargada (${config.projects.length} proyectos, ${agentCount} agentes)`);

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
    taskStore.attachTaskPersistence();
    notificationStore.attachNotificationPersistence();
    const toLoad = config.projects.length <= 5
      ? config.projects.map(p => p.id)
      : (config.lastProjectId ? [config.lastProjectId] : []);
    await Promise.all(toLoad.flatMap(id => [history.loadHistory(id), taskStore.loadTasks(id)]));
    // With the runs in memory, the boards can be put back in step with them.
    for (const id of toLoad) reconcileProject(id);
    history.startHistorySync();
    // Load persisted notifications before marking the store as ready, so the bell
    // shows its badge without a flash of empty state on startup.
    await notificationStore.loadNotifications();

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

/** Shared empty roster: a fresh array per call would re-render every subscriber forever. */
const NO_AGENTS: AgentConfig[] = [];

export function selectProjectAgents(state: AppState, projectId: string | null | undefined): AgentConfig[] {
  if (!projectId) return NO_AGENTS;
  return state.config.projects.find(p => p.id === projectId)?.agents ?? NO_AGENTS;
}

/**
 * Every agent of every project, for the places that only have an id (a message, a run, the quota
 * sync). Ids are unique across projects. Cached on the `projects` array so the reference stays
 * stable between renders: zustand compares by identity.
 */
let allAgentsCache: { projects: Project[]; agents: AgentConfig[] } | null = null;
export function selectAllAgents(state: AppState): AgentConfig[] {
  const projects = state.config.projects;
  if (allAgentsCache && allAgentsCache.projects === projects) return allAgentsCache.agents;
  const agents = projects.flatMap(p => p.agents ?? []);
  allAgentsCache = { projects, agents };
  return agents;
}

export function selectChildren(state: AppState, projectId: string | null | undefined, agentId: string): AgentConfig[] {
  return selectProjectAgents(state, projectId).filter(a => a.parentId === agentId);
}

export function selectRoots(state: AppState, projectId: string | null | undefined): AgentConfig[] {
  return selectProjectAgents(state, projectId).filter(a => a.parentId === null);
}

export function selectAgent(state: AppState, id: string): AgentConfig | undefined {
  for (const p of state.config.projects) {
    const agent = (p.agents ?? []).find(a => a.id === id);
    if (agent) return agent;
  }
  return undefined;
}

/** The project an agent belongs to, for the callers that only carry its id. */
export function selectProjectOfAgent(state: AppState, agentId: string): Project | undefined {
  return state.config.projects.find(p => (p.agents ?? []).some(a => a.id === agentId));
}

export function selectFormation(state: AppState, id: string | null | undefined): Formation | undefined {
  if (!id) return undefined;
  return state.config.formations.find(f => f.id === id);
}

/**
 * A free name inside a group: "Claude", then "Claude 2"… Names are what a delegation block
 * resolves, so two agents of a project never share one (formations reuse it for their own names).
 */
export function nextAgentName(named: { name: string }[], label: string): string {
  const taken = new Set(named.map(a => a.name.trim().toLowerCase()));
  if (!taken.has(label.toLowerCase())) return label;
  for (let n = 2; n < 100; n++) {
    const candidate = `${label} ${n}`;
    if (!taken.has(candidate.toLowerCase())) return candidate;
  }
  return `${label} ${crypto.randomUUID().slice(0, 4)}`;
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

/** A stable empty array, so `selectTasks` never makes a subscribed component re-render. */
const EMPTY_TASKS: Task[] = [];

export function selectTasks(state: AppState, projectId: string | null | undefined): Task[] {
  if (!projectId) return EMPTY_TASKS;
  return state.tasks[projectId] ?? EMPTY_TASKS;
}

/** Shared empty list, so a project with no worktrees never re-renders its subscribers. */
const NO_WORKTREES: AgentWorktree[] = [];

export function selectProjectWorktrees(state: AppState, projectId: string | null | undefined): AgentWorktree[] {
  if (!projectId) return NO_WORKTREES;
  return state.worktrees[projectId] ?? NO_WORKTREES;
}

export function selectWorktree(state: AppState, projectId: string | null | undefined, agentId: string): AgentWorktree | undefined {
  return selectProjectWorktrees(state, projectId).find(w => w.agentId === agentId);
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
