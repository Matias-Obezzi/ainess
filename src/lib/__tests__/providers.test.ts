import { describe, it, expect } from "vitest";
import { acpProvider, cliProvider, availableProviders, isDefaultProviderName, parseDelegations, finalOutputFromLines, buildSystemPrompt, claudeUsage, antigravityUsage, copilotUsage, type BuildInput } from "@/lib/providers";
import { forgetAcpAdapter, resolveAcpAdapter } from "@/lib/acp/adapter";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { mergeUsage } from "@/lib/orchestrator";
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

/** Claude Code, the one provider that runs over ACP. */
const spec = acpProvider("claude");

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
    const cmd = cliProvider("antigravity").buildCommand({
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
    const p = cliProvider("antigravity");
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
    expect(p.parseLine("not json", "stderr")).toEqual([{ type: "stderr", text: "not json" }]);
    expect(p.parseLine("not json", "stdout")).toEqual([{ type: "raw", text: "not json" }]);
  });
});

describe("claude provider over ACP", () => {
  const session = (over: Partial<AgentConfig> = {}, input: Partial<BuildInput> = {}) =>
    spec.buildAcpSession({
      agent: agent({ provider: "claude", ...over }),
      prompt: "hace esto",
      systemPrompt: "SYS",
      cwd: "C:/ws",
      binaryPath: "claude.exe",
      ...input,
    });
  const optionsOf = (meta: Record<string, unknown> | undefined) =>
    (meta?.claudeCode as { options: Record<string, unknown> }).options;

  it("appends the system prompt instead of replacing the preset", () => {
    // A string here would take the `claude_code` preset's place, and with it Claude Code's own
    // system prompt. `{ append }` is what `--append-system-prompt` was.
    expect(session().meta?.systemPrompt).toEqual({ append: "SYS" });
    expect(session({}, { systemPrompt: "" }).meta?.systemPrompt).toBeUndefined();
  });

  it("restricts a planner to the tools it had on the command line", () => {
    const options = optionsOf(session({ role: "planner", autoApprove: false }).meta);
    expect(options.allowedTools).toEqual([
      "Read", "Grep", "Glob", "LS", "WebSearch", "WebFetch", "Bash(git:*)",
      "Edit(.ainess/**)", "Write(.ainess/**)", "MultiEdit(.ainess/**)",
    ]);
    expect(options.disallowedTools).toBeUndefined();
    expect(options.permissionMode).toBe("acceptEdits");
    expect(options.allowDangerouslySkipPermissions).toBeUndefined();
  });

  it("keeps subagents away from everyone else", () => {
    const options = optionsOf(session({ role: "implementer" }).meta);
    expect(options.disallowedTools).toEqual(["Agent", "Workflow", "Task"]);
    expect(options.allowedTools).toBeUndefined();
  });

  it("turns autoApprove into the bypass mode, said twice as the SDK asks", () => {
    const options = optionsOf(session({ autoApprove: true }).meta);
    expect(options.permissionMode).toBe("bypassPermissions");
    expect(options.allowDangerouslySkipPermissions).toBe(true);
  });

  it("passes the model when the agent has one", () => {
    expect(optionsOf(session({ model: "claude-opus-5" }).meta).model).toBe("claude-opus-5");
    expect(optionsOf(session().meta).model).toBeUndefined();
  });

  it("starts the adapter with stdin open, and with the configured CLI in the environment", async () => {
    setTransport({ ...nullTransport, whichProgram: async (name: string) => `C:/bin/${name}.cmd` } as never);
    forgetAcpAdapter();
    const cmd = await spec.buildAcpCommand({
      agent: agent({ provider: "claude" }),
      prompt: "hola",
      systemPrompt: "SYS",
      cwd: "C:/ws",
      binaryPath: "C:/mine/claude.exe",
    });
    expect(cmd.keepStdinOpen).toBe(true);
    expect(cmd.cwd).toBe("C:/ws");
    expect(cmd.env?.CLAUDE_CODE_EXECUTABLE).toBe("C:/mine/claude.exe");
  });

  it("says nothing about a CLI that was never configured", async () => {
    setTransport({ ...nullTransport, whichProgram: async () => null } as never);
    forgetAcpAdapter();
    const cmd = await spec.buildAcpCommand({
      agent: agent({ provider: "claude" }),
      prompt: "hola",
      systemPrompt: "",
      cwd: "C:/ws",
      binaryPath: "",
    });
    expect(cmd.env?.CLAUDE_CODE_EXECUTABLE).toBeUndefined();
  });
});

