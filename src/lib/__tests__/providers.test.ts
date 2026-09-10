import { describe, it, expect } from "vitest";
import { PROVIDERS, availableProviders, parseDelegations, finalOutputFromLines, buildSystemPrompt, claudeUsage, antigravityUsage, copilotUsage } from "@/lib/providers";
import { useAppStore } from "@/store";
import { es, loadLanguage } from "@/i18n";
import { en } from "@/i18n/en";
import { de } from "@/i18n/de";
import type { AgentConfig } from "@/types";

/** The prompt is built outside React, so it reads the language off the store. */
async function inLanguage<T>(language: "es" | "en" | "de", body: () => T): Promise<T> {
  await loadLanguage(language);
  const before = useAppStore.getState().config.language;
  useAppStore.setState(state => ({ config: { ...state.config, language } }));
  try {
    return body();
  } finally {
    useAppStore.setState(state => ({ config: { ...state.config, language: before } }));
  }
}

const agent = (over: Partial<AgentConfig> = {}): AgentConfig => ({
  id: "a1",
  name: "Obrero",
  provider: "antigravity",
  role: "implementer",
  parentId: null,
  autoApprove: true,
  ...over,
});

describe("parseDelegations", () => {
  it("reads the {tasks:[...]} form", () => {
    const text = 'Voy a delegar.\n```delegate\n{"tasks":[{"agent":"Obrero","task":"crear hola.txt"}]}\n```\n';
    expect(parseDelegations(text)).toEqual([{ agent: "Obrero", task: "crear hola.txt" }]);
  });

  it("reads a bare array and several blocks", () => {
    const text = '```delegate\n[{"agent":"A","task":"t1"}]\n```\nx\n```delegate\n{"tasks":[{"agent":"B","task":"t2"}]}\n```';
    expect(parseDelegations(text).map(d => d.agent)).toEqual(["A", "B"]);
  });

  it("keeps the model chosen by the planner", () => {
    const text = '```delegate\n{"tasks":[{"agent":"Obrero","task":"t","model":"gemini-3.8-flash-high"}]}\n```';
    expect(parseDelegations(text)[0].model).toBe("gemini-3.8-flash-high");
  });

  it("ignores invalid JSON and malformed tasks without throwing", () => {
    const text = '```delegate\n{not json}\n```\n```delegate\n{"tasks":[{"agent":1},{"task":"sin agente"}]}\n```';
    expect(parseDelegations(text)).toEqual([]);
  });

  it("returns [] when there is no block", () => {
    expect(parseDelegations("Listo, terminé.")).toEqual([]);
  });
});

describe("antigravity provider", () => {
  it("passes --add-dir, --conversation and skip-permissions", () => {
    const cmd = PROVIDERS.antigravity.buildCommand({
      agent: agent({ model: "gemini-3.1-pro-high" }),
      prompt: "hola",
      systemPrompt: "SYS",
      sessionId: "conv-1",
      cwd: "C:/ws",
      binaryPath: "agy.exe",
    });
    expect(cmd.program).toBe("agy.exe");
    expect(cmd.args).toContain("--add-dir");
    expect(cmd.args[cmd.args.indexOf("--add-dir") + 1]).toBe("C:/ws");
    expect(cmd.args[cmd.args.indexOf("--conversation") + 1]).toBe("conv-1");
    expect(cmd.args[cmd.args.indexOf("--model") + 1]).toBe("gemini-3.1-pro-high");
    expect(cmd.args).toContain("--dangerously-skip-permissions");
    // The system prompt is prepended to the prompt argument (agy has no flag for it).
    expect(cmd.args[1]).toContain("SYS");
    expect(cmd.args[1]).toContain("hola");
  });

  it("parses stream-json events", () => {
    const p = PROVIDERS.antigravity;
    expect(p.parseLine('{"event":"init","conversation_id":"c1","init":{}}', "stdout")).toEqual([{ type: "session", sessionId: "c1" }]);
    expect(p.parseLine('{"event":"step_update","step_update":{"step_type":"agent_response","text_delta":"OK","state":"DONE"}}', "stdout"))
      .toEqual([{ type: "text", text: "OK" }]);
    const active = p.parseLine('{"event":"step_update","step_update":{"step_type":"tool","state":"ACTIVE","tool_name":"write_to_file","tool_info":{"name":"write_to_file","parameters":{"TargetFile":"a.txt"}}}}', "stdout");
    expect(active[0]).toMatchObject({ type: "tool", name: "write_to_file" });
    // DONE steps are not logged twice.
    expect(p.parseLine('{"event":"step_update","step_update":{"step_type":"tool","state":"DONE","tool_name":"write_to_file"}}', "stdout")).toEqual([]);
    // ERROR steps are emitted as tool events with failed: true.
    expect(p.parseLine('{"event":"step_update","step_update":{"step_type":"tool","state":"ERROR","tool_name":"write_to_file"}}', "stdout")).toEqual([{ type: "tool", name: "write_to_file", failed: true, error: "" }]);
    const result = p.parseLine('{"event":"result","result":{"conversation_id":"c1","status":"SUCCESS","response":"hecho"}}', "stdout");
    expect(result).toEqual([{ type: "result", text: "hecho", sessionId: "c1" }]);
    expect(p.parseLine("not json", "stderr")).toEqual([{ type: "error", text: "not json" }]);
    expect(p.parseLine("not json", "stdout")).toEqual([{ type: "raw", text: "not json" }]);
  });
});

