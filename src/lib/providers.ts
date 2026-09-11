import { AgentConfig, AgentRole, Binaries, ProviderId, SpawnOptions, ParsedEvent, Delegation, Skill, ModelInfo, RunUsage, Task, TaskStatus } from "@/types";
import { translateNow } from "@/i18n/useT";
import { truncate } from "@/lib/format";
import { skillRelativePath } from "@/lib/project-folder";
import { roleLabelKey } from "@/lib/labels";

/** Turns a plain list of model ids into `ModelInfo[]` (no friendly label known). */
function toModels(ids: string[]): ModelInfo[] {
  return ids.map(id => ({ id, label: id }));
}

export interface BuildInput {
  agent: AgentConfig;
  prompt: string;
  systemPrompt: string;
  sessionId?: string;
  cwd?: string;
  binaryPath: string;
  mcpConfigPath?: string;
}

export interface ProviderSpec {
  id: ProviderId;
  label: string;
  defaultModels: string[];
  /** Same as `defaultModels`, but with a human label per model (used by the model picker). */
  models: ModelInfo[];
  supportsSessions: boolean;
  promptVia: "stdin" | "arg";
  /** Dictionary key of a line of help about this provider (see `provider.*` in src/i18n). */
  noteKey?: string;
  buildCommand(input: BuildInput): Omit<SpawnOptions, "runId">;
  parseLine(line: string, stream: "stdout" | "stderr"): ParsedEvent[];
  /** Final answer when the provider's own `result` event doesn't carry it (default: all raw lines). */
  finalOutput?(rawLines: string[]): string;
  /**
   * Usage when it only exists per step and has to be added up (opencode). Read once the run ends,
   * so a run of five steps reports what the five of them cost and not what the last one did.
   */
  finalUsage?(rawLines: string[]): RunUsage | undefined;
}

// ---- What each provider is assumed to print on one line of stdout -------------------------------
//
// These were `any`. Not a shape nobody knew — a shape nobody wrote down: a field renamed between
// CLI versions then read as `undefined` at some call site far from here, instead of failing where
// the assumption lives. Every field is optional because every one of them is the provider's choice,
// and the parsers still check before they use; what changed is that the assumption now has a name
// and a place, and adding a field means declaring it.

interface ClaudeLine {
  type?: string;
  subtype?: string;
  session_id?: string;
  message?: { content?: Array<{ type?: string; text?: string; name?: string; input?: unknown }> };
  result?: string;
}

interface AntigravityLine {
  event?: string;
  conversation_id?: string;
  step_update?: {
    step_type?: string;
    state?: string;
    text_delta?: string;
    tool_name?: string;
    tool_info?: { name?: string; parameters?: unknown };
  };
  result?: { status?: string; error?: string; response?: string; conversation_id?: string };
}

interface CopilotLine {
  type?: string;
  sessionId?: string;
  message?: unknown;
  data?: {
    content?: unknown;
    message?: unknown;
    toolRequests?: Array<{ name?: string; toolName?: string; arguments?: unknown }>;
  };
}

interface OpencodeLine {
  type?: string;
  sessionID?: string;
  error?: { name?: string; data?: { statusCode?: number; message?: unknown } };
  part?: {
    id?: string;
    type?: string;
    text?: string;
    tool?: unknown;
    state?: { status?: string; input?: unknown; error?: string };
    /** Only on `step-finish`: what that step spent. */
    tokens?: { input?: unknown; output?: unknown; cache?: { read?: unknown; write?: unknown } };
    cost?: unknown;
  };
}

/**
 * One line of a CLI's stdout as the shape its parser expects.
 *
 * The caller names the shape, which is the point: the cast happens once, here, against a declared
 * interface, instead of implicitly at every property access downstream.
 */
function parseJsonTolerant<T = Record<string, unknown>>(line: string): T | null {
  try {
    const parsed: unknown = JSON.parse(line);
    return isRecord(parsed) ? (parsed as T) : null;
  } catch {
    return null;
  }
}

/**
 * One property of something that came off a CLI's stdout.
 *
 * `unknown` rather than a shape, because that is what it is: every provider names its fields
 * differently, changes them between versions, and is free to send something else entirely. Reading
 * through here is what keeps "the CLI printed a string where we expected a number" from becoming a
 * crash three lines later.
 */
function field(value: unknown, name: string): unknown {
  return typeof value === "object" && value !== null ? (value as Record<string, unknown>)[name] : undefined;
}

/** Whether something parsed off stdout is worth reading fields from at all. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null;
}

/** A number only when the provider actually sent one: strings, nulls and NaN are "not reported". */
function num(value: unknown): number | undefined {
  return typeof value === "number" && Number.isFinite(value) ? value : undefined;
}

/** Drops the fields nobody reported, so an absent value never turns into a zero. */
function compactUsage(usage: RunUsage): RunUsage | undefined {
  const entries = Object.entries(usage).filter(([, value]) => value !== undefined);
  return entries.length > 0 ? (Object.fromEntries(entries) as RunUsage) : undefined;
}

/**
 * Claude Code's `result` line: `total_cost_usd`, `num_turns`, `duration_ms` and a `usage` object
 * with the token counts. The two cache counters are added up into one "cached" figure.
 */
export function claudeUsage(obj: unknown): RunUsage | undefined {
  const u = field(obj, "usage");
  const cacheRead = num(field(u, "cache_read_input_tokens"));
  const cacheWrite = num(field(u, "cache_creation_input_tokens"));
  const cached = cacheRead === undefined && cacheWrite === undefined ? undefined : (cacheRead ?? 0) + (cacheWrite ?? 0);
  return compactUsage({
    costUsd: num(field(obj, "total_cost_usd")),
    inputTokens: num(field(u, "input_tokens")),
    outputTokens: num(field(u, "output_tokens")),
    cachedInputTokens: cached,
    turns: num(field(obj, "num_turns")),
    durationMs: num(field(obj, "duration_ms")),
  });
}

/**
 * Antigravity's `result.usage`. The agy build in use does not document the shape and different
 * versions have named the same counters differently, so every spelling we have seen is accepted
 * and whatever is missing simply stays out.
 */
