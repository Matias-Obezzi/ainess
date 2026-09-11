import { create } from "zustand";
import { AppConfig, AgentConfig, AgentQuestion, AgentWorktree, Binaries, AgentRuntime, Run, CommMessage, Skill, McpServer, Project, Formation, ProviderId, Chat, ChatMessage, ChatParticipant, Approval, AppNotification, ModelInfo, ProviderQuota, ShellInfo, TerminalTab, Task, TaskStatus, DockSectionId } from "@/types";
import { getTransport } from "@/lib/transport";
import { chimeFor, playChime, soundEnabled } from "@/lib/sound";
import { isTauri } from "@/lib/tauri";
import * as orchestrator from "@/lib/orchestrator";
import * as history from "@/lib/history";
import * as taskStore from "@/lib/task-store";
import * as taskLogic from "@/lib/tasks";
import { reconcileProject } from "@/lib/task-reconcile";
import * as remote from "@/lib/remote";
import * as quota from "@/lib/quota";
import { autonomousReport } from "@/lib/autonomous";
import { readRepoState, readRepoStatus, type RepoState } from "@/lib/git-repo";
import { setLogLevel, log } from "@/lib/logger";
import { forgetPty } from "@/lib/pty-bus";
import { mergeConfig } from "@/lib/config-merge";
import * as notifications from "@/lib/notifications";
import { interruptedPrompt, joinQueued } from "@/lib/queued-prompt";
import { translateNow } from "@/i18n/useT";
import { loadLanguage, resolveLanguage } from "@/i18n";
// sections.ts only has a type-import back to store, no runtime cycle.
import { ALL_SETTINGS_SECTION_IDS } from "@/components/settings/sections";
import * as notificationStore from "@/lib/notification-store";
import * as recovery from "@/lib/recovery";
import { readWithLegacy } from "@/lib/storage-keys";
import type { BridgeProviderId } from "@/lib/bridge/types";