describe("claude provider", () => {
  it("sends the prompt via stdin and restricts planners to read-only tools", () => {
    const cmd = PROVIDERS.claude.buildCommand({
      agent: agent({ provider: "claude", role: "planner", autoApprove: false }),
      prompt: "planificá",
      systemPrompt: "SYS",
      sessionId: "s1",
      cwd: "C:/ws",
      binaryPath: "claude.exe",
    });
    expect(cmd.stdinText).toBe("planificá");
    expect(cmd.args).toContain("--resume");
    expect(cmd.args).toContain("--allowedTools");
    expect(cmd.args).toContain("--permission-mode");
    expect(cmd.args).not.toContain("--dangerously-skip-permissions");
  });

  it("parses stream-json events", () => {
    const p = PROVIDERS.claude;
    expect(p.parseLine('{"type":"system","subtype":"init","session_id":"s1"}', "stdout")).toEqual([{ type: "session", sessionId: "s1" }]);
    const assistant = p.parseLine('{"type":"assistant","message":{"content":[{"type":"text","text":"hola"},{"type":"tool_use","name":"Edit","input":{"a":1}}]}}', "stdout");
    expect(assistant.map(e => e.type)).toEqual(["text", "tool"]);
    expect(p.parseLine('{"type":"result","subtype":"success","result":"fin","session_id":"s1"}', "stdout")).toEqual([{ type: "result", text: "fin", sessionId: "s1" }]);
  });
});

describe("plain-text providers and system prompt", () => {
  it("joins raw stdout lines (stored without line breaks) as the final output", () => {
    expect(finalOutputFromLines(["a", "```delegate", "{}", "```"])).toBe("a\n```delegate\n{}\n```");
  });

  it("tells planners how to delegate and lists their children", () => {
    const planner = agent({ id: "p", name: "Jefe", role: "planner" });
    const child = agent({ id: "c", name: "Obrero", parentId: "p", description: "hace cosas" });
    const prompt = buildSystemPrompt(planner, [child], { skills: [], sharedContext: "" });
    expect(prompt).toContain("```delegate");
    expect(prompt).toContain("Obrero");
    expect(prompt).toContain("hace cosas");
  });

  // The interface was translated and the instructions the agent runs on were not, so an English
  // window got a team that answered in Spanish.
  it("writes the prompt in the language the app is in", async () => {
    const planner = agent({ id: "p", role: "planner" });
    const child = agent({ id: "c", parentId: "p" });
    const opts = { skills: [], sharedContext: "" };

    expect(await inLanguage("en", () => buildSystemPrompt(planner, [child], opts))).toContain(en["prompt.planner.intro"]);
    expect(await inLanguage("es", () => buildSystemPrompt(planner, [child], opts))).toContain(es["prompt.planner.intro"]);
    expect(await inLanguage("de", () => buildSystemPrompt(agent({ role: "implementer" }), [], opts))).toContain(de["prompt.implementer"]);
  });

  it("keeps both protocol blocks in every language", async () => {
    for (const language of ["es", "en", "de"] as const) {
      const prompt = await inLanguage(language, () =>
        buildSystemPrompt(agent({ id: "p", role: "planner" }), [agent({ id: "c", parentId: "p" })], { skills: [], sharedContext: "" }),
      );
      expect(prompt, language).toContain("```delegate");
      expect(prompt, language).toContain("```ask");
      // The field names are the protocol; only the words around them are translated.
      expect(prompt, language).toContain('"tasks"');
      expect(prompt, language).toContain('"question"');
    }
  });

  it("injects skills, shared context and the agent's own instructions", () => {
    const prompt = buildSystemPrompt(agent({ systemPrompt: "PROPIO" }), [], {
      skills: [{ id: "s", name: "Estilo", content: "Usá tabs", enabledFor: "all" }],
      sharedContext: "CONTEXTO",
    });
    expect(prompt).toContain("Estilo");
    expect(prompt).toContain("Usá tabs");
    expect(prompt).toContain("CONTEXTO");
    expect(prompt.trim().endsWith("PROPIO")).toBe(true);
  });
});