export function antigravityUsage(result: unknown): RunUsage | undefined {
  const u = field(result, "usage");
  if (!isRecord(u)) return undefined;
  return compactUsage({
    costUsd: num(u.total_cost_usd ?? u.cost_usd ?? u.cost),
    inputTokens: num(u.input_tokens ?? u.inputTokens ?? u.prompt_tokens ?? u.promptTokens),
    outputTokens: num(u.output_tokens ?? u.outputTokens ?? u.completion_tokens ?? u.completionTokens),
    cachedInputTokens: num(u.cached_input_tokens ?? u.cachedInputTokens ?? u.cache_read_input_tokens ?? u.cached_tokens),
    turns: num(u.turns ?? u.num_turns ?? field(result, "num_turns")),
    durationMs: num(u.duration_ms ?? u.durationMs ?? field(result, "duration_ms")),
    premiumRequests: num(u.premium_requests ?? u.premiumRequests),
  });
}

/** Copilot's `result.usage`: premium requests and the session duration, no tokens and no cost. */
export function copilotUsage(obj: unknown): RunUsage | undefined {
  const u = field(obj, "usage");
  if (!isRecord(u)) return undefined;
  return compactUsage({
    inputTokens: num(u.input_tokens ?? u.inputTokens),
    outputTokens: num(u.output_tokens ?? u.outputTokens),
    cachedInputTokens: num(u.cached_input_tokens ?? u.cachedInputTokens),
    durationMs: num(u.sessionDurationMs ?? u.session_duration_ms ?? u.durationMs),
    premiumRequests: num(u.premiumRequests ?? u.premium_requests),
  });
}

function parseClaudeLine(line: string, stream: "stdout" | "stderr"): ParsedEvent[] {
  const obj = parseJsonTolerant<ClaudeLine>(line);
  if (!obj) {
    if (stream === "stderr") return [{ type: "error", text: line }];
    return [{ type: "raw", text: line }];
  }
  
  // The id is checked rather than assumed: `sessionId` is declared a string, and an init line
  // without one used to travel as `undefined` pretending to be one — which the resume then used.
  if (obj.type === "system" && obj.subtype === "init" && obj.session_id) {
    return [{ type: "session", sessionId: obj.session_id }];
  }
  if (obj.type === "assistant" && obj.message && Array.isArray(obj.message.content)) {
    const events: ParsedEvent[] = [];
    for (const item of obj.message.content) {
      if (item.type === "text") {
        events.push({ type: "text", text: item.text ?? "" });
      } else if (item.type === "tool_use") {
        const detail = item.input ? JSON.stringify(item.input).substring(0, 200) : undefined;
        events.push({ type: "tool", name: item.name ?? "tool", detail, input: item.input });
      }
    }
    return events;
  }
  if (obj.type === "result") {
    const usage = claudeUsage(obj);
    return [{ type: "result", text: obj.result || "", sessionId: obj.session_id, ...(usage ? { usage } : {}) }];
  }
  return [];
}

function parseAntigravityLine(line: string, stream: "stdout" | "stderr"): ParsedEvent[] {
  const obj = parseJsonTolerant<AntigravityLine>(line);
  if (!obj) {
    if (stream === "stderr") return [{ type: "error", text: line }];
    return [{ type: "raw", text: line }];
  }

  if (obj.event === "init" && obj.conversation_id) {
    return [{ type: "session", sessionId: obj.conversation_id }];
  }
  if (obj.event === "step_update" && obj.step_update) {
    const { step_type, state, text_delta, tool_name, tool_info } = obj.step_update;
    if (step_type === "agent_response") {
      return text_delta ? [{ type: "text", text: text_delta }] : [];
    }
    if (step_type === "user_input" || step_type === "system_message") return [];
    // Tool steps arrive twice (ACTIVE then DONE/ERROR): log once when they start, plus failures.
    const name: string = tool_name || tool_info?.name || step_type || "tool";
    const params = tool_info?.parameters;
    const detail = params ? JSON.stringify(params).substring(0, 200) : undefined;
    if (state === "ACTIVE") return [{ type: "tool", name, detail, input: params }];
    if (state === "ERROR") return [{ type: "tool", name, failed: true, error: "" }];
    return [];
  }
  if (obj.event === "result" && obj.result) {
    const events: ParsedEvent[] = [];
    if (obj.result.status !== "SUCCESS" && obj.result.error) {
      events.push({ type: "error", text: obj.result.error });
    }
    const usage = antigravityUsage(obj.result);
    events.push({ type: "result", text: obj.result.response || "", sessionId: obj.result.conversation_id, ...(usage ? { usage } : {}) });
    return events;
  }
  return [];
}

/**
 * GitHub Copilot CLI `--output-format json` (JSONL). Relevant events:
 * - `assistant.message` → `data.content` (text) + `data.toolRequests[{name, arguments}]`
 * - `result` → `sessionId` (the final answer is NOT included: see `copilotFinalOutput`)
 * Ephemeral deltas (`assistant.message_delta`, `assistant.tool_call_delta`) are ignored.
 */
function parseCopilotLine(line: string, stream: "stdout" | "stderr"): ParsedEvent[] {
  const obj = parseJsonTolerant<CopilotLine>(line);
  if (!obj || typeof obj.type !== "string") {
    if (stream === "stderr" && line.trim() !== "") return [{ type: "error", text: line }];
    return line.trim() ? [{ type: "raw", text: line }] : [];
  }
  if (obj.type === "assistant.message") {
    const events: ParsedEvent[] = [];
    const content = typeof obj.data?.content === "string" ? obj.data.content : "";
    if (content.trim()) events.push({ type: "text", text: content + "\n" });
    for (const req of Array.isArray(obj.data?.toolRequests) ? obj.data.toolRequests : []) {
      const name = req?.name ?? req?.toolName ?? "tool";
      const detail = req?.arguments !== undefined ? JSON.stringify(req.arguments).substring(0, 200) : undefined;
      events.push({ type: "tool", name, detail, input: req?.arguments });
    }
    return events;
  }
  if (obj.type === "result") {
    const events: ParsedEvent[] = [];
    if (obj.sessionId) events.push({ type: "session", sessionId: obj.sessionId });
    // The answer text is rebuilt by `copilotFinalOutput`; this event exists only to carry the usage.
    const usage = copilotUsage(obj);
    if (usage) events.push({ type: "result", text: "", usage });
    return events;
  }
  if (obj.type === "error" || obj.type === "session.error") {
    const msg = obj.data?.message ?? obj.message ?? line;
    return [{ type: "error", text: String(msg) }];
  }
  return [];
}

