// Shared types for the AIS orchestrator. Keep in sync with PLAN.md and src-tauri/src/*.rs.
import type { Language } from "@/i18n";

export type ProviderId =
  | "claude"
  | "antigravity"
  | "copilot"
  | "gemini"
  | "codex"
  | "ollama"
  | "aider"
  | "opencode"
  | "custom";

export type AgentRole = "planner" | "implementer" | "reviewer" | "custom";

export type AgentStatus =
  | "idle"
  | "working"
  | "waiting" // delegated and waiting for children
  | "stopped"
  | "error";

export interface CustomCommand {
  program: string;
  /** `{prompt}` inside any arg is replaced by the prompt text. */
  args: string[];
}

export interface AgentConfig {
  id: string;
  name: string;
  provider: ProviderId;
  role: AgentRole;
  /** null = root of the hierarchy */
  parentId: string | null;
  model?: string;
  /** Skip permission prompts (Claude: --dangerously-skip-permissions, agy: idem). */
  autoApprove: boolean;
  /** Shown to the parent planner when listing available agents. */
  description?: string;
  /** Extra instructions appended to the role system prompt. */
  systemPrompt?: string;
  /** Only for provider "custom". */
  customCommand?: CustomCommand;
  /** Hex color used for badges and graph nodes. */
  color?: string;
  /**
   * Defines if delegated tasks require approval before running.
   * `true`: Always require approval.
   * `false`: Never require approval.
   * `undefined`: Inherit from the global `approveDelegations` setting.
   */
  requireApproval?: boolean;
  /** Run this agent in its own git worktree (own branch, sibling folder). See src/lib/worktree.ts. */
  worktree?: boolean;
  /**
   * Relaunch a run of this agent from scratch (same prompt, no resume) once its provider's quota
   * is back, instead of leaving it failed. Per-agent because quota is spent per provider/model, and
   * one agent in a team can be pinned to a model that runs dry far more often than the rest.
   * Independent of `autonomous` on the project: a supervised project can still want this.
   */
  retryOnQuota?: boolean;
}

/** A git worktree an agent works in, one per agent and project. */
export interface AgentWorktree {
  agentId: string;
  /** Folder of the worktree, a sibling of the workspace. */
  path: string;
  branch: string;
  /** Branch it was created from. */
  base: string;
  createdAt: number;
  /** Last time it was prepared (dependency install included). */
  readyAt?: number;
}

export interface Skill {
  id: string;
  name: string;
  description?: string;
  content: string;
  enabledFor: "all" | string[];
}

export interface McpServer {
  id: string;
  name: string;
  transport: "stdio" | "http";
  command?: string;
  args?: string[];
  env?: Record<string, string>;
  url?: string;
  /**
   * Extra HTTP headers sent on every request, for a hosted server that asks for authentication.
   * Only applies to `transport: "http"`; a stdio server has no request to put them on.
   *
   * The value may hold `${VARIABLE}`, which the client expands from the environment when it reads
   * its config, so the secret itself never has to be written down here.
   */
  headers?: Record<string, string>;
  enabledFor: "all" | string[];
}

/**
 * A command the app runs itself to decide whether an agent's work holds up.
 *
 * The program and its arguments are kept apart rather than stored as one line, because that is how
 * they are spawned: nothing typed here is ever handed to a shell. See `lib/verify-commands.ts`.
 */
export interface VerifyCommand {
  id: string;
  label: string;
  program: string;
  args: string[];
}

/** Spending limits and policy for a project. */
export interface Budget {
  /** Dollars per day. 0 or missing means no limit. */
  dailyUsd?: number;
  /** Dollars per month. 0 or missing means no limit. */
  monthlyUsd?: number;
  /**
   * Dollars a single run may cost. 0 or missing means no limit.
   *
   * Checked once a run has reported what it spent, because that is when the CLIs say so — see
   * `lib/budget.ts`. It stops the chain rather than the run that went over.
   */
  perRunUsd?: number;
  /** What to do when the limit is reached. */
  onReached: "warn" | "block";
}