describe("MCP servers reaching an agent", () => {
  const withMcp = { prompt: "hola", systemPrompt: "sos", binaryPath: "copilot.cmd", mcpConfigPath: "C:/cfg/mcp/a1.json" };

  // Verified against `copilot --help` on Windows: "--additional-mcp-config <json>  Additional MCP
  // servers configuration as JSON string or file path (prefix with @)".
  it("hands Copilot the same file Claude Code gets, by path", () => {
    const { args } = PROVIDERS.copilot.buildCommand({ agent: agent({ provider: "copilot" }), ...withMcp });
    const i = args.indexOf("--additional-mcp-config");
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe("@C:/cfg/mcp/a1.json");
  });

  it("says nothing about MCP when there is none", () => {
    const { args } = PROVIDERS.copilot.buildCommand({ agent: agent({ provider: "copilot" }), ...withMcp, mcpConfigPath: undefined });
    expect(args).not.toContain("--additional-mcp-config");
  });

  it("keeps passing it to Claude Code as it did", () => {
    const { args } = PROVIDERS.claude.buildCommand({ agent: agent({ provider: "claude" }), ...withMcp });
    const i = args.indexOf("--mcp-config");
    expect(args[i + 1]).toBe("C:/cfg/mcp/a1.json");
  });
});

describe("copilot provider", () => {
  const copilot = PROVIDERS.copilot;
  const msg = (content: string, toolRequests: unknown[] = []) =>
    JSON.stringify({ type: "assistant.message", data: { messageId: "m", content, toolRequests } });

  it("turns assistant.message into text and tool events", () => {
    const line = msg("", [{ toolCallId: "t1", name: "glob", arguments: { pattern: "*" }, type: "function" }]);
    expect(copilot.parseLine(line, "stdout")).toEqual([
      { type: "tool", name: "glob", detail: '{"pattern":"*"}', input: { pattern: "*" } },
    ]);
    expect(copilot.parseLine(msg("hola"), "stdout")).toEqual([{ type: "text", text: "hola\n" }]);
  });

  it("takes the session id from the result event and ignores deltas", () => {
    const result = JSON.stringify({ type: "result", sessionId: "s-1", exitCode: 0 });
    expect(copilot.parseLine(result, "stdout")).toEqual([{ type: "session", sessionId: "s-1" }]);
    const delta = JSON.stringify({ type: "assistant.message_delta", data: { deltaContent: "h" }, ephemeral: true });
    expect(copilot.parseLine(delta, "stdout")).toEqual([]);
  });

  it("rebuilds the final answer from the assistant messages", () => {
    const lines = [msg("", [{ name: "glob", arguments: {} }]), JSON.stringify({ type: "tool.execution_start" }), msg("Listo:\n- a.txt"), JSON.stringify({ type: "result", sessionId: "s" })];
    expect(copilot.finalOutput!(lines)).toBe("Listo:\n- a.txt");
  });

  it("always allows tools in -p mode and resumes sessions", () => {
    const cmd = copilot.buildCommand({ agent: agent({ provider: "copilot", autoApprove: false }), prompt: "t", systemPrompt: "s", binaryPath: "copilot.exe", cwd: "C:\p", sessionId: "s-1" });
    expect(cmd.args).toContain("--allow-all-tools");
    expect(cmd.args).not.toContain("--yolo");
    expect(cmd.args.slice(cmd.args.indexOf("--resume"), cmd.args.indexOf("--resume") + 2)).toEqual(["--resume", "s-1"]);
    const yolo = copilot.buildCommand({ agent: agent({ provider: "copilot", autoApprove: true }), prompt: "t", systemPrompt: "s", binaryPath: "copilot.exe" });
    expect(yolo.args).toContain("--yolo");
  });
});

