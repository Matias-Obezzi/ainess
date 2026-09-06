// Shared types for the AIS orchestrator. Keep in sync with PLAN.md and src-tauri/src/*.rs.

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
  /** Tasks delegated to this agent wait for the user's approval before running. */
  requireApproval?: boolean;
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
  enabledFor: "all" | string[];
}

export interface Project {
  id: string;
  name: string;
  workspaceDir: string;
  color?: string;
  createdAt: number;
}

export type HookEvent =
  | "approval.requested"
  | "task.started"
  | "task.finished"
  | "task.failed"
  | "delegation"
  | "run.finished"
  | "run.failed"
  | "agent.stopped"
  | "result";

export type HookAction =
  | { type: "slack"; webhookUrl: string; template: string }
  | { type: "discord"; webhookUrl: string; template: string }
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

export interface AppConfig {
  version: 9;
  /** Every delegation waits for approval (app, CLI or phone) before the child runs. */
  approveDelegations: boolean;
  remote: RemoteConfig;
  tray: TrayConfig;
  agents: AgentConfig[];
  projects: Project[];
  lastProjectId: string | null;
  /** Max planner continuation rounds per user task. */
  maxRounds: number;
  skills: Skill[];
  mcpServers: McpServer[];
  sharedContext: string;
  binaryOverrides: Partial<Record<ProviderId, string>>;
  profile: { name: string; about: string; preferences: string };
  presets: Array<{ id: string; name: string; prompt: string; agentId?: string; model?: string }>;
  autoModel: boolean;
  hooks: Hook[];
  chats: Chat[];
  /** Minimum level written to the log file. Default "info". */
  logLevel: LogLevel;
  /** Check for a new release a few seconds after startup. Default true. */
  autoUpdateCheck: boolean;
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
  lastError?: string;
  queuedInstructions: string[];
}

export type RunStatus = "running" | "done" | "error" | "killed";

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
  /** "task" (default) or "chat" — chat runs skip delegation parsing. */
  kind?: "task" | "chat";
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
  meta?: { tool: string; summary: string; input?: unknown };
}

export interface Delegation {
  agent: string;
  task: string;
  model?: string;
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
  note?: string;
}

export interface ProviderQuota {
  provider: ProviderId;
  status: "ok" | "unavailable" | "error";
  message?: string;
  fetchedAt: number;
  items: QuotaItem[];
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
  | { type: "tool"; name: string; detail?: string; input?: unknown }
  | { type: "result"; text: string; sessionId?: string }
  | { type: "error"; text: string }
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