describe("the ACP adapter, as it is found", () => {
  it("prefers an install already on the machine", async () => {
    const asked: string[] = [];
    setTransport({
      ...nullTransport,
      whichProgram: async (name: string) => { asked.push(name); return name === "claude-agent-acp" ? "C:/bin/claude-agent-acp.cmd" : null; },
    } as never);
    forgetAcpAdapter();
    expect(await resolveAcpAdapter()).toEqual({ program: "C:/bin/claude-agent-acp.cmd", args: [], via: "installed" });
    expect(asked).toEqual(["claude-agent-acp"]);
  });

  it("falls back to npx, by full path, and answers its prompt for it", async () => {
    setTransport({
      ...nullTransport,
      whichProgram: async (name: string) => (name === "npx" ? "C:/nodejs/npx.cmd" : null),
    } as never);
    forgetAcpAdapter();
    expect(await resolveAcpAdapter()).toEqual({
      program: "C:/nodejs/npx.cmd",
      args: ["-y", "@agentclientprotocol/claude-agent-acp"],
      via: "npx",
    });
  });

  it("tries the bare name when there is no npx to be found, rather than giving up here", async () => {
    setTransport({ ...nullTransport, whichProgram: async () => null } as never);
    forgetAcpAdapter();
    expect((await resolveAcpAdapter()).program).toBe("npx");
  });

  it("only looks once", async () => {
    let calls = 0;
    setTransport({ ...nullTransport, whichProgram: async () => { calls++; return "C:/bin/claude-agent-acp"; } } as never);
    forgetAcpAdapter();
    await resolveAcpAdapter();
    await resolveAcpAdapter();
    expect(calls).toBe(1);
  });
});


// "root agent idle; waiting for 1 background task(s)" is Claude Code saying, on stderr, that it is
// waiting on a subtask. It was filed as an error, every error is toasted, and so a red box that said
// "idle" popped up over a planner that was doing exactly what it should.
describe("what a CLI writes to stderr", () => {
  const chatter = "root agent idle; waiting for 1 background task(s) (bounded by --print-timeout)";

  it.each(["antigravity", "copilot", "opencode", "custom"] as const)("is stderr for %s, not an error", provider => {
    expect(cliProvider(provider).parseLine(chatter, "stderr")).toEqual([{ type: "stderr", text: chatter }]);
  });

  it("still yields nothing for a blank stderr line where that was the rule", () => {
    expect(cliProvider("copilot").parseLine("   ", "stderr")).toEqual([]);
  });

  // An error the CLI names in its structured stream is a different thing and keeps its kind.
  it("keeps a structured error as an error", () => {
    const line = JSON.stringify({ event: "result", result: { status: "FAILED", error: "quota exhausted" } });
    expect(cliProvider("antigravity").parseLine(line, "stdout")).toContainEqual({ type: "error", text: "quota exhausted" });
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
    const { args } = cliProvider("copilot").buildCommand({ agent: agent({ provider: "copilot" }), ...withMcp });
    const i = args.indexOf("--additional-mcp-config");
    expect(i).toBeGreaterThan(-1);
    expect(args[i + 1]).toBe("@C:/cfg/mcp/a1.json");
  });

  it("says nothing about MCP when there is none", () => {
    const { args } = cliProvider("copilot").buildCommand({ agent: agent({ provider: "copilot" }), ...withMcp, mcpConfigPath: undefined });
    expect(args).not.toContain("--additional-mcp-config");
  });

  // Claude Code reads no file any more: over ACP the servers are part of `session/new`, in the
  // spelling the protocol asks for (a list, headers and environment as name/value pairs).
  it("declares them to Claude Code in the session instead of in a file", () => {
    const { mcpServers } = spec.buildAcpSession({
      agent: agent({ provider: "claude" }),
      ...withMcp,
      mcpServers: [
        { id: "m1", name: "trello", transport: "http", url: "https://mcp.trello.com", headers: { Authorization: "Bearer ${TRELLO}" }, enabledFor: "all" },
        { id: "m2", name: "files", transport: "stdio", command: "npx", args: ["-y", "server"], env: { ROOT: "C:/ws" }, enabledFor: "all" },
      ],
    });
    expect(mcpServers).toEqual([
      { type: "http", name: "trello", url: "https://mcp.trello.com", headers: [{ name: "Authorization", value: "Bearer ${TRELLO}" }] },
      { name: "files", command: "npx", args: ["-y", "server"], env: [{ name: "ROOT", value: "C:/ws" }] },
    ]);
  });

  it("has an empty list when the agent has no servers", () => {
    expect(spec.buildAcpSession({ agent: agent({ provider: "claude" }), ...withMcp }).mcpServers).toEqual([]);
  });
});

