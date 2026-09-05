// Shared types for the AIS orchestrator. Keep in sync with PLAN.md and src-tauri/src/*.rs.

export type ProviderId =
  | "claude"
  | "antigravity"
  | "copilot"
  | "gemini"
  | "codex"
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

export interface AppConfig {
  version: 3;
  agents: AgentConfig[];
  projects: Project[];
  lastProjectId: string | null;
  /** Max planner continuation rounds per user task. */
  maxRounds: number;
  skills: Skill[];
  mcpServers: McpServer[];
  sharedContext: string;
}

export interface AgentRuntime {
  agentId: string;
  status: AgentStatus;
  currentTask?: string;
  currentRunId?: string;
  /** Claude session id / agy conversation id, used to resume. */
  sessionId?: string;
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
}

export interface Delegation {
  agent: string;
  task: string;
}

export interface BinaryInfo {
  path: string;
  version?: string | null;
}

export type Binaries = Partial<Record<ProviderId, BinaryInfo | null>>;

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
  | { type: "tool"; name: string; detail?: string }
  | { type: "result"; text: string; sessionId?: string }
  | { type: "error"; text: string }
  | { type: "raw"; text: string };