describe("parseDelegations with fences inside the task", () => {
  it("does not stop at a ``` that lives inside the JSON string", () => {
    // JSON.stringify keeps the fence on one line: the task's own ``` and newlines are escaped.
    const block = JSON.stringify({ tasks: [{ agent: "Copilot", task: ["Repo: C:\\x. Corré:", "```", "npm test", "```", "y reportá."].join("\n") }] });
    const text = ["Delego.", "", "```delegate", block, "```", "", "Sigo con ```ts", "const a = 1;", "```"].join("\n");
    const parsed = parseDelegations(text);
    expect(parsed).toHaveLength(1);
    expect(parsed[0].task).toContain("npm test");
  });
});

describe("usage reported by each CLI", () => {
  it("takes cost, turns, duration and tokens from Claude Code's result line", () => {
    const line = JSON.stringify({
      type: "result",
      subtype: "success",
      is_error: false,
      duration_ms: 41_562,
      num_turns: 7,
      result: "listo",
      session_id: "s1",
      total_cost_usd: 0.3421,
      usage: { input_tokens: 12, output_tokens: 1_204, cache_read_input_tokens: 48_233, cache_creation_input_tokens: 1_640 },
    });
    const events = PROVIDERS.claude.parseLine(line, "stdout");
    expect(events).toEqual([
      {
        type: "result",
        text: "listo",
        sessionId: "s1",
        // The two cache counters are one figure for us.
        usage: { costUsd: 0.3421, inputTokens: 12, outputTokens: 1_204, cachedInputTokens: 49_873, turns: 7, durationMs: 41_562 },
      },
    ]);
  });

  it("leaves out whatever Claude Code did not report, without inventing zeros", () => {
    expect(claudeUsage({ type: "result", result: "x" })).toBeUndefined();
    expect(claudeUsage({ total_cost_usd: 0.1, usage: { output_tokens: 5 } })).toEqual({ costUsd: 0.1, outputTokens: 5 });
    // A string is not a figure.
    expect(claudeUsage({ total_cost_usd: "0.1" })).toBeUndefined();
  });

  it("reads Antigravity's usage under any of the names its builds have used", () => {
    const line = JSON.stringify({
      event: "result",
      result: {
        conversation_id: "c1",
        status: "SUCCESS",
        response: "hecho",
        usage: { input_tokens: 900, output_tokens: 300, total_cost_usd: 0.02 },
      },
    });
    expect(PROVIDERS.antigravity.parseLine(line, "stdout")).toEqual([
      { type: "result", text: "hecho", sessionId: "c1", usage: { costUsd: 0.02, inputTokens: 900, outputTokens: 300 } },
    ]);
    expect(antigravityUsage({ usage: { promptTokens: 10, completionTokens: 4 } })).toEqual({ inputTokens: 10, outputTokens: 4 });
    // No usage object at all (the builds that report nothing): the run simply has no figures.
    expect(antigravityUsage({ status: "SUCCESS" })).toBeUndefined();
  });

  it("takes Copilot's premium requests and session duration", () => {
    const line = JSON.stringify({
      type: "result",
      sessionId: "s-1",
      exitCode: 0,
      usage: { premiumRequests: 3, sessionDurationMs: 92_310 },
    });
    expect(PROVIDERS.copilot.parseLine(line, "stdout")).toEqual([
      { type: "session", sessionId: "s-1" },
      // Copilot's result has no answer text: the event exists only to carry the usage.
      { type: "result", text: "", usage: { durationMs: 92_310, premiumRequests: 3 } },
    ]);
    expect(copilotUsage({ type: "result" })).toBeUndefined();
  });
});

// Offering every provider meant a team could be built out of CLIs that are not installed, and the
// agent only said so when its first run died.
describe("availableProviders", () => {
  it("offers what was detected, plus the custom command", () => {
    const offered = availableProviders({ claude: { path: "C:/claude.exe" }, opencode: { path: "C:/opencode.cmd" } });
    expect(offered).toContain("claude");
    expect(offered).toContain("opencode");
    expect(offered).toContain("custom");
    expect(offered).not.toContain("codex");
    expect(offered).not.toContain("antigravity");
  });

  it("keeps the one an agent already has, installed or not", () => {
    // An agent that came in a formation from another machine must not have its provider swapped
    // for another just because its dialog was opened here.
    expect(availableProviders({ claude: { path: "C:/claude.exe" } }, "codex")).toContain("codex");
  });

  it("with nothing detected, leaves the custom command", () => {
    expect(availableProviders({})).toEqual(["custom"]);
  });
});