/** The channels the messaging config actually has a slot for today. */
type MessagingChannelId = Extract<BridgeProviderId, "telegram" | "discord" | "slack">;

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
/** Which section of the settings dialog's sidebar is open. */
export type SettingsSection = "general" | "agents" | "profile" | "presets" | "skills" | "mcp" | "hooks" | "context" | "remote" | "messaging" | "diagnostics" | "about";
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
  /**
   * When each project's current stretch of autonomous mode began, in memory only. Not part of
   * `Project` (which only carries `until`, per the design): this is what lets the report shown when
   * the mode ends cover just that stretch instead of the project's whole history. Lost on restart,
   * same as `runtime` — a mode still on after a restart starts counting its report from then.
   */
  autonomousStarted: Record<string, number>;
  /**
   * Runs parked because their agent ran out of quota, waiting for `useQuotaSync` to see the
   * provider has room again and relaunch them (same prompt, from scratch — see
   * `RetryRunDialog`/`lib/orchestrator.ts#parkQuotaRetry`). Not persisted: a run still parked when
   * the app restarts is simply left failed, same as if nobody had asked for a retry.
   */
  quotaWaiting: Record<string, { agentId: string; projectId: string; provider: ProviderId; prompt: string; model?: string; createdAt: number; attempts: number; retrying?: boolean }>;
  dropQuotaWaiting(id: string): void;
  /** Marks a parked run as relaunched: one more attempt spent, and not to be picked up again. */
  markQuotaRetrying(id: string): void;
  /** Forgets whatever was parked for this exact piece of work: it has been settled. */
  clearQuotaWaitingFor(projectId: string, agentId: string, prompt: string): void;
  /** Turns a project's autonomous mode on until `until`, or off (and reports) when `until` is null. */
  setAutonomous(projectId: string, until: number | null): void;
  /** Turns autonomous mode off and, if anything happened while it ran, tells the user about it. */
  endAutonomous(projectId: string): void;
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
   * What is typed and not sent yet, by `project:<id>` or `chat:<id>`. The composer used to hold it
   * in component state, so opening the board and coming back left the box empty.
   */
  drafts: Record<string, string>;
  setDraft(key: string, text: string): void;

  /**
   * The model last picked in each conversation, under the same key as the drafts. The composer
   * held it in component state, so going to the board and coming back said "default model" again
   * while the box right below it still held what you had typed.
   */
  composerModels: Record<string, string>;
  setComposerModel(key: string, model: string): void;

  /**
   * Messages written while a chat was mid-turn, sent when it ends. The orchestrator has had this
   * for its agents since it existed (`queuedInstructions`); a chat had nothing and the box was
   * simply disabled.
   */
  chatQueues: Record<string, string[]>;
  queueChatMessage(chatId: string, text: string): void;
  /** Takes one queued message back before its turn comes. */
  unqueueChatMessage(chatId: string, index: number): void;
  /** The same, for an instruction waiting on a working agent. */
  unqueueInstruction(projectId: string, agentId: string, index: number): void;
  /**
   * Cuts the turn that is running short and hands the queue over now.
   *
   * The whole queue, not one of it: the messages go as a single prompt either way (see
   * `lib/queued-prompt`), and interrupting to deliver one of three would still be three turns.
   */
  sendChatNow(chatId: string): Promise<void>;
  sendInstructionNow(projectId: string, agentId: string): Promise<void>;
  /** Sends everything waiting on a chat as one message, if there is any. Called when a turn ends. */
  flushChatQueue(chatId: string): Promise<void>;
  /**
   * Chats with a turn in flight, as reported by the snapshot. Only the phone build fills this:
   * in the app (and the CLI) the real answer lives in `lib/chat.ts`, in this process's memory.
   */
  remoteActiveChats: string[];

  /** Tasks per project, loaded from disk on demand (see src/lib/task-store.ts). */
  tasks: Record<string, Task[]>;

  // ---- Shell navigation (persisted in localStorage under "ainess.ui") ----
  screen: Screen;
  projectMode: ProjectMode;
  /**
   * Where each project was left, by id. Opening a project is "take me back to it", so moving
   * between two of them must not drag the view of one onto the other (persisted).
   */
  projectModes: Record<string, ProjectMode>;
  /** The last open chat ID for each project, or null for the orchestrator thread (persisted). */
  projectChats: Record<string, string | null>;
  /**
   * Which of the three dock panels each project had open, so walking into another project does not
   * bring this one's dock along. The terminal panel made that plain: it stayed open over a project
   * with no terminals in it, showing an empty panel above an empty tab bar.
   *
   * The three flags below stay as "what is showing right now" — every reader wants that, not a map
   * lookup — and this is where they are put away and taken out again, the shape `projectModes`
   * already has for the view.
   */
  projectPanels: Record<string, { comm: boolean; diff: boolean; term: boolean }>;
  commPanelOpen: boolean;
  /** Whether the diff section of the right dock is open (persisted). */
  diffPanelOpen: boolean;
  /** Whether the terminals section of the right dock is open (persisted). */
  termPanelOpen: boolean;
  /** Flex weights for the sections of the right dock. */
  dockSizes: Record<DockSectionId, number>;
  /** Width in px of the two side panes, as the user dragged them. */
  paneWidths: Record<PaneId, number>;
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
  /**
   * Opens a project. `mode` is what the sidebar's three rows pass — without it the project opens
   * the way it was left, which is what clicking the project's own name means.
   */
  openProject(projectId: string, chatId?: string | null, mode?: ProjectMode): void;
  openSettings(section?: SettingsSection): void;
  closeSettings(): void;
  setProjectMode(mode: ProjectMode): void;
  toggleCommPanel(open?: boolean): void;
  toggleDiffPanel(open?: boolean): void;
  toggleTermPanel(open?: boolean): void;
  setDockSizes(sizes: Partial<Record<DockSectionId, number>>): void;
  setPaneWidth(pane: PaneId, width: number): void;
  toggleSidebarProject(projectId: string): void;
  toggleSidebar(open?: boolean): void;
  toggleSearch(open?: boolean): void;
  toggleShortcuts(open?: boolean): void;
  /** Asks the task board to open (or close, with null) one task's detail. */
  focusTask(taskId: string | null): void;
  goBack(): void;
  goForward(): void;

  // ---- Integrated terminals (the tabs live in memory only, never persisted) ----
  /** Open terminal tabs, in tab-bar order. */
  terminals: TerminalTab[];
  /**
   * The tab each project was last looking at, keyed by project id (`"home"` with no project open).
   * The tabs themselves do not survive a restart; which one was in front is cheap to remember and
   * harmless when it points at a shell that is gone (the bar falls back to the first one).
   */
  activeTerminalIds: Record<string, string | null>;
  /** Shells detected on this machine, loaded once at startup (desktop app only). */
  shells: ShellInfo[];
  openTerminal(opts?: { shellId?: string; cwd?: string; command?: string; title?: string }): void;
  closeTerminal(id: string): void;
  setActiveTerminal(id: string): void;
  renameTerminal(id: string, title: string): void;
  /** Reorders the tab bar: the tab lands at `toIndex` of the list as it is shown. */
  moveTerminal(id: string, toIndex: number): void;
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
  setSharedContext(projectId: string, text: string): void;
  /** Adds a quick command of the user's own to a project. */
  addProjectCommand(projectId: string, command: { label: string; command: string }): void;
  /** Removes one of the user's own quick commands. */
  removeProjectCommand(projectId: string, id: string): void;
  detectBinaries(): Promise<{ found: ProviderId[]; missing: ProviderId[] }>;
  updateConfig(patch: Partial<AppConfig>): void;
  refreshModels(provider: ProviderId): Promise<ModelInfo[]>;
  /** `force` skips the shared cache: it is the user asking on purpose. */
  refreshQuota(provider: ProviderId, opts?: { force?: boolean }): Promise<ProviderQuota>;
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
  /** Settles every question of one turn at once: one message to the agent, one run. */
  answerQuestions(items: Array<{ questionId: string; answer: string[] }>): void;

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
  /**
   * Channels connected right now (see lib/bridge). Mirrored into the store because the bridge keeps
   * its providers in a module Map, which nothing can subscribe to — and a light that says a channel
   * is up has to go out by itself when it goes down.
   */
  bridgeConnected: import("@/lib/bridge/types").BridgeProviderId[];
  /** Turns the local remote server on or off, keeping the config in sync. Throws on failure. */
  toggleRemote(enabled: boolean): Promise<void>;
  startRemote(portOverride?: number): Promise<void>;
  /** Turns one messaging channel on or off, keeping the config in sync. */
  toggleBridge(id: MessagingChannelId, enabled: boolean): Promise<void>;
  /** Picks up a changed token or list of chats for one channel: stop it, then start again. */
  restartBridge(id: MessagingChannelId): Promise<void>;
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
  /** Cuts a conversation back to one of its messages; see `lib/chat-rewind.ts`. */
  rewindChat(chatId: string, messageId: string, inclusive: boolean): Promise<void>;
  /** Rewrites one of the user's messages and asks again from there. */
  editChatMessage(chatId: string, messageId: string, text: string): Promise<void>;
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
    version: 13,
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
  projectModes: Record<string, ProjectMode>;
  projectChats: Record<string, string | null>;
  projectPanels: Record<string, { comm: boolean; diff: boolean; term: boolean }>;
  commPanelOpen: boolean;
  diffPanelOpen: boolean;
  termPanelOpen: boolean;
  dockSizes: Record<DockSectionId, number>;
  paneWidths: Record<PaneId, number>;
  settingsSection: SettingsSection;
  sidebarCollapsed: Record<string, boolean>;
  sidebarOpen: boolean;
  activeTerminalIds: Record<string, string | null>;
}

const DRAFTS_KEY = "ainess.drafts";
const DRAFTS_LEGACY_KEY = "ais.drafts";
const COMPOSER_MODELS_KEY = "ainess.composerModels";
const COMPOSER_MODELS_LEGACY_KEY = "ais.composerModels";

/**
 * A map of conversation key to one string, kept across views and restarts. Guarded like the UI
 * preferences: private mode, a full quota or a file another build wrote must not break the app.
 */