export interface Project {
  id: string;
  name: string;
  workspaceDir: string;
  color?: string;
  createdAt: number;
  /** The team that works on this project. Empty means the project has no agents yet. */
  agents: AgentConfig[];
  /** Spending limits for runs in this project. Warns or blocks when reached. */
  budget?: Budget;
  /**
   * What this project calls "done": run after an agent finishes delegated work, in the folder it
   * worked in. Missing or empty means nothing is checked, which is how it behaved before.
   */
  verify?: VerifyCommand[];
  /**
   * Commands the user added by hand, alongside the ones read from the project's manifests. Free
   * text on purpose: this is the user typing into their own shell, one step removed. The whitelist
   * in `lib/project-commands.ts` guards names the app builds from a file it did not write.
   */
  commands?: { id: string; label: string; command: string }[];
  /**
   * Notes handed to every agent of this project, and to no one else.
   *
   * It used to be one string on the config, appended to every agent's prompt in every project: an
   * agent of one project was told about another's stack, conventions and goals, and answered about
   * them as if it had been asked. Version 13 copies that string into each project and it lives here
   * from then on.
   */
  sharedContext?: string;
  /**
   * While this is set and `until` has not passed, the project runs without waiting for the user:
   * delegations that would need approval are approved, questions are answered on the agent's own
   * most conservative guess, and the round cap does not close the task. It turns itself off at
   * `until` on its own — there is no indefinite mode. See src/lib/autonomous.ts.
   */
  autonomous?: { until: number };
}

/** A saved team template: what a new project starts with. */
export interface Formation {
  id: string;
  name: string;
  description?: string;
  /** Same shape as a project's agents; ids are regenerated when it is applied. */
  agents: AgentConfig[];
  /**
   * Which skills and MCP servers each agent of the formation had, by the id those resources have
   * in the config. Keyed by the agent id *inside the formation*. Without this, a skill enabled for
   * one agent in particular would be lost the moment the team is copied into another project,
   * because the copy gets new agent ids.
   */
  assignments?: Record<string, { skills: string[]; mcpServers: string[] }>;
}

export type HookEvent =
  // Something an agent did.
  | "approval.requested"
  | "task.started"
  | "task.finished"
  | "task.failed"
  | "delegation"
  | "run.finished"
  | "run.failed"
  | "agent.stopped"
  | "result"
  | "question.asked"
  | "review.changes"
  /** A project's own verification commands said no. */
  | "verify.failed"
  | "quota.exhausted"
  // Something that happened to the machine, with no agent behind it (see src/lib/system-hooks.ts).
  /** The app was opened. */
  | "app.started"
  /** A clock: at a time of day, or every so many minutes. */
  | "schedule"
  /** The machine lost its connection, or got it back. */
  | "internet.lost"
  | "internet.back"
  /** Something changed in a project's folder, filtered of noise and debounced. */
  | "file.changed";

export type HookAction =
  | { type: "slack"; webhookUrl: string; template: string }
  | { type: "discord"; webhookUrl: string; template: string }
  /** Reuses the bot and token already configured in Messaging; without chatId sends to all authorized chats. */
  | { type: "telegram"; template: string; chatId?: string }
  | { type: "webhook"; url: string; method?: "POST"; headers?: Record<string, string>; bodyTemplate: string }
  | { type: "command"; program: string; args: string[]; cwd?: "workspace" | string }
  | { type: "instruct"; agentId: string; template: string }
  | { type: "notify"; title: string; template: string };

export interface Hook {
  id: string;
  name: string;
  event: HookEvent;
  enabled: boolean;
  filter?: { agentId?: string; projectId?: string };
  action: HookAction;
  /** Only for "schedule": when it fires. `at` wins if both are set. */
  schedule?: {
    /** Time of day, "HH:MM" on the machine's clock. */
    at?: string;
    /** Every so many minutes, counted from when the app opened. */
    everyMinutes?: number;
  };
}

/** A delegated task (or instruction) waiting for the user's go-ahead. */
export interface Approval {
  id: string;
  projectId: string;
  kind: "delegation" | "instruction";
  /** Agent that requested it (the planner). */
  agentId: string;
  /** Agent that would receive the task. */
  toAgentId?: string;
  summary: string;
  /** Everything needed to launch the run once approved. */
  payload: { agentId: string; projectId: string; prompt: string; parentRunId: string | null; round: number; rootRunId?: string; model?: string };
  createdAt: number;
  status: "pending" | "approved" | "rejected";
  note?: string;
  decidedAt?: number;
  /** Approved by autonomous mode, without asking — see src/lib/autonomous.ts. */
  auto?: boolean;
}