/** Copilot's `result` event carries no answer text: rebuild it from the assistant messages. */
function copilotFinalOutput(lines: string[]): string {
  const parts: string[] = [];
  for (const line of lines) {
    const obj = parseJsonTolerant<CopilotLine>(line);
    if (obj?.type === "assistant.message" && typeof obj.data?.content === "string" && obj.data.content.trim()) {
      parts.push(obj.data.content);
    }
  }
  return parts.join("\n");
}

/**
 * opencode `run --format json`: one JSON object per line, `{type, timestamp, sessionID, part}`,
 * where `part` is what the SDK calls a message part (`text`, `tool`, `step-start`, `step-finish`).
 *
 * There is no closing event carrying the answer, so the text is rebuilt from its parts
 * (`opencodeFinalOutput`) and what a run spent is added up across its steps (`opencodeUsage`).
 */
function parseOpencodeLine(line: string, stream: "stdout" | "stderr"): ParsedEvent[] {
  const obj = parseJsonTolerant<OpencodeLine>(line);
  if (!obj || typeof obj.type !== "string") {
    if (stream === "stderr" && line.trim() !== "") return [{ type: "error", text: line }];
    return line.trim() ? [{ type: "raw", text: line }] : [];
  }

  const events: ParsedEvent[] = [];
  const part = obj.part ?? {};
  // Every line carries it; announcing it on the first one is enough to resume the session later.
  if (obj.type === "step_start" && typeof obj.sessionID === "string") {
    events.push({ type: "session", sessionId: obj.sessionID });
  }

  // What the provider behind opencode answered when it refused (a 429 over quota, a bad key). It
  // comes with no `part`, and swallowing it would end the run with no output and no reason.
  if (obj.type === "error") {
    const data = obj.error?.data ?? {};
    const status = data.statusCode ? ` (HTTP ${data.statusCode})` : "";
    const text = typeof data.message === "string" ? data.message : (obj.error?.name ?? line);
    events.push({ type: "error", text: `${String(text).split("\n")[0]}${status}` });
    return events;
  }

  if (part.type === "text" && typeof part.text === "string" && part.text.trim()) {
    events.push({ type: "text", text: part.text + "\n" });
    return events;
  }

  if (part.type === "tool") {
    const state = part.state ?? {};
    const name = typeof part.tool === "string" ? part.tool : "tool";
    // A call shows up as pending, then running, then completed: it is logged once, when it starts.
    if (state.status === "running") {
      const detail = state.input !== undefined ? JSON.stringify(state.input).substring(0, 200) : undefined;
      events.push({ type: "tool", name, detail, input: state.input });
    } else if (state.status === "error") {
      events.push({ type: "tool", name, failed: true, error: state.error ?? "" });
    }
  }

  return events;
}

/** The answer, rebuilt from the text parts. A part that arrives twice counts once (its last copy). */
function opencodeFinalOutput(lines: string[]): string {
  const byPart = new Map<string, string>();
  for (const line of lines) {
    const obj = parseJsonTolerant<OpencodeLine>(line);
    const part = obj?.part;
    if (part?.type !== "text" || typeof part.text !== "string") continue;
    if (!part.text.trim()) continue;
    byPart.set(typeof part.id === "string" ? part.id : String(byPart.size), part.text);
  }
  return [...byPart.values()].join("\n");
}

/** What the whole run spent: opencode reports it per step, so the steps are added up. */
export function opencodeUsage(lines: string[]): RunUsage | undefined {
  let input = 0, output = 0, cached = 0, cost = 0, steps = 0;
  for (const line of lines) {
    const obj = parseJsonTolerant<OpencodeLine>(line);
    const part = obj?.part;
    if (part?.type !== "step-finish") continue;
    steps++;
    const tokens = part.tokens ?? {};
    input += num(tokens.input) ?? 0;
    output += num(tokens.output) ?? 0;
    cached += (num(tokens.cache?.read) ?? 0) + (num(tokens.cache?.write) ?? 0);
    cost += num(part.cost) ?? 0;
  }
  if (steps === 0) return undefined;
  return compactUsage({
    inputTokens: input,
    outputTokens: output,
    cachedInputTokens: cached || undefined,
    // Free models report zero, and a zero is an answer: it says the run cost nothing.
    costUsd: cost,
    turns: steps,
  });
}

function parsePlainLine(line: string, stream: "stdout" | "stderr"): ParsedEvent[] {
  if (stream === "stderr" && line.trim() !== "") {
    return [{ type: "error", text: line }];
  }
  return [{ type: "text", text: line + "\n" }];
}

/**
 * The prompt as it goes to a CLI that has no system slot of its own: the instructions on top, the
 * task underneath. On a resumed turn there are no instructions left to send — the session already
 * read them — and the headers are dropped with them, because a "## Tarea" with an empty preamble
 * above it is one more thing for the model to read and nothing for it to learn.
 */
function withSystem(input: { systemPrompt: string; prompt: string }): string {
  if (!input.systemPrompt.trim()) return input.prompt;
  return `## Instrucciones del sistema\n${input.systemPrompt}\n\n## Tarea\n${input.prompt}`;
}