function loadStringMap(storageKey: string, legacyKey?: string): Record<string, string> {
  if (typeof localStorage === "undefined") return {};
  try {
    const raw = legacyKey ? readWithLegacy(localStorage, storageKey, legacyKey) : localStorage.getItem(storageKey);
    if (!raw) return {};
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object") return {};
    const out: Record<string, string> = {};
    for (const [key, value] of Object.entries(parsed)) {
      if (typeof value === "string" && value) out[key] = value;
    }
    return out;
  } catch {
    return {};
  }
}

function saveStringMap(storageKey: string, map: Record<string, string>): void {
  if (typeof localStorage === "undefined") return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(map));
  } catch {
    // Private mode or quota: an unsent draft is not worth failing over.
  }
}

const pendingSaves = new Map<string, { value: Record<string, string>; timer: ReturnType<typeof setTimeout> }>();

/** Flushes all pending string map writes to localStorage immediately. */
export function flushStringMapSaves(): void {
  orchestrator.flushStream();
  for (const [key, pending] of pendingSaves.entries()) {
    clearTimeout(pending.timer);
    saveStringMap(key, pending.value);
  }
  pendingSaves.clear();
}

if (typeof window !== "undefined") {
  window.addEventListener("beforeunload", flushStringMapSaves);
  // On `document`, where the event is actually fired: in Tauri this is what arrives when the window
  // is minimised or hidden, and it is the last chance to write before the app may not come back.
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "hidden") flushStringMapSaves();
  });
}

/**
 * Persists string maps with a delay, so every keystroke updates the UI instantly but
 * writes to disk happen at most once every 400ms, without blocking the main thread.
 */
export function saveStringMapSoon(storageKey: string, map: Record<string, string>): void {
  const pending = pendingSaves.get(storageKey);
  if (pending) {
    pending.value = map;
  } else {
    const newPending = {
      value: map,
      timer: setTimeout(() => {
        pendingSaves.delete(storageKey);
        saveStringMap(storageKey, newPending.value);
      }, 400),
    };
    pendingSaves.set(storageKey, newPending);
  }
}

/** The two side panes the user can drag: the menu on the left, the dock on the right. */
export type PaneId = "sidebar" | "dock";

export const PANE_DEFAULT_WIDTH: Record<PaneId, number> = { sidebar: 260, dock: 380 };
export const PANE_MIN_WIDTH: Record<PaneId, number> = { sidebar: 180, dock: 280 };
export const PANE_MAX_WIDTH: Record<PaneId, number> = { sidebar: 480, dock: 900 };

export function clampPaneWidth(pane: PaneId, value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : PANE_DEFAULT_WIDTH[pane];
  return Math.min(PANE_MAX_WIDTH[pane], Math.max(PANE_MIN_WIDTH[pane], Math.round(n)));
}

const UI_PREFS_KEY = "ainess.ui";
const UI_PREFS_LEGACY_KEY = "ais.ui";
const defaultUiPrefs: UiPrefs = {
  screen: "home",
  projectMode: "tasks",
  projectModes: {},
  projectChats: {},
  projectPanels: {},
  commPanelOpen: false,
  diffPanelOpen: false,
  termPanelOpen: false,
  dockSizes: { comm: 1, diff: 1, term: 1 },
  paneWidths: { ...PANE_DEFAULT_WIDTH },
  settingsSection: "general",
  sidebarCollapsed: {},
  sidebarOpen: true,
  activeTerminalIds: {},
};

const VALID_PROJECT_MODES: ProjectMode[] = ["tasks", "chat", "graph"];

/** The remembered view of each project, minus anything a past build wrote that is not one. */
function sanitizeProjectModes(value: unknown): Record<string, ProjectMode> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, mode]) => VALID_PROJECT_MODES.includes(mode as ProjectMode)),
  ) as Record<string, ProjectMode>;
}

function sanitizeProjectChats(value: unknown): Record<string, string | null> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, chat]) => typeof chat === "string" || chat === null),
  ) as Record<string, string | null>;
}

function sanitizeActiveTerminalIds(value: unknown): Record<string, string | null> {
  if (!value || typeof value !== "object") return {};
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, id]) => typeof id === "string" || id === null),
  ) as Record<string, string | null>;
}

// Derived from sections.ts so adding a new section only requires one edit.
const VALID_SETTINGS_SECTIONS: SettingsSection[] = ALL_SETTINGS_SECTION_IDS;

/** Old builds stored "settings" as a screen and "resources" as a settings tab; both were removed. */
function sanitizeSettingsSection(value: unknown): SettingsSection {
  if (value === "resources") return "profile";
  if (typeof value === "string" && (VALID_SETTINGS_SECTIONS as string[]).includes(value)) return value as SettingsSection;
  return "general";
}

function clampDockSize(value: unknown): number {
  const n = typeof value === "number" && Number.isFinite(value) ? value : 1;
  return Math.min(5, Math.max(0.2, n));
}

/** localStorage does not exist in the CLI/node build, so every access is guarded. */
/** A property of the saved preferences, without pretending to know what it is. */
function saved(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[name] : undefined;
}

/**
 * A map of booleans, keeping only the entries that are actually booleans.
 *
 * This used to be handed straight through if it happened to be an object, so a `sidebarCollapsed`
 * left holding strings by some older version travelled as `Record<string, boolean>` and was read
 * as one everywhere after.
 */
function sanitizeBoolMap(value: unknown): Record<string, boolean> {
  if (typeof value !== "object" || value === null) return {};
  const out: Record<string, boolean> = {};
  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (typeof entry === "boolean") out[key] = entry;
  }
  return out;
}