/**
 * A question an agent asked, with the answers it will take.
 *
 * An agent that needs the user to decide something used to have two ways out: guess, or end its
 * run with a paragraph asking and hope somebody read it. It can put an `ask` block in its answer
 * instead (see `parseQuestions`), and the conversation shows the options.
 */
export interface AgentQuestion {
  id: string;
  projectId: string;
  /** Who is asking, and the run that ended asking. */
  agentId: string;
  runId: string;
  rootRunId: string;
  round: number;
  question: string;
  options: string[];
  /** Whether more than one option can be chosen. */
  multiple: boolean;
  /** Whether an answer of the user's own is allowed on top of the options. */
  allowOther: boolean;
  createdAt: number;
  status: "pending" | "answered";
  /** What was chosen (or written), once it was. */
  answer?: string[];
  answeredAt?: number;
  /** Answered by autonomous mode, without the user — see src/lib/autonomous.ts. */
  auto?: boolean;
}

/** Public tunnel provider used on top of the LAN server. */
export type TunnelProviderId = "cloudflared" | "ngrok";

export interface TunnelConfig {
  provider: TunnelProviderId;
  /** Only meaningful while `RemoteConfig.enabled` is true: the tunnel needs the local server. */
  enabled: boolean;
  /**
   * Fixed public hostname, without scheme. ngrok: the static domain of the account
   * (`algo.ngrok-free.app`). cloudflared: the hostname routed to the named tunnel.
   * Empty/undefined means an ephemeral URL.
   */
  domain?: string;
  /** cloudflared only: name (or UUID) of the named tunnel created with `cloudflared tunnel create`. */
  tunnelName?: string;
  /**
   * What the user picked in the UI: a URL that changes on every start ("dynamic") or one that is
   * always the same ("static", which needs `domain`). Absent means it is inferred from `domain`.
   */
  domainType?: "dynamic" | "static";
}

export interface RemoteConfig {
  enabled: boolean;
  port: number;
  token: string;
  tunnel: TunnelConfig;
}

/** Minimum level written to the log file (see src/lib/logger.ts). */
export type LogLevel = "debug" | "info" | "warn" | "error";

export interface TrayConfig {
  /** Keep the app running in the system tray when the window is closed. */
  enabled: boolean;
  /** Send a system notification when an agent needs approval. */
  notifyApprovals: boolean;
  /** Send a system notification when a task finishes. */
  notifyResults: boolean;
}

/**
 * What a notification sounds like. Missing means the app's own two notes: nothing here has to be
 * set for the sound to work, and every field only says how it differs from that.
 */
export interface SoundSettings {
  /** Off only when it was turned off. */
  enabled?: boolean;
  /** The two notes of the "something needs you" chime, in Hz; the other one is them reversed. */
  notes?: [number, number];
  wave?: OscillatorType;
  /** 0 to 1. */
  volume?: number;
  /** A sound of your own, as a data URL. When it is here, it plays instead of the notes. */
  file?: string;
  /** What that file was called, so the setting can say which one it is. */
  fileName?: string;
}

/** A saved order: a prompt you reuse, optionally bound to one agent and model. */
export interface Preset {
  id: string;
  name: string;
  prompt: string;
  /** Only offered for this agent when set; otherwise it applies to any of them. */
  agentId?: string;
  model?: string;
}

export interface MessagingChannelConfig {
  enabled: boolean;
  /** The token that sends messages: the bot token, in every channel including Slack. */
  token: string;
  /** Slack-only: the app-level token (`xapp-…`) that opens the Socket Mode connection. */
  appToken?: string;
  allowedChatIds: string[];
  projectId: string | null;
}