export const PROVIDERS: Record<ProviderId, ProviderSpec> = {
  claude: {
    id: "claude",
    label: "Claude Code",
    defaultModels: ["sonnet", "opus", "haiku", "claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5-20251001"],
    models: toModels(["sonnet", "opus", "haiku", "claude-sonnet-5", "claude-opus-5", "claude-haiku-4-5-20251001"]),
    supportsSessions: true,
    promptVia: "stdin",
    buildCommand: (input) => {
      const args = ["-p", "--output-format", "stream-json", "--verbose"];
      if (input.agent.model) args.push("--model", input.agent.model);
      if (input.sessionId) args.push("--resume", input.sessionId);
      if (input.systemPrompt) args.push("--append-system-prompt", input.systemPrompt);
      if (input.mcpConfigPath) args.push("--mcp-config", input.mcpConfigPath);
      
      if (input.agent.autoApprove) {
        args.push("--dangerously-skip-permissions");
      } else {
        args.push("--permission-mode", "acceptEdits");
      }
      
      if (input.agent.role === "planner") {
        // Planners do not implement, but they do keep the plans (.ainess/, the folder the app
        // writes the board and the team into) and need git to check what the implementers left
        // behind and to commit/push: nothing else from the shell.
        args.push("--allowedTools", "Read", "Grep", "Glob", "LS", "WebSearch", "WebFetch", "Bash(git:*)", "Edit(.ainess/**)", "Write(.ainess/**)", "MultiEdit(.ainess/**)");
      }

      return {
        program: input.binaryPath,
        args,
        cwd: input.cwd,
        stdinText: input.prompt,
        env: { NO_COLOR: "1" }
      };
    },
    parseLine: parseClaudeLine
  },
  antigravity: {
    id: "antigravity",
    label: "Antigravity",
    defaultModels: ["gemini-3.1-pro-high", "gemini-3.8-flash-high", "claude-sonnet-4-6", "claude-opus-4-6-thinking"],
    models: toModels(["gemini-3.1-pro-high", "gemini-3.8-flash-high", "claude-sonnet-4-6", "claude-opus-4-6-thinking"]),
    supportsSessions: true,
    promptVia: "arg",
    buildCommand: (input) => {
      const prompt = withSystem(input);
      const args = ["-p", prompt, "--output-format", "stream-json", "--print-timeout", "30m"];
      // Without --add-dir agy treats an unregistered cwd as "outside of project" and
      // works in its own scratch folder instead of the workspace.
      if (input.cwd) args.push("--add-dir", input.cwd);
      if (input.agent.model) args.push("--model", input.agent.model);
      if (input.sessionId) args.push("--conversation", input.sessionId);
      
      if (input.agent.autoApprove) {
        args.push("--dangerously-skip-permissions");
      } else {
        args.push("--mode", "accept-edits");
      }

      return {
        program: input.binaryPath,
        args,
        cwd: input.cwd,
        env: { NO_COLOR: "1" }
      };
    },
    parseLine: parseAntigravityLine
  },
  copilot: {
    id: "copilot",
    label: "GitHub Copilot",
    defaultModels: [
      "auto", "claude-sonnet-5", "claude-fable-5.1", "claude-fable-5", "claude-opus-5", "claude-opus-4.8",
      "claude-opus-4.8-fast", "claude-opus-4.7", "claude-sonnet-4.6", "claude-haiku-4.5", "gpt-5.6-sol",
      "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex", "gpt-5-mini",
      "mai-code-1.1-flash", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash",
      "grok-4.5", "kimi-k3"
    ],
    models: toModels([
      "auto", "claude-sonnet-5", "claude-fable-5.1", "claude-fable-5", "claude-opus-5", "claude-opus-4.8",
      "claude-opus-4.8-fast", "claude-opus-4.7", "claude-sonnet-4.6", "claude-haiku-4.5", "gpt-5.6-sol",
      "gpt-5.6-terra", "gpt-5.6-luna", "gpt-5.5", "gpt-5.4", "gpt-5.4-mini", "gpt-5.3-codex", "gpt-5-mini",
      "mai-code-1.1-flash", "gemini-3.8-flash", "gemini-3.7-flash", "gemini-3.6-flash", "gemini-3.5-flash",
      "grok-4.5", "kimi-k3"
    ]),
    supportsSessions: true,
    promptVia: "arg",
    noteKey: "provider.copilotNote",
    buildCommand: (input) => {
      const prompt = withSystem(input);
      // -p without --allow-all-tools makes every tool call fail, so it is always on;
      // --yolo additionally lifts the path/URL checks.
      const args = ["-p", prompt, "--output-format", "json", "-s", "--no-ask-user", "--no-color", "--no-auto-update", "--allow-all-tools"];
      if (input.agent.autoApprove) args.push("--yolo");
      if (input.agent.model) args.push("--model", input.agent.model);
      if (input.sessionId) args.push("--resume", input.sessionId);
      if (input.cwd) args.push("--add-dir", input.cwd);
      // The same file Claude Code gets: `--additional-mcp-config` takes "a JSON string or a file
      // path (prefix with @)" and adds them on top of what ~/.copilot/mcp-config.json already has.
      if (input.mcpConfigPath) args.push("--additional-mcp-config", `@${input.mcpConfigPath}`);
      return { program: input.binaryPath, args, cwd: input.cwd, env: { NO_COLOR: "1" } };
    },
    parseLine: parseCopilotLine,
    finalOutput: copilotFinalOutput
  },
  gemini: {
    id: "gemini",
    label: "Gemini CLI",
    defaultModels: [],
    models: [],
    supportsSessions: false,
    promptVia: "arg",
    buildCommand: (input) => {
      const prompt = withSystem(input);
      const args = ["-p", prompt];
      if (input.agent.autoApprove) args.push("--yolo");
      if (input.agent.model) args.push("-m", input.agent.model);
      return { program: input.binaryPath, args, cwd: input.cwd, env: { NO_COLOR: "1" } };
    },
    parseLine: parsePlainLine
  },
  codex: {
    id: "codex",
    label: "Codex CLI",
    defaultModels: [],
    models: [],
    supportsSessions: false,
    promptVia: "arg",
    buildCommand: (input) => {
      const prompt = withSystem(input);
      const args = ["exec", prompt];
      if (input.agent.autoApprove) args.push("--full-auto");
      if (input.agent.model) args.push("-m", input.agent.model);
      return { program: input.binaryPath, args, cwd: input.cwd, env: { NO_COLOR: "1" } };
    },
    parseLine: parsePlainLine
  },
  custom: {
    id: "custom",
    label: "Custom Command",
    defaultModels: [],
    models: [],
    supportsSessions: false,
    promptVia: "arg",
    buildCommand: (input) => {
      const cmd = input.agent.customCommand;
      if (!cmd) throw new Error("Missing custom command config");
      const prompt = withSystem(input);
      
      let args = [...cmd.args];
      let hasPrompt = false;
      args = args.map(a => {
        if (a.includes("{prompt}")) {
          hasPrompt = true;
          return a.replace(/{prompt}/g, prompt);
        }
        return a;
      });

      return {
        program: cmd.program,
        args,
        cwd: input.cwd,
        stdinText: !hasPrompt ? prompt : undefined,
        env: { NO_COLOR: "1" }
      };
    },
    parseLine: parsePlainLine
  },
  ollama: {
    id: "ollama",
    label: "Ollama",
    defaultModels: [],
    models: [],
    supportsSessions: false,
    promptVia: "stdin",
    buildCommand: (input) => {
      const model = input.agent.model;
      if (!model) throw new Error("Ollama requires a model to be selected");
      const prompt = withSystem(input);
      return {
        program: input.binaryPath,
        args: ["run", model],
        cwd: input.cwd,
        stdinText: prompt,
        env: { NO_COLOR: "1" }
      };
    },
    parseLine: parsePlainLine
  },
  aider: {
    id: "aider",
    label: "Aider",
    defaultModels: [],
    models: [],
    supportsSessions: false,
    promptVia: "arg",
    buildCommand: (input) => {
      const prompt = withSystem(input);
      const args = ["--message", prompt, "--yes-always"];
      if (input.agent.model) args.push("--model", input.agent.model);
      return { program: input.binaryPath, args, cwd: input.cwd, env: { NO_COLOR: "1" } };
    },
    parseLine: parsePlainLine
  },
  opencode: {
    id: "opencode",
    label: "opencode",
    // Which models exist depends on what the machine has connected, so the list is asked for
    // (`opencode models`, see lib/quota.ts) instead of being written down here.
    defaultModels: [],
    models: [],
    supportsSessions: true,
    // The prompt goes in through stdin and never as an argument: npm installs opencode as a `.cmd`
    // shim on Windows, and Windows refuses to start a batch file whose arguments carry newlines
    // ("batch file arguments are invalid"), which every system prompt does.
    promptVia: "stdin",
    noteKey: "provider.opencodeNote",
    buildCommand: (input) => {
      const prompt = withSystem(input);
      const args = ["run", "--format", "json"];
      if (input.cwd) args.push("--dir", input.cwd);
      if (input.agent.model) args.push("--model", input.agent.model);
      if (input.sessionId) args.push("--session", input.sessionId);
      // Nobody can answer a permission prompt in a headless run: without this the tools are denied.
      if (input.agent.autoApprove) args.push("--auto");
      return { program: input.binaryPath, args, cwd: input.cwd, stdinText: prompt, env: { NO_COLOR: "1" } };
    },
    parseLine: parseOpencodeLine,
    finalOutput: opencodeFinalOutput,
    finalUsage: opencodeUsage
  }
};