describe("copilot provider", () => {
  const copilot = cliProvider("copilot");
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
  // No run reads this line any more (claude runs over ACP, which reports its own usage), but the
  // shape it is read in is still the one the app shows.
  it("takes cost, turns, duration and tokens from Claude Code's result line", () => {
    const raw = {
      type: "result",
      subtype: "success",
      is_error: false,
      duration_ms: 41_562,
      num_turns: 7,
      result: "listo",
      session_id: "s1",
      total_cost_usd: 0.3421,
      usage: { input_tokens: 12, output_tokens: 1_204, cache_read_input_tokens: 48_233, cache_creation_input_tokens: 1_640 },
    };
    // The two cache counters are one figure for us.
    expect(claudeUsage(raw)).toEqual({ costUsd: 0.3421, inputTokens: 12, outputTokens: 1_204, cachedInputTokens: 49_873, turns: 7, durationMs: 41_562 });
  });

  it("leaves out whatever Claude Code did not report, without inventing zeros", () => {
    expect(claudeUsage({ type: "result", result: "x" })).toBeUndefined();
    expect(claudeUsage({ total_cost_usd: 0.1, usage: { output_tokens: 5 } })).toEqual({ costUsd: 0.1, outputTokens: 5 });
    // A string is not a figure.
    expect(claudeUsage({ total_cost_usd: "0.1" })).toBeUndefined();
  });

  it("extracts byModel from modelUsage indexed by canonicalModel instead of execution suffix", () => {
    const raw = {
      type: "result",
      total_cost_usd: 0.15231,
      usage: {
        input_tokens: 2,
        output_tokens: 4,
        cache_read_input_tokens: 15320,
        cache_creation_input_tokens: 14454,
      },
      modelUsage: {
        "claude-opus-5[1m]": {
          inputTokens: 2,
          outputTokens: 4,
          cacheReadInputTokens: 15320,
          cacheCreationInputTokens: 14454,
          costUSD: 0.15231,
          contextWindow: 1000000,
          maxOutputTokens: 64000,
          canonicalModel: "claude-opus-5",
          provider: "firstParty",
          costBasis: "list",
        },
      },
    };

    const usage = claudeUsage(raw);
    expect(usage?.byModel).toBeDefined();
    expect(usage?.byModel?.["claude-opus-5"]).toEqual({
      costUsd: 0.15231,
      inputTokens: 2,
      outputTokens: 4,
      cachedInputTokens: 29774,
    });
    expect(usage?.byModel?.["claude-opus-5[1m]"]).toBeUndefined();
  });

  it("falls back to raw key when canonicalModel is not present in modelUsage", () => {
    const raw = {
      modelUsage: {
        "custom-model[test]": {
          inputTokens: 10,
          outputTokens: 20,
          costUSD: 0.05,
        },
      },
    };
    const usage = claudeUsage(raw);
    expect(usage?.byModel?.["custom-model[test]"]).toEqual({
      costUsd: 0.05,
      inputTokens: 10,
      outputTokens: 20,
    });
  });

  it("leaves byModel undefined when modelUsage is absent or empty without breaking other fields", () => {
    const withoutModelUsage = {
      total_cost_usd: 0.1,
      usage: { output_tokens: 5 },
    };
    const parsedWithout = claudeUsage(withoutModelUsage);
    expect(parsedWithout).toEqual({ costUsd: 0.1, outputTokens: 5 });
    expect(parsedWithout?.byModel).toBeUndefined();

    const withEmptyModelUsage = {
      total_cost_usd: 0.1,
      usage: { output_tokens: 5 },
      modelUsage: {},
    };
    const parsedEmpty = claudeUsage(withEmptyModelUsage);
    expect(parsedEmpty).toEqual({ costUsd: 0.1, outputTokens: 5 });
    expect(parsedEmpty?.byModel).toBeUndefined();
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
    expect(cliProvider("antigravity").parseLine(line, "stdout")).toEqual([
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
    expect(cliProvider("copilot").parseLine(line, "stdout")).toEqual([
      { type: "session", sessionId: "s-1" },
      // Copilot's result has no answer text: the event exists only to carry the usage.
      { type: "result", text: "", usage: { durationMs: 92_310, premiumRequests: 3 } },
    ]);
    expect(copilotUsage({ type: "result" })).toBeUndefined();
  });
});

describe("mergeUsage", () => {
  it("keeps the maximum contextTokens between consecutive usages", () => {
    const first = mergeUsage(undefined, { contextTokens: 100_000 });
    expect(first).toEqual({ contextTokens: 100_000 });

    const second = mergeUsage(first, { contextTokens: 50_000 });
    expect(second?.contextTokens).toBe(100_000);
  });

  it("updates contextTokens when a larger one arrives", () => {
    const first = { contextTokens: 50_000 };
    const second = mergeUsage(first, { contextTokens: 120_000 });
    expect(second?.contextTokens).toBe(120_000);
  });

  it("preserves contextTokens when result line usage arrives with accumulated totals", () => {
    const existing = { contextTokens: 100_000 };
    const resultUsage = {
      costUsd: 0.3421,
      inputTokens: 12,
      outputTokens: 1_204,
      cachedInputTokens: 49_873,
      turns: 7,
      durationMs: 41_562,
    };
    const merged = mergeUsage(existing, resultUsage);
    expect(merged).toEqual({
      ...resultUsage,
      contextTokens: 100_000,
    });
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

  // Claude Code is always there: it runs over ACP, whose adapter is fetched when it is needed, so
  // there is no CLI for a detection to miss.
  it("with nothing detected, leaves the ACP provider and the custom command", () => {
    expect(availableProviders({})).toEqual(["claude", "custom"]);
  });
});

describe("isDefaultProviderName", () => {
  it("matches standard provider labels and IDs", () => {
    expect(isDefaultProviderName("Claude Code", "claude")).toBe(true);
    expect(isDefaultProviderName("claude", "claude")).toBe(true);
    expect(isDefaultProviderName("Antigravity", "antigravity")).toBe(true);
    expect(isDefaultProviderName("antigravity", "antigravity")).toBe(true);
    expect(isDefaultProviderName("GitHub Copilot", "copilot")).toBe(true);
    expect(isDefaultProviderName("Copilot", "copilot")).toBe(true);
    expect(isDefaultProviderName("OpenCode", "opencode")).toBe(true);
    expect(isDefaultProviderName("Custom", "custom")).toBe(true);
  });

  it("matches variations with numbers and hex counters", () => {
    expect(isDefaultProviderName("Claude Code 2", "claude")).toBe(true);
    expect(isDefaultProviderName("Claude 3", "claude")).toBe(true);
    expect(isDefaultProviderName("Antigravity 2", "antigravity")).toBe(true);
    expect(isDefaultProviderName("Antigravity 99", "antigravity")).toBe(true);
    expect(isDefaultProviderName("Antigravity a1b2", "antigravity")).toBe(true);
    expect(isDefaultProviderName("Copilot 4", "copilot")).toBe(true);
    expect(isDefaultProviderName("OpenCode 5", "opencode")).toBe(true);
  });

  it("is case-insensitive and trims whitespace", () => {
    expect(isDefaultProviderName("  claude code  ", "claude")).toBe(true);
    expect(isDefaultProviderName("ANTIGRAVITY", "antigravity")).toBe(true);
    expect(isDefaultProviderName("github copilot 2", "copilot")).toBe(true);
  });

  it("treats empty or whitespace-only name as default", () => {
    expect(isDefaultProviderName("", "claude")).toBe(true);
    expect(isDefaultProviderName("   ", "antigravity")).toBe(true);
  });

  it("rejects custom agent names", () => {
    expect(isDefaultProviderName("My Worker", "claude")).toBe(false);
    expect(isDefaultProviderName("Orquestador", "antigravity")).toBe(false);
    expect(isDefaultProviderName("Architect", "copilot")).toBe(false);
    expect(isDefaultProviderName("Claude 3 Opus", "claude")).toBe(false);
  });

  it("rejects names belonging to a different provider", () => {
    expect(isDefaultProviderName("Antigravity", "claude")).toBe(false);
    expect(isDefaultProviderName("Claude Code", "antigravity")).toBe(false);
  });
});