export interface AppConfig {
  version: 13;
  /** UI language; null follows the system. */
  language: Language | null;
  /** Every delegation waits for approval (app, CLI or phone) before the child runs. */
  approveDelegations: boolean;
  remote: RemoteConfig;
  tray: TrayConfig;
  messaging?: { telegram?: MessagingChannelConfig; discord?: MessagingChannelConfig; slack?: MessagingChannelConfig };
  projects: Project[];
  /** Saved team templates offered when a project is created. */
  formations: Formation[];
  /** Formation preselected in the project dialog; null = start with no agents. */
  defaultFormationId: string | null;
  lastProjectId: string | null;
  /** Max planner continuation rounds per user task. */
  maxRounds: number;
  skills: Skill[];
  mcpServers: McpServer[];
  /**
   * @deprecated Pre-version-13 global. Migration 13 copied it into every project's own
   * `sharedContext` and left it empty; nothing builds a prompt from it any more. Kept on the type
   * so a config written by an older build still parses.
   */
  sharedContext: string;
  binaryOverrides: Partial<Record<ProviderId, string>>;
  profile: { name: string; about: string; preferences: string };
  presets: Preset[];
  autoModel: boolean;
  hooks: Hook[];
  chats: Chat[];
  /** Minimum level written to the log file. Default "info". */
  logLevel: LogLevel;
  /** Check for a new release a few seconds after startup. Default true. */
  autoUpdateCheck: boolean;
  /** Archive done tasks older than this many days; null never archives on its own. */
  autoArchiveDoneDays: number | null;
  /** The sound every notification makes, in the window and from the tray (see lib/sound.ts). */
  notificationSound?: SoundSettings;
}

export interface AgentRuntime {
  agentId: string;
  status: AgentStatus;
  currentTask?: string;
  currentRunId?: string;
  /** Claude session id / agy conversation id, used to resume. */
  sessionId?: string;
  /** When `sessionId` last changed (set or cleared); newest wins when merging with disk. */
  sessionUpdatedAt?: number;
  /**
   * What the session was told about the team: this agent's name and its children's.
   *
   * A resumed conversation carries the old roster with it, so a session opened under one team
   * cannot be handed to another — see `lib/session-team.ts`.
   */
  sessionTeam?: string;
  lastError?: string;
  /** What is being set up before the run can start ("Creando el worktree…"). In memory only. */
  preparing?: string;
  queuedInstructions: string[];
}

/**
 * The process behind a run, as the OS reported it when it started. Written down because a crash
 * never gets to kill the CLIs it started: the next launch uses this to find them and, since pids
 * are reused, to be sure it found the right ones (see `reap_orphans` in src-tauri/src/runner.rs).
 */
export interface SpawnedProcess {
  pid: number;
  /** The image name the OS reports, e.g. "node.exe". Empty when it could not be read. */
  image: string;
}

export type RunStatus = "running" | "done" | "error" | "killed";

/** What one run consumed, as reported by its CLI. Every field is optional: each one reports less. */
export interface RunUsage {
  /** Dollars, when the provider reports them (today only Claude Code). */
  costUsd?: number;
  inputTokens?: number;
  outputTokens?: number;
  cachedInputTokens?: number;
  /** Model turns inside the run. */
  turns?: number;
  /** Duration reported by the CLI itself, in ms (may differ from ours). */
  durationMs?: number;
  /** Copilot counts premium requests instead of tokens. */
  premiumRequests?: number;
}