/**
 * The providers worth offering: the ones whose CLI was found on this machine, plus `custom`, whose
 * command the user writes, plus whichever one the agent already has.
 *
 * Offering every provider meant a team could be built out of CLIs that are not installed, and the
 * agent only said so when its first run died. Keeping the current one matters when editing: an
 * agent that came in a formation from another machine, or whose CLI is momentarily missing, must
 * not have its provider quietly swapped for another just by opening its dialog.
 */
export function availableProviders(binaries: Binaries, current?: ProviderId): ProviderId[] {
  return (Object.keys(PROVIDERS) as ProviderId[]).filter(
    id => id === "custom" || id === current || !!binaries[id]?.path,
  );
}

export function finalOutputFromLines(lines: string[]): string {
  // rawLines are stored without their line breaks, so put them back.
  return lines.join("\n");
}

/**
 * What a new agent says about itself: its role and the CLI behind it, in the app's language.
 *
 * The field it fills is the one the planner reads to decide who gets a task, and it was left
 * empty by everything that creates an agent — so a team came out with three agents that told
 * their planner nothing about themselves.
 */
export function defaultAgentDescription(role: AgentRole, provider: ProviderId): string {
  return translateNow("agent.defaultDescription", {
    role: translateNow(roleLabelKey[role]),
    cli: PROVIDERS[provider]?.label ?? provider,
  });
}

/** The eight characters of a task id the planner sees and quotes back in a `delegate` block. */
export function shortTaskId(id: string): string {
  return id.replace(/-/g, "").slice(0, 8);
}

/** Which cards are worth showing: what is still open, oldest first, and never the whole board. */
const BOARD_STATUSES: TaskStatus[] = ["backlog", "working", "needs-you", "in-review"];
const BOARD_LIMIT = 30;

export const TASK_STATUS_KEY: Record<TaskStatus, string> = {
  backlog: "task.status.backlog",
  working: "task.status.working",
  "needs-you": "task.status.needsYou",
  "in-review": "task.status.inReview",
  ready: "task.status.ready",
  done: "task.status.done",
};

/**
 * The board as a planner reads it: one line per open card, with the id it needs to move it.
 *
 * Without this the board was write-only — the app filled it, no agent ever saw it — so "look at
 * the tasks and get to work" was answered with "there are no tasks" and the request itself was
 * delegated, which opened one more card saying the same thing.
 */
export function boardSection(tasks: Task[], agentName: (id: string) => string | undefined): string {
  const open = tasks
    .filter(t => !t.archived && BOARD_STATUSES.includes(t.status))
    .sort((a, b) => a.createdAt - b.createdAt)
    .slice(0, BOARD_LIMIT);

  const lines = [translateNow("prompt.board.header")];
  if (open.length === 0) {
    lines.push(translateNow("prompt.board.empty"));
    return lines.join("\n");
  }
  lines.push(translateNow("prompt.board.intro"));
  for (const task of open) {
    const who = task.agentId ? agentName(task.agentId) : undefined;
    lines.push(`- [${shortTaskId(task.id)}] ${translateNow(TASK_STATUS_KEY[task.status])}: ${task.title}${who ? ` (${who})` : ""}`);
  }
  return lines.join("\n");
}

