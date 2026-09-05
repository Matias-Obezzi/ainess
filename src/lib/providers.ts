import { AgentConfig, ProviderId, SpawnOptions, ParsedEvent, Delegation } from "@/types";

export interface BuildInput {
  agent: AgentConfig;
  prompt: string;
  systemPrompt: string;
  sessionId?: string;
  cwd?: string;
  binaryPath: string;
}

export interface ProviderSpec {
  id: ProviderId;
  label: string;
  defaultModels: string[];
  supportsSessions: boolean;
  promptVia: "stdin" | "arg";
  note?: string;
  buildCommand(input: BuildInput): Omit<SpawnOptions, "runId">;
  parseLine(line: string, stream: "stdout" | "stderr"): ParsedEvent[];
}

function parseJsonTolerant(line: string): any {
  try {
    return JSON.parse(line);
  } catch {
    return null;
  }
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
        events.push({ type: "tool", name: item.name, detail });
      }
    }
    return events;
  }
  if (obj.type === "result") {
    return [{ type: "result", text: obj.result || "", sessionId: obj.session_id }];
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
    const { step_type, text_delta, tool_name, tool_call } = obj.step_update;
    if (step_type === "agent_response" || step_type === "user_input") {
      if (text_delta && step_type === "agent_response") {
        return [{ type: "text", text: text_delta }];
      }
    } else {
      const detail = tool_name || (tool_call && tool_call.name);
      return [{ type: "tool", name: step_type, detail }];
    }
  }
  if (obj.event === "result" && obj.result) {
    const events: ParsedEvent[] = [];
    if (obj.result.status !== "SUCCESS" && obj.result.error) {
      events.push({ type: "error", text: obj.result.error });
    }
    events.push({ type: "result", text: obj.result.response || "", sessionId: obj.result.conversation_id });
    return events;
  }
  return [];
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
    defaultModels: ["sonnet", "opus", "haiku"],
    supportsSessions: true,
    promptVia: "stdin",
    buildCommand: (input) => {
      const args = ["-p", "--output-format", "stream-json", "--verbose"];
      if (input.agent.model) args.push("--model", input.agent.model);
      if (input.sessionId) args.push("--resume", input.sessionId);
      if (input.systemPrompt) args.push("--append-system-prompt", input.systemPrompt);
      
      if (input.agent.autoApprove) {
        args.push("--dangerously-skip-permissions");
      } else {
        args.push("--permission-mode", "acceptEdits");
      }
      
      if (input.agent.role === "planner") {
        args.push("--allowedTools", "Read", "Grep", "Glob", "LS", "WebSearch", "WebFetch");
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
    supportsSessions: true,
    promptVia: "arg",
    buildCommand: (input) => {
      const prompt = `## Instrucciones del sistema\n${input.systemPrompt}\n\n## Tarea\n${input.prompt}`;
      const args = ["-p", prompt, "--output-format", "stream-json", "--print-timeout", "30m"];
      
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
    defaultModels: [],
    supportsSessions: false,
    promptVia: "arg",
    buildCommand: (input) => {
      const prompt = `## Instrucciones del sistema\n${input.systemPrompt}\n\n## Tarea\n${input.prompt}`;
      const args = ["-p", prompt];
      if (input.agent.autoApprove) args.push("--allow-all-tools");
      if (input.agent.model) args.push("--model", input.agent.model);
      return { program: input.binaryPath, args, cwd: input.cwd, env: { NO_COLOR: "1" } };
    },
    parseLine: parsePlainLine
  },
  gemini: {
    id: "gemini",
    label: "Gemini CLI",
    defaultModels: [],
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
  }
};

export function finalOutputFromLines(lines: string[]): string {
  return lines.join("");
}

export function buildSystemPrompt(agent: AgentConfig, children: AgentConfig[]): string {
  let prompt = "";
  
  if (agent.role === "planner") {
    prompt = "Sos el PLANIFICADOR de un equipo de agentes de IA. No implementás vos: analizás, dividís el trabajo y delegás.";
    if (children.length > 0) {
      prompt += " Agentes disponibles bajo tu mando:\n";
      for (const child of children) {
        prompt += `- ${child.name} (${child.role}): ${child.description ?? ""}\n`;
      }
      prompt += `Para delegar incluí en tu respuesta uno o más bloques exactamente así:
\`\`\`delegate
{"tasks":[{"agent":"nombre o id del agente","task":"instrucción detallada y autocontenida"}]}
\`\`\`
Cada task debe ser autocontenida (el agente no ve esta conversación). Cuando recibas los resultados, verificalos; si falta algo delegá de nuevo. Si no queda nada por delegar respondé sin bloques delegate con un resumen final para el usuario.`;
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

  if (agent.systemPrompt) {
    prompt += (prompt ? "\n\n" : "") + agent.systemPrompt;
  }
  
  return prompt;
}

export function parseDelegations(text: string): Delegation[] {
  const delegations: Delegation[] = [];
  const regex = /\`\`\`delegate\s*\n([\s\S]*?)\`\`\`/g;
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
            delegations.push({ agent: t.agent, task: t.task });
          }
        }
      }
    } catch {
      // tolerant, ignore failures
    }
  }
  return delegations;
}