export interface Run {
  id: string;
  projectId: string;
  agentId: string;
  parentRunId: string | null;
  /** Id of the root run of the user task this run belongs to (itself for a root run). */
  rootRunId: string;
  prompt: string;
  status: RunStatus;
  startedAt: number;
  endedAt?: number;
  exitCode?: number | null;
  /** Final answer text of the agent. */
  output: string;
  /** Raw stdout/stderr lines, for debugging. */
  rawLines: string[];
  childRunIds: string[];
  /** Continuation round, starts at 0. */
  round: number;
  model?: string;
  /** Where the CLI actually ran: the project workspace, or the agent's own worktree. */
  cwd?: string;
  /** The commit the workspace was on when the run started, so its own diff can be taken later. */
  baseSha?: string;
  /**
   * Names this run delegated to that matched no child of its agent.
   *
   * Kept because the work they carried has to be mentioned again when the round comes back: with
   * some delegations valid the run cannot simply be retried, and without this the piece of work
   * behind a mistyped name disappeared with the error message.
   */
  unknownDelegations?: string[];
  /**
   * What was already modified or untracked in `cwd` when the run started.
   *
   * Only used to undo a run: without it, "put this back" cannot tell the agent's work from work
   * the user had in flight, and would throw both away. See `lib/run-revert.ts`.
   */
  treeAtStart?: { modified: string[]; untracked: string[] };
  /** What the project's verification commands said about this run's work, when it has any. */
  verification?: {
    status: "passed" | "failed";
    /** The command that failed, with what it printed. Absent when everything passed. */
    failed?: { label: string; code: number | null; output: string };
    ranAt: number;
  };
  /** "task" (default) or "chat" — chat runs skip delegation parsing. */
  kind?: "task" | "chat";
  /** The chat this run answers in, so its provider session is kept with that chat and not shared. */
  chatId?: string;
  /** What the CLI said the run consumed. Absent when the provider reported nothing. */
  usage?: RunUsage;
  /** Set when this run is a review of another agent's finished run. */
  review?: { ofRunId: string; taskId: string };
  /** The CLI process behind it, so a crashed app's leftovers can be found on the next launch. */
  process?: SpawnedProcess;
}

export type MessageKind =
  | "user" // prompt typed by the user
  | "instruction" // direct instruction from the user to one agent
  | "text" // assistant text
  | "tool" // tool call summary
  | "delegation" // planner -> child task
  | "result" // final answer of a run
  | "system"
  | "error"
  | "note"
  | "stderr";

export interface CommMessage {
  id: string;
  ts: number;
  runId?: string;
  projectId?: string;
  fromAgentId: string | "user";
  toAgentId?: string | "user";
  kind: MessageKind;
  text: string;
  /** Only on `tool` messages: what the agent called and a one-line summary of it. */
  meta?: { tool: string; summary: string; input?: unknown; failed?: boolean; error?: string };
}

export interface Delegation {
  agent: string;
  task: string;
  model?: string;
  /** Card of the board this delegation picks up, when the planner is working off it. */
  taskId?: string;
}

export interface ChatParticipant {
  agentId: string;
  role: string;
  model?: string;
}

export interface Chat {
  id: string;
  projectId: string;
  name: string;
  mode: "individual" | "shared";
  participants: ChatParticipant[];
  createdAt: number;
}

export interface ChatMessage {
  id: string;
  chatId: string;
  ts: number;
  from: "user" | string; /* agentId */
  text: string;
  runId?: string;
  status?: "pending" | "done" | "error";
}

/** What one folder of the app's own storage holds (see `Transport.storageStat`). */
export interface StorageStat {
  /** Absolute path of the folder that was measured. */
  path: string;
  exists: boolean;
  /** Whether a file could actually be created in it. Always false when it does not exist. */
  writable: boolean;
  files: number;
  bytes: number;
}

export interface BinaryInfo {
  path: string;
  version?: string | null;
}

export type Binaries = Partial<Record<ProviderId, BinaryInfo | null>>;

export interface ModelInfo {
  id: string;
  label: string;
}

export interface QuotaItem {
  /** "Premium requests", "Ventana de 5 h", "Pool Gemini"… */
  label: string;
  /** Id of the model (or pool prefix) this item applies to; no model = global. */
  model?: string;
  remaining?: number;
  entitlement?: number;
  percentRemaining?: number;
  /** For window-style items (Claude Code). */
  usedPercent?: number;
  unlimited?: boolean;
  /** Epoch ms. */
  resetsAt?: number;
  /**
   * Used up right now, for a provider that says so without saying how much there was.
   *
   * Antigravity is the case: its pools report "agotado" and a reset time and no numbers at all, so
   * the summary fell through to "no idea" — which reads as "not exhausted" to anything asking
   * whether the quota is back, and that is how a parked run got relaunched into the same wall.
   */
  exhausted?: boolean;
  note?: string;
}

export interface ProviderQuota {
  provider: ProviderId;
  status: "ok" | "unavailable" | "error";
  message?: string;
  fetchedAt: number;
  items: QuotaItem[];
  /** The provider answered 429: it is being asked more often than it allows. */
  rateLimited?: boolean;
}

// ---- Rust IPC contracts (see src-tauri/src/runner.rs) ----