/**
 * Who else is working on this same task right now, and what they were told to do.
 *
 * A planner splitting one task between two implementers used to start each of them blind: neither
 * knew the other existed, both reached for the same files, and the planner got back two answers
 * that contradicted each other. The app knew all along — it is what the agent list on screen is
 * drawn from — and never told the one place it mattered.
 */
export function teammatesSection(mates: { name: string; task: string }[]): string {
  if (mates.length === 0) return "";
  const lines = [translateNow("prompt.teammates.header")];
  for (const m of mates) {
    const singleLineTask = m.task.replace(/\r?\n/g, " ");
    lines.push(`- ${m.name}: ${truncate(singleLineTask, 120)}`);
  }
  lines.push(translateNow("prompt.teammates.rules"));
  return lines.join("\n");
}

/**
 * The instructions an agent is started with, in the language the app is running in.
 *
 * These used to be Spanish literals, so an English window got a team that answered in Spanish:
 * the interface was translated and the thing that decides how the agent writes was not.
 */
/**
 * How a planner hands work out. This goes on *every* turn, unlike the rest of the preamble.
 *
 * It is not description, it is the only way the agent can act: without the block it cannot reach
 * its own team. A CLI compacts its own context as a session grows, and once this had scrolled out
 * of that summary the planner went hunting for an `ainess` command and an MCP tool to delegate
 * with, reasoning about the app it is running inside as if it belonged to somebody else.
 */
function delegateSection(autoModel: boolean): string {
  const t = translateNow;
  const schema = t(autoModel ? "prompt.planner.delegateSchemaModel" : "prompt.planner.delegateSchema");
  const extra = autoModel ? t("prompt.planner.autoModel") : "";
  return [
    t("prompt.planner.delegateIntro"),
    "```delegate",
    schema,
    "```",
    t("prompt.planner.delegateRules", { extra }),
  ].join("\n");
}

/** How any agent asks the user for a decision. Every turn, for the same reason. */
function askSection(): string {
  const t = translateNow;
  return [
    t("prompt.ask.header"),
    t("prompt.ask.intro"),
    "```ask",
    t("prompt.ask.schema"),
    "```",
    t("prompt.ask.rules"),
  ].join("\n");
}

function noteSection(): string {
  const t = translateNow;
  return [
    t("prompt.note.header"),
    t("prompt.note.intro"),
    "```note",
    t("prompt.note.example"),
    "```",
    t("prompt.note.rules"),
  ].join("\n");
}

function resultSection(): string {
  const t = translateNow;
  return [
    t("prompt.result.header"),
    t("prompt.result.intro"),
    "```result",
    t("prompt.result.schema"),
    "```",
    t("prompt.result.rules"),
  ].join("\n");
}

function taskSection(card?: { id: string; title: string; status: TaskStatus }): string {
  const t = translateNow;
  const lines = [
    t("prompt.task.header"),
    t("prompt.task.intro"),
    "```task",
    t("prompt.task.schemaUpdate"),
    "```",
    "```task",
    t("prompt.task.schemaCreate"),
    "```",
  ];
  if (card) {
    lines.push(t("prompt.task.card", {
      id: shortTaskId(card.id),
      status: t(TASK_STATUS_KEY[card.status]),
      title: card.title,
    }));
  }
  lines.push(t("prompt.task.rules"));
  return lines.join("\n");
}

/** The board, for the one agent it is written for: a planner with a team to hand it out to. */
function boardFor(
  agent: AgentConfig,
  children: AgentConfig[],
  extras?: { tasks?: Task[]; agentName?: (id: string) => string | undefined },
): string {
  if (agent.role !== "planner" || children.length === 0 || !extras?.tasks) return "";
  return boardSection(extras.tasks, extras.agentName ?? (() => undefined));
}