function loadUiPrefs(): UiPrefs {
  if (typeof localStorage === "undefined") return { ...defaultUiPrefs };
  try {
    const raw = readWithLegacy(localStorage, UI_PREFS_KEY, UI_PREFS_LEGACY_KEY);
    if (!raw) return { ...defaultUiPrefs };
    // Whatever a previous version of the app left in localStorage. Every field below is checked
    // before it is used, which is the only reason reading this is safe at all.
    const parsed = JSON.parse(raw) as Record<string, unknown>;
    
    let dockSizes = defaultUiPrefs.dockSizes;
    if (parsed.dockSizes && typeof parsed.dockSizes === "object") {
      dockSizes = {
        comm: clampDockSize(saved(parsed.dockSizes, "comm")),
        diff: clampDockSize(saved(parsed.dockSizes, "diff")),
        term: clampDockSize(saved(parsed.dockSizes, "term")),
      };
    }

    return {
      paneWidths: {
        sidebar: clampPaneWidth("sidebar", saved(parsed.paneWidths, "sidebar")),
        dock: clampPaneWidth("dock", saved(parsed.paneWidths, "dock")),
      },
      screen: parsed.screen === "project" ? "project" : "home",
      projectMode: VALID_PROJECT_MODES.includes(parsed.projectMode as ProjectMode) ? (parsed.projectMode as ProjectMode) : "tasks",
      projectModes: sanitizeProjectModes(parsed.projectModes),
      projectChats: sanitizeProjectChats(parsed.projectChats),
      projectPanels: sanitizeProjectPanels(parsed.projectPanels),
      commPanelOpen: parsed.commPanelOpen === true,
      diffPanelOpen: parsed.diffPanelOpen === true,
      termPanelOpen: parsed.termPanelOpen === true,
      dockSizes,
      settingsSection: sanitizeSettingsSection(parsed.settingsSection),
      sidebarCollapsed: sanitizeBoolMap(parsed.sidebarCollapsed),
      sidebarOpen: parsed.sidebarOpen !== false,
      activeTerminalIds: sanitizeActiveTerminalIds(parsed.activeTerminalIds),
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
      projectModes: s.projectModes,
      projectChats: s.projectChats,
      projectPanels: s.projectPanels,
      commPanelOpen: s.commPanelOpen,
      diffPanelOpen: s.diffPanelOpen,
      termPanelOpen: s.termPanelOpen,
      dockSizes: s.dockSizes,
      paneWidths: s.paneWidths,
      settingsSection: s.settingsSection,
      sidebarCollapsed: s.sidebarCollapsed,
      sidebarOpen: s.sidebarOpen,
      activeTerminalIds: s.activeTerminalIds,
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
  useAppStore.setState(s => ({
    screen,
    currentChatId: screen === "project" ? entry.chatId : state.currentChatId,
    projectMode: entry.projectMode,
    // Walking back into a project leaves it showing what the arrow landed on, so leaving and
    // returning by hand agrees with the history rather than undoing it.
    projectModes: screen === "project" && entry.projectId
      ? { ...s.projectModes, [entry.projectId]: entry.projectMode }
      : s.projectModes,
  }));
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

/** Only real booleans, keyed by project: what comes off disk was written by an older build. */
function sanitizeProjectPanels(raw: unknown): Record<string, { comm: boolean; diff: boolean; term: boolean }> {
  if (!raw || typeof raw !== "object") return {};
  const out: Record<string, { comm: boolean; diff: boolean; term: boolean }> = {};
  for (const [id, value] of Object.entries(raw as Record<string, unknown>)) {
    if (!value || typeof value !== "object") continue;
    const v = value as Record<string, unknown>;
    out[id] = { comm: v.comm === true, diff: v.diff === true, term: v.term === true };
  }
  return out;
}

/** The open project's three flags with `patch` applied. Untouched when no project is open. */
function panelsWith(
  state: Pick<AppState, "currentProjectId" | "projectPanels" | "commPanelOpen" | "diffPanelOpen" | "termPanelOpen">,
  patch: { comm?: boolean; diff?: boolean; term?: boolean },
): AppState["projectPanels"] {
  if (!state.currentProjectId) return state.projectPanels;
  return {
    ...state.projectPanels,
    [state.currentProjectId]: {
      comm: patch.comm ?? state.commPanelOpen,
      diff: patch.diff ?? state.diffPanelOpen,
      term: patch.term ?? state.termPanelOpen,
    },
  };
}

/** Toggling a panel: what shows now, and what this project should show when you come back to it. */
function rememberPanels(state: AppState, patch: { comm?: boolean; diff?: boolean; term?: boolean }): Partial<AppState> {
  return {
    ...(patch.comm !== undefined ? { commPanelOpen: patch.comm } : {}),
    ...(patch.diff !== undefined ? { diffPanelOpen: patch.diff } : {}),
    ...(patch.term !== undefined ? { termPanelOpen: patch.term } : {}),
    projectPanels: panelsWith(state, patch),
  };
}

export const useAppStore = create<AppState>()((set, get) => ({
  loaded: false,
  config: { version: 13, language: null, approveDelegations: false, remote: { enabled: false, port: 4710, token: "", tunnel: { provider: "cloudflared", enabled: false } }, tray: { enabled: true, notifyApprovals: true, notifyResults: true }, projects: [], formations: [], defaultFormationId: null, lastProjectId: null, maxRounds: 6, skills: [], mcpServers: [], hooks: [], sharedContext: "", binaryOverrides: {}, profile: { name: "", about: "", preferences: "" }, presets: [], autoModel: false, chats: [], logLevel: "info", autoUpdateCheck: true, autoArchiveDoneDays: null } as AppConfig,
  binaries: {},
  models: {},
  quota: {},
  repoState: {},
  worktrees: {},
  autonomousStarted: {},
  quotaWaiting: {},
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
  drafts: loadStringMap(DRAFTS_KEY, DRAFTS_LEGACY_KEY),
  composerModels: loadStringMap(COMPOSER_MODELS_KEY, COMPOSER_MODELS_LEGACY_KEY),
  chatQueues: {},
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

  /**
   * `chatId` null = orchestrator thread; undefined = keep the current chat if it belongs to the project, or the last remembered one.
   */
  openProject: (projectId, chatId, mode) => {
    const state = get();
    const sameProject = state.currentProjectId === projectId;
    let nextChatId: string | null;
    if (chatId === undefined) {
      // "Open it the way I left it": the chat already on screen when it belongs to this project,
      // else the last one this project was left in, as long as it still exists.
      const current = state.currentChatId ? state.config.chats.find(c => c.id === state.currentChatId) : undefined;
      if (sameProject && current && current.projectId === projectId) {
        nextChatId = current.id;
      } else {
        const rememberedId = state.projectChats[projectId] ?? null;
        if (rememberedId && state.config.chats.some(c => c.id === rememberedId && c.projectId === projectId)) {
          nextChatId = rememberedId;
        } else {
          nextChatId = null;
        }
      }
    } else {
      nextChatId = chatId;
    }
    // Asking for a chat lands on the chat; anything else lands where this project was left. Not
    // where the *last* project was left: that is what made opening B in the hierarchy and coming
    // back to A show A's hierarchy too, when A had been a conversation all along.
    const nextMode: ProjectMode = mode ?? (nextChatId ? "chat" : (state.projectModes[projectId] ?? "tasks"));
    if (!sameProject) state.setCurrentProject(projectId);
    set({
      currentChatId: nextChatId,
      screen: "project",
      projectMode: nextMode,
      projectModes: { ...state.projectModes, [projectId]: nextMode },
      projectChats: { ...state.projectChats, [projectId]: nextChatId },
    });
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
    set(s => ({
      projectMode: mode,
      // What this project is showing from now on, for when you come back to it.
      projectModes: s.currentProjectId ? { ...s.projectModes, [s.currentProjectId]: mode } : s.projectModes,
    }));
    pushNav({ screen: state.screen, projectId: state.currentProjectId, chatId: state.currentChatId, projectMode: mode });
    saveUiPrefs();
  },

  toggleCommPanel: (open) => {
    set(s => rememberPanels(s, { comm: open ?? !s.commPanelOpen }));
    saveUiPrefs();
  },

  toggleDiffPanel: (open) => {
    set(s => rememberPanels(s, { diff: open ?? !s.diffPanelOpen }));
    saveUiPrefs();
  },

  toggleTermPanel: (open) => {
    set(s => rememberPanels(s, { term: open ?? !s.termPanelOpen }));
    saveUiPrefs();
  },

  setPaneWidth: (pane, width) => {
    set(s => ({ paneWidths: { ...s.paneWidths, [pane]: clampPaneWidth(pane, width) } }));
    saveUiPrefs();
  },
  setDockSizes: (sizes) => {
    set(s => {
      const comm = sizes.comm !== undefined ? clampDockSize(sizes.comm) : s.dockSizes.comm;
      const diff = sizes.diff !== undefined ? clampDockSize(sizes.diff) : s.dockSizes.diff;
      const term = sizes.term !== undefined ? clampDockSize(sizes.term) : s.dockSizes.term;
      return { dockSizes: { comm, diff, term } };
    });
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
    // Every notification comes through here, window open or in the tray: the webview keeps running
    // when the window is hidden, which is what lets a sound reach you at all from there.
    const sound = get().config.notificationSound;
    if (soundEnabled(sound)) playChime(chimeFor(n.kind), sound);

    // Only the two that are waiting on you. A task that finished is news; a question is a stopped
    // agent, and it stays stopped until you come back — which is what a flashing taskbar button
    // means. Whether the window is in front is decided on the Rust side.
    if (n.kind === "approval" || n.kind === "question") {
      void getTransport().requestAttention().catch(() => {});
    }
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
  bridgeConnected: [],
  toggleBridge: async (id, enabled) => {
    const bridge = await import("@/lib/bridge");
    const messaging = get().config.messaging ?? {};
    // The defaults first, then whatever was configured, and the switch last: it is the one thing
    // this call is about.
    const channel = { token: "", allowedChatIds: [] as string[], projectId: null, ...messaging[id], enabled };
    get().updateConfig({ messaging: { ...messaging, [id]: channel } });
    if (enabled) await bridge.startBridge(); else await bridge.stopBridge(id);
  },

  restartBridge: async (id) => {
    const bridge = await import("@/lib/bridge");
    await bridge.stopBridge(id);
    if (get().config.messaging?.[id]?.enabled) await bridge.startBridge();
  },

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
    // Titles are numbered per shell so two PowerShells are still telling apart. A tab opened to run
    // something is named after it instead: "PowerShell 3" says nothing about which one is the dev
    // server, and that is the tab you come back to.
    const used = state.terminals.filter(t => t.shellId === shell.id).length + 1;
    const terminal: TerminalTab = {
      id: `term-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 7)}`,
      title: opts?.title ?? `${shell.label} ${used}`,
      shellId: shell.id,
      shellPath: shell.path,
      cwd,
      projectId: state.currentProjectId,
      ...(opts?.command ? { command: opts.command } : {}),
      exited: null,
    };
    set(s => ({
      terminals: [...s.terminals, terminal],
      activeTerminalIds: { ...s.activeTerminalIds, [state.currentProjectId ?? "home"]: terminal.id },
      termPanelOpen: true,
      projectPanels: panelsWith(s, { term: true }),
    }));
    saveUiPrefs();
    log.info("terminal", `nueva terminal ${terminal.title} (${shell.path}) en ${cwd || "home"}`);
  },

  closeTerminal: (id) => {
    const state = get();
    const index = state.terminals.findIndex(t => t.id === id);
    if (index === -1) return;
    const tab = state.terminals[index];
    const key = tab.projectId ?? "home";
    forgetPty(id);
    void getTransport().ptyKill(id).catch(e => log.warn("terminal", `no se pudo cerrar ${id}: ${e}`));
    const terminals = state.terminals.filter(t => t.id !== id);
    let activeTerminalIds = { ...state.activeTerminalIds };
    if (activeTerminalIds[key] === id) {
      const projectTerminals = terminals.filter(t => t.projectId === tab.projectId);
      const projIndex = state.terminals.filter(t => t.projectId === tab.projectId).findIndex(t => t.id === id);
      const neighbour = projectTerminals[Math.min(projIndex, projectTerminals.length - 1)];
      activeTerminalIds[key] = neighbour ? neighbour.id : null;
    }
    set({ terminals, activeTerminalIds });
  },

  setActiveTerminal: (id) => {
    const tab = get().terminals.find(t => t.id === id);
    if (!tab) return;
    set(s => ({ activeTerminalIds: { ...s.activeTerminalIds, [tab.projectId ?? "home"]: id } }));
  },

  moveTerminal: (id, toIndex) => {
    set(s => {
      const from = s.terminals.findIndex(t => t.id === id);
      if (from === -1) return {};
      const terminals = [...s.terminals];
      const [tab] = terminals.splice(from, 1);
      // Dropping past the end lands at the end; anything else keeps the order the tabs were shown.
      terminals.splice(Math.max(0, Math.min(toIndex, terminals.length)), 0, tab);
      return { terminals };
    });
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
    // Several processes share the file (app, `ainess run`, `ainess serve`): merge with what is on disk
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
      const newAutonomousStarted = { ...state.autonomousStarted };
      delete newAutonomousStarted[id];
      const newQuotaWaiting = Object.fromEntries(
        Object.entries(state.quotaWaiting).filter(([, w]) => w.projectId !== id),
      );
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
      const newProjectModes = { ...state.projectModes };
      delete newProjectModes[id];
      const newProjectChats = { ...state.projectChats };
      delete newProjectChats[id];

      // Back/forward must not offer a project that is gone; the index follows what is left.
      const keptNav = state.navHistory.filter(e => e.projectId !== id);
      const droppedBefore = state.navHistory.slice(0, state.navIndex + 1).filter(e => e.projectId === id).length;
      const navHistory = keptNav.length > 0 ? keptNav : [{ screen: "home" as Screen, projectId: null, chatId: null, projectMode: "chat" as ProjectMode }];
      const navIndex = Math.min(Math.max(state.navIndex - droppedBefore, 0), navHistory.length - 1);

      const wasCurrent = state.currentProjectId === id;
      const chatGone = state.currentChatId ? goneChats.has(state.currentChatId) : false;
      const newActiveTerminalIds = { ...state.activeTerminalIds };
      delete newActiveTerminalIds[id];

      return {
        config: { ...state.config, projects: newProjects, chats: newChats, hooks: newHooks },
        runtime: newRuntime,
        activeTaskRunId: newActiveTask,
        repoState: newRepoState,
        worktrees: newWorktrees,
        autonomousStarted: newAutonomousStarted,
        quotaWaiting: newQuotaWaiting,
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
        projectModes: newProjectModes,
        projectChats: newProjectChats,
        navHistory,
        navIndex,
        // The search palette may have asked the board to open a card of this project.
        focusedTaskId: state.focusedTaskId && goneTasks.has(state.focusedTaskId) ? null : state.focusedTaskId,
        // The shells keep running (only their tab, `exit` or closing the app may kill one), but they
        // no longer belong to anything: with the tab bar showing one project at a time, that is
        // where they now appear — on the home screen, which is where a terminal with no project is.
        terminals: state.terminals.map(t => (t.projectId === id ? { ...t, projectId: null } : t)),
        activeTerminalIds: newActiveTerminalIds,
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
    set((state) => {
      // The dock belongs to the project you were in. Carried over, the terminal panel sat open
      // above another project's empty tab bar, which is what gave this away.
      const saved = id ? state.projectPanels[id] : undefined;
      return {
        currentProjectId: id,
        config: { ...state.config, lastProjectId: id },
        commPanelOpen: saved?.comm ?? false,
        diffPanelOpen: saved?.diff ?? false,
        termPanelOpen: saved?.term ?? false,
      };
    });
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

  setAutonomous: (projectId, until) => {
    if (until === null) {
      get().endAutonomous(projectId);
      return;
    }
    set(state => ({ autonomousStarted: { ...state.autonomousStarted, [projectId]: Date.now() } }));
    get().updateProject(projectId, { autonomous: { until } });
  },

  endAutonomous: (projectId) => {
    const state = get();
    const project = selectProject(state, projectId);
    if (!project?.autonomous) return;
    // No recorded start (e.g. the app restarted mid-stretch): the report only covers what it can
    // still see, which is nothing before right now.
    const since = state.autonomousStarted[projectId] ?? Date.now();

    const runs = Object.values(state.runs).filter(
      r => r.projectId === projectId && r.startedAt >= since && (r.status === "done" || r.status === "error"),
    );
    const autoApprovals = Object.values(state.approvals).filter(a => a.projectId === projectId && a.createdAt >= since);
    const autoAnswers = Object.values(state.questions).filter(q => q.projectId === projectId && q.createdAt >= since);
    const quotaWaits = Object.values(state.quotaWaiting).filter(w => w.projectId === projectId).length;
    const report = autonomousReport({ runs, autoApprovals, autoAnswers, quotaWaits });

    set(s => {
      const nextStarted = { ...s.autonomousStarted };
      delete nextStarted[projectId];
      return { autonomousStarted: nextStarted };
    });
    get().updateProject(projectId, { autonomous: undefined });

    if (report.lines.length > 0) {
      // The notification is the glance; this is the record. The whole point of the mode is that
      // nobody was watching, so the report has to survive in the thread the user actually reads in
      // the morning, not only in a toast that came and went while they slept.
      orchestrator.addMessage({
        projectId,
        fromAgentId: "system",
        kind: "system",
        text: [translateNow("autonomous.report.title", { name: project.name }), ...report.lines.map(l => "- " + l)].join("\n"),
      });
      get().notify({
        kind: "info",
        title: translateNow("autonomous.report.title", { name: project.name }),
        body: report.lines.join(" · "),
        projectId,
      });
    }
  },

  dropQuotaWaiting: (id) => {
    set(state => {
      if (!(id in state.quotaWaiting)) return state;
      const next = { ...state.quotaWaiting };
      delete next[id];
      return { quotaWaiting: next };
    });
  },

  markQuotaRetrying: (id) => {
    set(state => {
      const entry = state.quotaWaiting[id];
      if (!entry) return state;
      // Kept rather than dropped: the count has to be here when the relaunch comes back parked, and
      // `retrying` is what stops the next refresh from launching the same work a second time.
      return {
        quotaWaiting: { ...state.quotaWaiting, [id]: { ...entry, attempts: entry.attempts + 1, retrying: true } },
      };
    });
  },

  clearQuotaWaitingFor: (projectId, agentId, prompt) => {
    set(state => {
      const next = { ...state.quotaWaiting };
      let changed = false;
      for (const [id, entry] of Object.entries(next)) {
        if (entry.projectId === projectId && entry.agentId === agentId && entry.prompt === prompt) {
          delete next[id];
          changed = true;
        }
      }
      return changed ? { quotaWaiting: next } : state;
    });
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
    set((state) => {
      const before = state.config.projects.find(p => p.id === projectId)?.agents?.find(a => a.id === agentId);
      const config = {
        ...state.config,
        projects: state.config.projects.map(p => p.id === projectId
          ? { ...p, agents: (p.agents ?? []).map(a => a.id === agentId ? { ...a, ...patch, id: a.id } : a) }
          : p),
      };

      // A session belongs to the CLI that opened it, in the folder it ran in. Handing the id of a
      // Claude session to Antigravity is handing it a name it has never heard, and the run fails on
      // the spot; the same goes for a session opened in a folder the agent no longer works in.
      const runtime = state.runtime[projectId]?.[agentId];
      const movedOn = before && runtime?.sessionId && (
        (patch.provider !== undefined && patch.provider !== before.provider) ||
        (patch.worktree !== undefined && !!patch.worktree !== !!before.worktree)
      );
      if (!movedOn) return { config };

      return {
        config,
        runtime: {
          ...state.runtime,
          [projectId]: {
            ...state.runtime[projectId],
            [agentId]: { ...runtime, sessionId: undefined, sessionUpdatedAt: Date.now() },
          },
        },
      };
    });
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

  addProjectCommand: (projectId, command) => {
    const entry = { id: crypto.randomUUID(), label: command.label.trim(), command: command.command.trim() };
    if (!entry.label || !entry.command) return;
    set(state => ({
      config: {
        ...state.config,
        projects: state.config.projects.map(p =>
          p.id === projectId ? { ...p, commands: [...(p.commands ?? []), entry] } : p),
      },
    }));
    debouncedSave();
  },

  removeProjectCommand: (projectId, id) => {
    set(state => ({
      config: {
        ...state.config,
        projects: state.config.projects.map(p =>
          p.id === projectId ? { ...p, commands: (p.commands ?? []).filter(c => c.id !== id) } : p),
      },
    }));
    debouncedSave();
  },

  setSharedContext: (projectId, text) => {
    set((state) => ({
      config: {
        ...state.config,
        projects: state.config.projects.map(p => (p.id === projectId ? { ...p, sharedContext: text } : p)),
      },
    }));
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

  refreshQuota: async (provider, opts) => {
    // opencode is asked through its own binary, so it needs the path that was detected.
    const result = await quota.fetchQuota(provider, get().binaries, opts);
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
    get().answerQuestions([{ questionId, answer }]);
  },

  answerQuestions: (items) => {
    const all = get().questions;
    const pending = items
      .map(item => ({ question: all[item.questionId], answer: item.answer }))
      .filter(entry => entry.question && entry.question.status === "pending");
    if (pending.length === 0) return;

    const answeredAt = Date.now();
    set(state => {
      const questions = { ...state.questions };
      for (const { question, answer } of pending) {
        questions[question.id] = { ...question, status: "answered", answer, answeredAt };
      }
      return { questions };
    });
    // One resume for the lot: see `resumeWithAnswers`.
    orchestrator.resumeWithAnswers(pending);
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
      
      const newProjectChats = { ...state.projectChats };
      // A project must not be left pointing at a chat that is gone.
      const chatProject = state.config.chats.find(c => c.id === id)?.projectId;
      if (chatProject && newProjectChats[chatProject] === id) {
        newProjectChats[chatProject] = null;
      }
      
      return {
        config: { ...state.config, chats: newChats },
        chatMessages: newChatMessages,
        chatSessions: newSessions,
        chatLoading: newLoading,
        remoteActiveChats: state.remoteActiveChats.filter(c => c !== id),
        currentChatId: state.currentChatId === id ? null : state.currentChatId,
        projectChats: newProjectChats,
      };
    });
    debouncedSave();
    saveUiPrefs();
  },

  setCurrentChat: (id) => {
    const state = get();
    if (state.currentChatId === id) return;
    set({
      currentChatId: id,
      ...(state.currentProjectId ? { projectChats: { ...state.projectChats, [state.currentProjectId]: id } } : {})
    });
    if (state.screen === "project" && state.currentProjectId) {
      pushNav({ screen: "project", projectId: state.currentProjectId, chatId: id, projectMode: state.projectMode });
    }
    saveUiPrefs();
  },

  setDraft: (key, text) => {
    if (!key) return;
    const drafts = { ...get().drafts };
    if (text) drafts[key] = text;
    else delete drafts[key];
    set({ drafts });
    saveStringMapSoon(DRAFTS_KEY, drafts);
  },

  setComposerModel: (key, model) => {
    if (!key) return;
    const composerModels = { ...get().composerModels };
    // Empty is "whatever the agent is configured with": remembering that is remembering nothing.
    if (model) composerModels[key] = model;
    else delete composerModels[key];
    set({ composerModels });
    saveStringMapSoon(COMPOSER_MODELS_KEY, composerModels);
  },

  queueChatMessage: (chatId, text) => {
    set(state => ({
      chatQueues: { ...state.chatQueues, [chatId]: [...(state.chatQueues[chatId] ?? []), text] },
    }));
  },

  unqueueChatMessage: (chatId, index) => {
    set(state => ({
      chatQueues: {
        ...state.chatQueues,
        [chatId]: (state.chatQueues[chatId] ?? []).filter((_, i) => i !== index),
      },
    }));
  },

  unqueueInstruction: (projectId, agentId, index) => {
    set(state => {
      const projectRuntime = state.runtime[projectId];
      const runtime = projectRuntime?.[agentId];
      if (!runtime) return {};
      return {
        runtime: {
          ...state.runtime,
          [projectId]: {
            ...projectRuntime,
            [agentId]: {
              ...runtime,
              queuedInstructions: (runtime.queuedInstructions ?? []).filter((_, i) => i !== index),
            },
          },
        },
      };
    });
  },

  sendChatNow: async (chatId) => {
    // Read and cleared without awaiting in between: the flush that follows every turn end reads the
    // same queue, and a gap here is the same message going out twice.
    const queued = get().chatQueues[chatId] ?? [];
    const text = interruptedPrompt(translateNow("queued.interruptedNote"), queued);
    if (!text) return;
    // Only what was read is dropped: a message typed while this was in flight still waits its turn.
    set(state => ({
      chatQueues: { ...state.chatQueues, [chatId]: (state.chatQueues[chatId] ?? []).slice(queued.length) },
    }));
    // Stopping is awaited so the turn is closed before the next one opens. The flush that follows a
    // stop finds the queue already empty, so this does not go out twice.
    await get().stopChat(chatId);
    await get().sendChatMessage(chatId, text);
  },

  sendInstructionNow: async (projectId, agentId) => {
    await orchestrator.sendNowInterrupting(agentId, projectId);
  },

  flushChatQueue: async (chatId) => {
    const queued = get().chatQueues[chatId] ?? [];
    if (queued.length === 0) return;
    const text = joinQueued(queued);
    set(state => ({
      chatQueues: { ...state.chatQueues, [chatId]: (state.chatQueues[chatId] ?? []).slice(queued.length) },
    }));
    if (!text) return;
    await get().sendChatMessage(chatId, text);
  },

  sendChatMessage: async (chatId, text) => {
    const { sendChatMessage } = await import("@/lib/chat");
    await sendChatMessage(chatId, text);
  },

  rewindChat: async (chatId, messageId, inclusive) => {
    const { rewindChat } = await import("@/lib/chat");
    await rewindChat(chatId, messageId, inclusive);
  },

  editChatMessage: async (chatId, messageId, text) => {
    const { editChatMessage } = await import("@/lib/chat");
    await editChatMessage(chatId, messageId, text);
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
      // Before version 3 there was one workspace instead of projects. The old shape is named
      // rather than cast away: it is the only record left of what this migration is reading.
      const oldConfig = config as unknown as { workspaceDir?: string };
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
      delete (config as { workspaceDir?: string }).workspaceDir;
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
      } as unknown as AppConfig;
      isSeed = true;
    }

    // Migration to version 13: the shared context belongs to a project, not to the whole app.
    // One global string was appended to every agent's prompt in every project, which is how an
    // agent of one project came to know about another's — and to act on it. Each project keeps a
    // copy of what the global one said, so nothing written is lost; the global is emptied because
    // from here on nothing reads it.
    if ((config.version as number) < 13) {
      const global = (config as { sharedContext?: string }).sharedContext ?? "";
      config = {
        ...config,
        version: 13,
        sharedContext: "",
        projects: (config.projects ?? []).map(p => ({ ...p, sharedContext: p.sharedContext ?? global })),
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
    // Reopening the app is reopening that project, so it lands where that project was left.
    const startMode: ProjectMode = (lastProjectValid && config.lastProjectId
      ? prefs.projectModes[config.lastProjectId]
      : undefined) ?? prefs.projectMode;
    const startChatId = lastProjectValid && config.lastProjectId
      ? prefs.projectChats[config.lastProjectId] ?? null
      : null;
    const finalChatId = startChatId && config.chats.some(c => c.id === startChatId) ? startChatId : null;

    // Load the language before anything paints or translates: every `translateNow` call the rest
    // of startup makes (crash-recovery notifications, log lines) has to land in the right one, not
    // in the Spanish fallback that would show while the real dictionary was still in flight.
    //
    // Swallowed on purpose. A chunk that will not load is a reason to read the app in Spanish, not
    // a reason for it never to open — and an unhandled rejection here would stop the boot dead.
    await loadLanguage(resolveLanguage(config.language)).catch(() => {});

    lastSavedConfig = config;
    set({
      config,
      runtime,
      currentProjectId: lastProjectValid ? config.lastProjectId : null,
      currentChatId: finalChatId,
      screen,
      projectMode: startMode,
      projectModes: prefs.projectModes,
      projectChats: prefs.projectChats,
      projectPanels: prefs.projectPanels,
      commPanelOpen: prefs.commPanelOpen,
      diffPanelOpen: prefs.diffPanelOpen,
      termPanelOpen: prefs.termPanelOpen,
      dockSizes: prefs.dockSizes,
      paneWidths: prefs.paneWidths,
      settingsSection: prefs.settingsSection,
      sidebarCollapsed: prefs.sidebarCollapsed,
      sidebarOpen: prefs.sidebarOpen,
      navHistory: [{
        screen,
        projectId: lastProjectValid ? config.lastProjectId : null,
        chatId: finalChatId,
        projectMode: startMode,
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

    // Anything the previous run of the app left alive. A crash never reaches the shutdown that
    // kills the agents, so this is where they are found and stopped — before the user sends
    // anything new and ends up with two agents in the same workspace.
    void recovery.reapAfterCrash();

    set({ loaded: true });

    // The messaging bridge, if there is one: nothing is exposed by turning it on — the app is the
    // one that goes out and asks — but it is still a way into this machine, so it only runs where
    // the app itself runs and only when it was asked for. What reaches the bell is forwarded from
    // the same place the bell reads, wired once whether or not any channel is on today.
    if (isTauri()) {
      const bridge = await import("@/lib/bridge");
      bridge.attachBridgeNotifications();
      if (config.messaging?.telegram?.enabled || config.messaging?.discord?.enabled || config.messaging?.slack?.enabled) {
        await bridge.startBridge().catch(() => {});
      }
    }

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

let byProjectCache: { projects: Project[]; groups: { project: Project; agents: AgentConfig[] }[] } | null = null;

/**
 * The same agents as `selectAllAgents`, kept in their projects. Two projects can each have an
 * "Orchestrator", and a list that flattens them says nothing about which is which.
 */
export function selectAgentsByProject(state: AppState): { project: Project; agents: AgentConfig[] }[] {
  const projects = state.config.projects;
  if (byProjectCache && byProjectCache.projects === projects) return byProjectCache.groups;
  const groups = projects
    .map(project => ({ project, agents: project.agents ?? [] }))
    .filter(group => group.agents.length > 0);
  byProjectCache = { projects, groups };
  return groups;
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