export interface SpawnOptions {
  runId: string;
  program: string;
  args: string[];
  cwd?: string;
  stdinText?: string;
  env?: Record<string, string>;
}

export interface RunOutputEvent {
  runId: string;
  stream: "stdout" | "stderr";
  line: string;
}

export interface RunExitEvent {
  runId: string;
  code: number | null;
  killed: boolean;
}

/** Normalized event produced by a provider's line parser. */
export type ParsedEvent =
  | { type: "session"; sessionId: string }
  | { type: "text"; text: string }
  | { type: "tool"; name: string; detail?: string; input?: unknown; failed?: boolean; error?: string }
  | { type: "result"; text: string; sessionId?: string; usage?: RunUsage }
  | { type: "error"; text: string }
  /**
   * A line the CLI wrote to stderr, passed through as it came.
   *
   * Not an error: the CLIs use that stream for progress and chatter as much as for failures —
   * Claude Code prints "root agent idle; waiting for N background task(s)" there while its
   * subtasks run. An error the app can name comes out of the structured stream as `error`.
   */
  | { type: "stderr"; text: string }
  | { type: "raw"; text: string };

// ---- Integrated terminals (see src-tauri/src/pty.rs) ----

/** A shell detected on this machine, offered when opening a terminal. */
export interface ShellInfo {
  id: string;
  label: string;
  path: string;
}

/** One open terminal tab. Lives only in memory: terminals are not restored on restart. */
export interface TerminalTab {
  id: string;
  title: string;
  shellId: string;
  shellPath: string;
  cwd: string;
  projectId: string | null;
  /**
   * Typed into the shell as soon as it comes up, for a tab opened from one of the project's own
   * scripts (see `lib/project-commands.ts`). Only ever a name this app built, never free text.
   */
  command?: string;
  /** Exit code once the shell died, null while it is alive. */
  exited?: number | null;
}

export interface PtyOutputEvent {
  id: string;
  data: string;
}

export interface PtyExitEvent {
  id: string;
  code: number | null;
}

// ---- In-app notification center (src/lib/notifications.ts) ----

export type NotificationKind =
  | "approval" // a delegation is waiting for the user's go-ahead
  | "question" // an agent asked something and is waiting for the answer
  | "task-done" // a task finished
  | "task-failed" // a task failed
  | "interrupted" // a run was cut short when the app went away
  | "tunnel" // the public tunnel fell or changed state
  | "update" // a newer version is available
  | "info";

/** One entry of the bell's history. Session-only: never written to disk. */
export interface AppNotification {
  id: string;
  kind: NotificationKind;
  title: string;
  /** One line of detail; no markdown. */
  body?: string;
  ts: number;
  read: boolean;
  /** So the panel can take the user to where it happened. */
  projectId?: string;
  agentId?: string;
  runId?: string;
  approvalId?: string;
  /**
   * The question that was asked, so a notification about one can carry its options.
   *
   * The approval next to it has had this since it existed; a question had only its text, which is
   * enough to read and not enough to answer without going and finding it.
   */
  questionId?: string;
}

// ---- Tasks (per project board + dependency graph, see src/lib/tasks.ts) ----

export type TaskStatus = "backlog" | "working" | "needs-you" | "in-review" | "ready" | "done";

/** How urgent a task is. Missing means "normal": only "high" changes how the board reads. */
export type TaskPriority = "low" | "normal" | "high";

export interface Task {
  id: string;
  projectId: string;
  title: string;
  /** Long form detail, in markdown. */
  detail?: string;
  status: TaskStatus;
  /** Urgency; missing counts as "normal". */
  priority?: TaskPriority;
  /** Agent in charge. */
  agentId?: string;
  /** Tasks that have to finish before this one. */
  dependsOn: string[];
  /** Run executing it (or the one that did). */
  runId?: string;
  /** Approval this task is waiting on, while it sits in "needs-you". */
  approvalId?: string;
  /** Branch being worked on, when known. */
  branch?: string;
  createdAt: number;
  updatedAt: number;
  /** Position inside its column. */
  order: number;
  archived: boolean;
}
/** The sections of the right dock. */
export type DockSectionId = "comm" | "diff" | "term";