/** The first line of a skill with no description of its own, as a stand-in for one. */
function firstLine(text: string): string {
  const line = text.split("\n").map(l => l.replace(/^#+\s*/, "").trim()).find(Boolean) ?? "";
  return line.length > 120 ? `${line.slice(0, 119)}…` : line;
}

export function buildSystemPrompt(agent: AgentConfig, children: AgentConfig[], extras?: { skills: Skill[]; sharedContext: string; profile?: { name: string; about: string; preferences: string }; autoModel?: boolean; tasks?: Task[]; agentName?: (id: string) => string | undefined; others?: AgentConfig[]; fromUser?: boolean; resuming?: boolean; historyFile?: string; chat?: { role: string; others: { name: string; role: string }[] }; teammates?: { name: string; task: string }[]; canNote?: boolean; card?: { id: string; title: string; status: TaskStatus } }): string {
  const t = translateNow;
  let prompt = "";

  if (extras?.chat) {
    if (extras.resuming) {
      if (agent.role !== "custom") prompt += (prompt ? "\n\n" : "") + askSection();
      return prompt;
    }
    prompt += t("prompt.chat.role", { role: extras.chat.role });
    if (extras.chat.others.length > 0) {
      prompt += "\n\n" + t("prompt.chat.others.header");
      for (const other of extras.chat.others) {
        prompt += `\n- ${other.name} (${other.role})`;
      }
      prompt += "\n\n" + t("prompt.chat.others.rules");
    }
  } else {
    // Who this is, before anything else. A team where the same person writes to the planner and to
    // an implementer needs each of them to know which one it is: one delegates, the other does the
    // work, and an implementer that answered by delegating left the app waiting for a team it does
    // not have.
    if (extras?.fromUser) {
      prompt += t("prompt.direct.header", {
        name: agent.name,
        role: t(roleLabelKey[agent.role] ?? "label.role.custom"),
      });
      if (agent.role !== "planner") prompt += " " + t("prompt.direct.doItYourself");
      prompt += "\n\n";
    }

    // A resumed session read all of the below on its first turn and the CLI carries it forward, so
    // sending it again buys nothing: with Claude it was re-billed every turn, and with the providers
    // that take the instructions inside the prompt it left another copy of them in the transcript,
    // for good. What does go every turn is the board, which is the one part that changes.
    //
    // ponytail: the delegate and ask schemas go with it. They are in the transcript; if an agent ever
    // forgets the syntax deep into a long session, restate just those two here.
    if (extras?.resuming) {
      // What changes between turns, and the two blocks the agent acts through. Everything else
      // (its role, the profile, the shared context, the list of skills) was said on the turn
      // that opened the session and is description, not a capability: losing that to a
      // compaction costs nothing. Losing the blocks leaves an agent that cannot reach its own
      // team or ask a question, and starts looking for a command line to do it with.
      const parts: string[] = [];
      const board = boardFor(agent, children, extras);
      if (board) parts.push(board);
      const mates = extras.teammates ? teammatesSection(extras.teammates) : "";
      if (mates) parts.push(mates);
      if (agent.role === "planner" && children.length > 0) parts.push(delegateSection(extras.autoModel === true));
      if (agent.role !== "custom") parts.push(askSection());
      if (extras.canNote) {
        parts.push(noteSection());
        parts.push(resultSection());
        parts.push(taskSection(extras.card));
      }
      for (const part of parts) prompt += (prompt ? "\n\n" : "") + part;
      return prompt;
    }

    if (agent.role === "planner") {
      prompt += t("prompt.planner.intro");
      if (children.length > 0) {
        prompt += " " + t("prompt.planner.children") + "\n";
        for (const child of children) {
          let childModelsInfo = "";
          if (extras?.autoModel) {
            const providerSpec = PROVIDERS[child.provider];
            const models = new Set(providerSpec?.defaultModels || []);
            if (child.model) models.add(child.model);
            const modelsList = Array.from(models).join(", ");
            if (modelsList) {
              childModelsInfo = t("prompt.planner.childModels", { models: modelsList });
            }
          }
          prompt += `- ${child.name} (${child.role}): ${child.description ?? ""}${childModelsInfo}\n`;
        }

        prompt += delegateSection(extras?.autoModel === true);
        // Where the whole team is written down, in the project itself.
        prompt += "\n" + t("prompt.planner.teamFile");

        // What there is to delegate. Right after the rules for delegating, so the planner reads how
        // and what in one go.
        const board = boardFor(agent, children, extras);
        if (board) prompt += "\n\n" + board;
      } else {
        prompt += " " + t("prompt.planner.noChildren");
        // A team can be built with everybody at the root: then a planner has nobody under it and
        // used to answer as if it were alone in the project.
        const others = (extras?.others ?? []).filter(a => a.id !== agent.id);
        if (others.length > 0) {
          prompt += " " + t("prompt.planner.othersExist", { names: others.map(a => a.name).join(", ") });
        }
      }
    } else if (agent.role === "implementer") {
      prompt += t("prompt.implementer");
    } else if (agent.role === "reviewer") {
      prompt += t("prompt.reviewer");
    } else if (agent.role === "custom") {
      // Only use agent.systemPrompt (appended at the end)
    }

    if (extras?.teammates && extras.teammates.length > 0) {
      const mates = teammatesSection(extras.teammates);
      if (mates) prompt += (prompt ? "\n\n" : "") + mates;
    }
  }

  if (extras) {
    if (extras.profile && (extras.profile.name || extras.profile.about || extras.profile.preferences)) {
      const lines = [t("prompt.profile.header")];
      if (extras.profile.name) lines.push(t("prompt.profile.name", { name: extras.profile.name }));
      if (extras.profile.about) lines.push(extras.profile.about);
      if (extras.profile.preferences) lines.push(t("prompt.profile.preferences", { preferences: extras.profile.preferences }));
      prompt += (prompt ? "\n\n" : "") + lines.join("\n");
    }

    if (extras.sharedContext && extras.sharedContext.trim()) {
      prompt += (prompt ? "\n\n" : "") + t("prompt.sharedContext.header") + "\n" + extras.sharedContext;
    }
    // Name, one line of what it is for, and where it lives. Not the instructions themselves: five
    // skills used to be five manuals inside every run, read or not. The agent opens the one the
    // work is about (see `writeSkillFiles`), which is also how it reaches whatever sits beside it.
    const validSkills = extras.skills?.filter(s => s.content.trim()) || [];
    if (validSkills.length > 0) {
      prompt += (prompt ? "\n\n" : "") + t("prompt.skills.header") + "\n" + t("prompt.skills.intro");
      for (const skill of validSkills) {
        const what = skill.description?.trim() || firstLine(skill.content);
        prompt += `\n- **${skill.name}** — ${what} → \`${skillRelativePath(skill)}\``;
      }
    }

    // A session that starts over — /compact, a changed provider, "Nueva conversación" — is a CLI
    // with no memory of any of this. What was said is on disk, so the agent is told where instead
    // of being handed it: it opens the file if the work needs it, which is what it was written for.
    if (extras.historyFile) {
      prompt += (prompt ? "\n\n" : "") + t("prompt.history", { file: extras.historyFile });
    }
  }

  // Any role can hit a decision that is not its to make. Without a way to ask, the only ways out
  // were guessing or ending the run with a paragraph and hoping somebody read it.
  if (agent.role !== "custom") {
    prompt += (prompt ? "\n\n" : "") + askSection();
  }
  
  if (extras?.canNote) {
    prompt += (prompt ? "\n\n" : "") + noteSection();
    prompt += (prompt ? "\n\n" : "") + resultSection();
    prompt += (prompt ? "\n\n" : "") + taskSection(extras.card);
  }

  if (agent.systemPrompt) {
    prompt += (prompt ? "\n\n" : "") + agent.systemPrompt;
  }

  return prompt;
}

/** One question an agent asked, as its `ask` block described it. */
export interface ParsedQuestion {
  question: string;
  options: string[];
  multiple: boolean;
  allowOther: boolean;
}

/**
 * The `ask` blocks of an answer:
 *
 * ```ask
 * {"question":"¿Con cuál seguimos?","options":["Postgres","SQLite"],"multiple":false}
 * ```
 *
 * Same shape as the `delegate` block, and read the same way: the closing fence has to start a
 * line, because the text of a question can carry its own fences. Anything without a question or
 * without at least two options is dropped — a question with one answer is not a question.
 */
export function parseQuestions(text: string): ParsedQuestion[] {
  const out: ParsedQuestion[] = [];
  const regex = /```ask[ \t]*\n([\s\S]*?)\n[ \t]*```[ \t]*(?=\n|$)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const obj = JSON.parse(match[1]);
      const question = typeof obj?.question === "string" ? obj.question.trim() : "";
      const options = Array.isArray(obj?.options)
        ? obj.options.filter((o: unknown) => typeof o === "string" && o.trim()).map((o: string) => o.trim())
        : [];
      if (!question || options.length < 2) continue;
      out.push({
        question,
        options,
        multiple: obj.multiple === true,
        // Letting the user write their own is the default: an agent's options are a guess at what
        // the answer might be, never the whole of it.
        allowOther: obj.allowOther !== false,
      });
    } catch {
      // A malformed block is not worth stopping a run over.
    }
  }
  return out;
}

