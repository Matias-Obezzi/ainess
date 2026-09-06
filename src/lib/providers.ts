import { AgentConfig, ProviderId, SpawnOptions, ParsedEvent, Delegation, Skill, ModelInfo, RunUsage } from "@/types";

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
  note?: string;
  buildCommand(input: BuildInput): Omit<SpawnOptions, "runId">;
  parseLine(line: string, stream: "stdout" | "stderr"): ParsedEvent[];
  /** Final answer when the provider's own `result` event doesn't carry it (default: all raw lines). */
  finalOutput?(rawLines: string[]): string;
}

function parseJsonTolerant(line: string): any {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
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
export function claudeUsage(obj: any): RunUsage | undefined {
  const u = obj?.usage ?? {};
  const cacheRead = num(u.cache_read_input_tokens);
  const cacheWrite = num(u.cache_creation_input_tokens);
  const cached = cacheRead === undefined && cacheWrite === undefined ? undefined : (cacheRead ?? 0) + (cacheWrite ?? 0);
  return compactUsage({
    costUsd: num(obj?.total_cost_usd),
    inputTokens: num(u.input_tokens),
    outputTokens: num(u.output_tokens),
    cachedInputTokens: cached,
    turns: num(obj?.num_turns),
    durationMs: num(obj?.duration_ms),
  });
}

/**
 * Antigravity's `result.usage`. The agy build in use does not document the shape and different
 * versions have named the same counters differently, so every spelling we have seen is accepted
 * and whatever is missing simply stays out.
 */
export function antigravityUsage(result: any): RunUsage | undefined {
  const u = result?.usage;
  if (!u || typeof u !== "object") return undefined;
  return compactUsage({
    costUsd: num(u.total_cost_usd ?? u.cost_usd ?? u.cost),
    inputTokens: num(u.input_tokens ?? u.inputTokens ?? u.prompt_tokens ?? u.promptTokens),
    outputTokens: num(u.output_tokens ?? u.outputTokens ?? u.completion_tokens ?? u.completionTokens),
    cachedInputTokens: num(u.cached_input_tokens ?? u.cachedInputTokens ?? u.cache_read_input_tokens ?? u.cached_tokens),
    turns: num(u.turns ?? u.num_turns ?? result?.num_turns),
    durationMs: num(u.duration_ms ?? u.durationMs ?? result?.duration_ms),
    premiumRequests: num(u.premium_requests ?? u.premiumRequests),
  });
}

/** Copilot's `result.usage`: premium requests and the session duration, no tokens and no cost. */
export function copilotUsage(obj: any): RunUsage | undefined {
  const u = obj?.usage;
  if (!u || typeof u !== "object") return undefined;
  return compactUsage({
    inputTokens: num(u.input_tokens ?? u.inputTokens),
    outputTokens: num(u.output_tokens ?? u.outputTokens),
    cachedInputTokens: num(u.cached_input_tokens ?? u.cachedInputTokens),
    durationMs: num(u.sessionDurationMs ?? u.session_duration_ms ?? u.durationMs),
    premiumRequests: num(u.premiumRequests ?? u.premium_requests),
  });
}

function parseClaudeLine(line: string, stream: "stdout" | "stderr"): ParsedEvent[] {
  const obj = parseJsonTolerant(line);
  if (!obj) {
    if (stream === "stderr") return [{ type: "error", text: line }];
    return [{ type: "raw", text: line }];
  }
  
  if (obj.type === "system" && obj.subtype === "init") {
    return [{ type: "session", sessionId: obj.session_id }];
  }
  if (obj.type === "assistant" && obj.message && Array.isArray(obj.message.content)) {
    const events: ParsedEvent[] = [];
    for (const item of obj.message.content) {
      if (item.type === "text") {
        events.push({ type: "text", text: item.text });
      } else if (item.type === "tool_use") {
        const detail = item.input ? JSON.stringify(item.input).substring(0, 200) : undefined;
        events.push({ type: "tool", name: item.name, detail, input: item.input });
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
  const obj = parseJsonTolerant(line);
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
    const name: string = tool_name || tool_info?.name || step_type;
    const params = tool_info?.parameters;
    const detail = params ? JSON.stringify(params).substring(0, 200) : undefined;
    if (state === "ACTIVE") return [{ type: "tool", name, detail, input: params }];
    if (state === "ERROR") return [{ type: "error", text: `Falló la herramienta ${name}` }];
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
  const obj = parseJsonTolerant(line);
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
    const obj = parseJsonTolerant(line);
    if (obj?.type === "assistant.message" && typeof obj.data?.content === "string" && obj.data.content.trim()) {
      parts.push(obj.data.content);
    }
  }
  return parts.join("\n");
}

function parsePlainLine(line: string, stream: "stdout" | "stderr"): ParsedEvent[] {
  if (stream === "stderr" && line.trim() !== "") {
    return [{ type: "error", text: line }];
  }
  return [{ type: "text", text: line + "\n" }];
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
        // Planners do not implement, but they do keep the plans (.claude/) and need git to check
        // what the implementers left behind and to commit/push: nothing else from the shell.
        args.push("--allowedTools", "Read", "Grep", "Glob", "LS", "WebSearch", "WebFetch", "Bash(git:*)", "Edit(.claude/**)", "Write(.claude/**)", "MultiEdit(.claude/**)");
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
      const prompt = `## Instrucciones del sistema\n${input.systemPrompt}\n\n## Tarea\n${input.prompt}`;
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
    note: "En modo no interactivo Copilot exige --allow-all-tools; con auto-aprobación se usa --yolo (también rutas y URLs).",
    buildCommand: (input) => {
      const prompt = `## Instrucciones del sistema\n${input.systemPrompt}\n\n## Tarea\n${input.prompt}`;
      // -p without --allow-all-tools makes every tool call fail, so it is always on;
      // --yolo additionally lifts the path/URL checks.
      const args = ["-p", prompt, "--output-format", "json", "-s", "--no-ask-user", "--no-color", "--no-auto-update", "--allow-all-tools"];
      if (input.agent.autoApprove) args.push("--yolo");
      if (input.agent.model) args.push("--model", input.agent.model);
      if (input.sessionId) args.push("--resume", input.sessionId);
      if (input.cwd) args.push("--add-dir", input.cwd);
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
      const prompt = `## Instrucciones del sistema\n${input.systemPrompt}\n\n## Tarea\n${input.prompt}`;
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
      const prompt = `## Instrucciones del sistema\n${input.systemPrompt}\n\n## Tarea\n${input.prompt}`;
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
      const prompt = `## Instrucciones del sistema\n${input.systemPrompt}\n\n## Tarea\n${input.prompt}`;
      
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
      const prompt = `## Instrucciones del sistema\n${input.systemPrompt}\n\n## Tarea\n${input.prompt}`;
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
      const prompt = `## Instrucciones del sistema\n${input.systemPrompt}\n\n## Tarea\n${input.prompt}`;
      const args = ["--message", prompt, "--yes-always"];
      if (input.agent.model) args.push("--model", input.agent.model);
      return { program: input.binaryPath, args, cwd: input.cwd, env: { NO_COLOR: "1" } };
    },
    parseLine: parsePlainLine
  },
  opencode: {
    id: "opencode",
    label: "OpenCode",
    defaultModels: [],
    models: [],
    supportsSessions: false,
    promptVia: "arg",
    buildCommand: (input) => {
      const prompt = `## Instrucciones del sistema\n${input.systemPrompt}\n\n## Tarea\n${input.prompt}`;
      const args = ["run", prompt];
      if (input.agent.model) args.push("--model", input.agent.model);
      return { program: input.binaryPath, args, cwd: input.cwd, env: { NO_COLOR: "1" } };
    },
    parseLine: parsePlainLine
  }
};

export function finalOutputFromLines(lines: string[]): string {
  // rawLines are stored without their line breaks, so put them back.
  return lines.join("\n");
}

export function buildSystemPrompt(agent: AgentConfig, children: AgentConfig[], extras?: { skills: Skill[]; sharedContext: string; profile?: { name: string; about: string; preferences: string }; autoModel?: boolean }): string {
  let prompt = "";
  
  if (agent.role === "planner") {
    prompt = "Sos el PLANIFICADOR de un equipo de agentes de IA. No implementás vos: analizás, dividís el trabajo y delegás. Sí podés crear y editar archivos dentro de la carpeta .claude/ del proyecto (planes, handoffs, notas) y usar git.";
    if (children.length > 0) {
      prompt += " Agentes disponibles bajo tu mando:\n";
      for (const child of children) {
        let childModelsInfo = "";
        if (extras?.autoModel) {
          const providerSpec = PROVIDERS[child.provider];
          const models = new Set(providerSpec?.defaultModels || []);
          if (child.model) models.add(child.model);
          const modelsList = Array.from(models).join(", ");
          if (modelsList) {
            childModelsInfo = ` (Modelos disponibles: ${modelsList})`;
          }
        }
        prompt += `- ${child.name} (${child.role}): ${child.description ?? ""}${childModelsInfo}\n`;
      }
      
      let delegateSchema = `{"tasks":[{"agent":"nombre o id del agente","task":"instrucción detallada y autocontenida"}]}`;
      let extraInstruction = "";
      
      if (extras?.autoModel) {
        delegateSchema = `{"tasks":[{"agent":"nombre o id del agente","task":"instrucción detallada y autocontenida","model":"modelo elegido (opcional)"}]}`;
        extraInstruction = ` Elegí el modelo más adecuado para cada tarea según su dificultad (los flash/haiku para tareas simples y rápidas, los pro/opus/sonnet para tareas complejas) e indicalo en el campo model de cada task del bloque delegate.`;
      }
      
      prompt += `Para delegar incluí en tu respuesta uno o más bloques exactamente así:
\`\`\`delegate
${delegateSchema}
\`\`\`
Cada task debe ser autocontenida (el agente no ve esta conversación).${extraInstruction} Cuando recibas los resultados, verificalos; si falta algo delegá de nuevo. Si no queda nada por delegar respondé sin bloques delegate con un resumen final para el usuario.`;
    } else {
      prompt += " No tenés agentes bajo tu mando. Respondé directamente a la tarea.";
    }
  } else if (agent.role === "implementer") {
    prompt = "Sos IMPLEMENTADOR. Recibís tareas de tu planificador. Hacé los cambios en el workspace. Al terminar respondé un resumen claro: qué cambiaste (archivos), qué verificaste, qué quedó pendiente o bloqueado.";
  } else if (agent.role === "reviewer") {
    prompt = "Sos REVISOR. Revisás cambios y respondés hallazgos o sugerencias de mejora.";
  } else if (agent.role === "custom") {
    // Only use agent.systemPrompt (appended at the end)
  }

  if (extras) {
    if (extras.profile && (extras.profile.name || extras.profile.about || extras.profile.preferences)) {
      prompt += (prompt ? "\n\n" : "") + "## Sobre el usuario\n";
      if (extras.profile.name) prompt += `Nombre: ${extras.profile.name}\n`;
      if (extras.profile.about) prompt += `${extras.profile.about}\n`;
      if (extras.profile.preferences) prompt += `Preferencias de trabajo: ${extras.profile.preferences}\n`;
    }
    
    if (extras.sharedContext && extras.sharedContext.trim()) {
      prompt += (prompt ? "\n\n" : "") + "## Contexto compartido del equipo\n" + extras.sharedContext;
    }
    const validSkills = extras.skills?.filter(s => s.content.trim()) || [];
    if (validSkills.length > 0) {
      prompt += (prompt ? "\n\n" : "") + "## Skills";
      for (const skill of validSkills) {
        prompt += `\n### ${skill.name}\n${skill.content}`;
      }
    }
  }

  if (agent.systemPrompt) {
    prompt += (prompt ? "\n\n" : "") + agent.systemPrompt;
  }
  
  return prompt;
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
            delegations.push(model ? { agent: t.agent, task: t.task, model } : { agent: t.agent, task: t.task });
          }
        }
      }
    } catch {
      // tolerant, ignore failures
    }
  }
  return delegations;
}