export function parseDelegations(text: string): Delegation[] {
  const delegations: Delegation[] = [];
  // The closing fence must sit at the start of a line: a task's text often carries its own
  // ``` blocks inside the JSON string, and a lazy match would cut the JSON there.
  const regex = /\`\`\`delegate[ \t]*\n([\s\S]*?)\n[ \t]*\`\`\`[ \t]*(?=\n|$)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const obj = JSON.parse(match[1]);
      let tasks = obj;
      if (obj && Array.isArray(obj.tasks)) {
        tasks = obj.tasks;
      }
      if (Array.isArray(tasks)) {
        for (const t of tasks) {
          if (t && typeof t.agent === "string" && typeof t.task === "string") {
            const model = typeof t.model === "string" && t.model.trim() ? t.model.trim() : undefined;
            // The id of a card the planner read off the board: this delegation is that task
            // moving, not a new one (see `taskForDelegation`).
            const taskId = typeof t.taskId === "string" && t.taskId.trim() ? t.taskId.trim() : undefined;
            delegations.push({
              agent: t.agent,
              task: t.task,
              ...(model ? { model } : {}),
              ...(taskId ? { taskId } : {}),
            });
          }
        }
      }
    } catch {
      // tolerant, ignore failures
    }
  }
  return delegations;
}

/**
 * The `note` blocks of an answer, in the order they were written.
 *
 * Unlike `ask` and `delegate`, a note carries plain text: it is what an agent says on the way past
 * — blocked, slower than expected, something the planner should know now — and it is handed over
 * without waiting for the run to end.
 */
export function parseNotes(text: string): string[] {
  const out: string[] = [];
  const regex = /```note[ \t]*\n([\s\S]*?)\n[ \t]*```[ \t]*(?=\n|$)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    const note = match[1].trim();
    if (note) out.push(note);
  }
  return out;
}

export interface ParsedResult {
  files: string[];
  verified: string[];
  blocked: string[];
}

/**
 * The last `result` block of an answer: what was touched, what was checked, what is blocked.
 *
 * The prose stays the prose; this is the part a planner can act on without reading it twice. Any
 * field may be missing, or arrive as a single string instead of a list, and a broken block is no
 * block at all — like every other parser here, it answers with nothing rather than throwing.
 */
export function parseResult(text: string): ParsedResult | null {
  const regex = /```result[ \t]*\n([\s\S]*?)\n[ \t]*```[ \t]*(?=\n|$)/g;
  let lastMatch = null;
  let match;
  while ((match = regex.exec(text)) !== null) {
    lastMatch = match;
  }
  
  if (!lastMatch) return null;
  
  try {
    const obj = JSON.parse(lastMatch[1]);
    if (!obj || typeof obj !== 'object') return null;
    
    const normalize = (val: unknown): string[] => {
      if (Array.isArray(val)) return val.filter(v => typeof v === 'string').map(v => v.trim()).filter(Boolean);
      if (typeof val === 'string') return val.trim() ? [val.trim()] : [];
      return [];
    };
    
    return {
      files: normalize(obj.files),
      verified: normalize(obj.verified),
      blocked: normalize(obj.blocked)
    };
  } catch {
    return null;
  }
}

/** One entry of a ```task block. Same bargain as the stream lines: declared, and still checked. */
interface TaskOpLine {
  new?: unknown;
  detail?: unknown;
  priority?: unknown;
  status?: unknown;
}

export type ParsedTaskOp =
  | { kind: "update"; status?: "working" | "needs-you" | "in-review" | "ready"; detail?: string }
  | { kind: "create"; title: string; detail?: string; priority?: "low" | "normal" | "high" };

const VALID_TASK_UPDATE_STATUSES = new Set(["working", "needs-you", "in-review", "ready"]);

export function parseTaskOps(text: string): ParsedTaskOp[] {
  const ops: ParsedTaskOp[] = [];
  const regex = /```task[ \t]*\n([\s\S]*?)\n[ \t]*```[ \t]*(?=\n|$)/g;
  let match;
  while ((match = regex.exec(text)) !== null) {
    try {
      const obj = JSON.parse(match[1]);
      let items: TaskOpLine[] = [];
      if (Array.isArray(obj)) {
        items = obj;
      } else if (obj && typeof obj === "object") {
        if (Array.isArray(obj.tasks)) {
          items = obj.tasks;
        } else {
          items = [obj];
        }
      }

      for (const item of items) {
        if (!item || typeof item !== "object") continue;

        if (typeof item.new === "string" && item.new.trim()) {
          const title = item.new.trim();
          const detail = typeof item.detail === "string" && item.detail.trim() ? item.detail.trim() : undefined;
          const priority = item.priority === "low" || item.priority === "normal" || item.priority === "high"
            ? item.priority
            : undefined;
          ops.push({
            kind: "create",
            title,
            ...(detail ? { detail } : {}),
            ...(priority ? { priority } : {}),
          });
        } else {
          const validStatus = typeof item.status === "string" && VALID_TASK_UPDATE_STATUSES.has(item.status)
            ? (item.status as "working" | "needs-you" | "in-review" | "ready")
            : undefined;
          const detail = typeof item.detail === "string" && item.detail.trim() ? item.detail.trim() : undefined;
          if (validStatus || detail) {
            ops.push({
              kind: "update",
              ...(validStatus ? { status: validStatus } : {}),
              ...(detail ? { detail } : {}),
            });
          }
        }
      }
    } catch {
      // tolerant, ignore failures
    }
  }
  return ops;
}

