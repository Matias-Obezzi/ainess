// The opencode provider, against lines its CLI actually printed (`opencode run --format json`,
// version 1.18.29): one JSON object per line, `{type, timestamp, sessionID, part}`. There is no
// closing event with the answer, so the answer is rebuilt from the text parts and what the run
// spent is added up across its steps.
import { describe, it, expect } from "vitest";
import { PROVIDERS, opencodeUsage } from "@/lib/providers";
import { parseOpencodeModels } from "@/lib/quota";
import type { AgentConfig } from "@/types";

const spec = PROVIDERS.opencode;
const parse = (line: string) => spec.parseLine(line, "stdout");

const SESSION = "ses_f86aec358ffe9lLZvG7suOtcl3";
const STEP_START = `{"type":"step_start","timestamp":1788741764224,"sessionID":"${SESSION}","part":{"id":"prt_1","messageID":"msg_1","sessionID":"${SESSION}","type":"step-start"}}`;
const TEXT = `{"type":"text","timestamp":1788741764511,"sessionID":"${SESSION}","part":{"id":"prt_2","messageID":"msg_1","sessionID":"${SESSION}","type":"text","text":"listo","time":{"start":1,"end":2}}}`;
const STEP_FINISH = `{"type":"step_finish","timestamp":1788741764511,"sessionID":"${SESSION}","part":{"id":"prt_3","reason":"stop","messageID":"msg_1","sessionID":"${SESSION}","type":"step-finish","tokens":{"total":9409,"input":7592,"output":25,"reasoning":0,"cache":{"write":0,"read":1792}},"cost":0}}`;

const toolPart = (status: string, extra: Record<string, unknown> = {}) => JSON.stringify({
  type: "tool",
  timestamp: 1,
  sessionID: SESSION,
  part: {
    id: "prt_tool",
    sessionID: SESSION,
    messageID: "msg_1",
    type: "tool",
    callID: "call_1",
    tool: "bash",
    state: { status, input: { command: "ls" }, ...extra },
  },
});

const agent = (over: Partial<AgentConfig> = {}): AgentConfig => ({
  id: "a1", name: "OC", provider: "opencode", role: "implementer", parentId: null, autoApprove: false, ...over,
});

describe("opencode buildCommand", () => {
  it("asks for the JSON stream, in the folder, with the model and the session", () => {
    const cmd = spec.buildCommand({
      agent: agent({ model: "google/gemini-3-flash" }),
      prompt: "Hacé algo",
      systemPrompt: "Sos IMPLEMENTADOR",
      sessionId: SESSION,
      cwd: "C:/dev/app",
      binaryPath: "opencode.cmd",
    });
    expect(cmd.program).toBe("opencode.cmd");
    // The prompt goes in through stdin: npm installs opencode as a `.cmd` on Windows, and Windows
    // refuses to start a batch file whose arguments carry newlines.
    expect(cmd.stdinText).toBe("## Instrucciones del sistema\nSos IMPLEMENTADOR\n\n## Tarea\nHacé algo");
    expect(cmd.args.some(a => a.includes("\n"))).toBe(false);
    expect(cmd.args[0]).toBe("run");
    expect(cmd.args).toEqual(expect.arrayContaining(["--format", "json", "--dir", "C:/dev/app", "--model", "google/gemini-3-flash", "--session", SESSION]));
    // Nobody can answer a permission prompt in a headless run.
    expect(cmd.args).not.toContain("--auto");
  });

  it("lifts the permissions only for an agent that auto-approves", () => {
    const cmd = spec.buildCommand({
      agent: agent({ autoApprove: true }),
      prompt: "x", systemPrompt: "y", binaryPath: "opencode",
    });
    expect(cmd.args).toContain("--auto");
  });
});

describe("opencode parseLine", () => {
  it("reports the session once, on the first step", () => {
    expect(parse(STEP_START)).toEqual([{ type: "session", sessionId: SESSION }]);
    // The id travels on every line; announcing it again would be noise.
    expect(parse(TEXT).some(e => e.type === "session")).toBe(false);
  });

  it("passes the answer through as text", () => {
    expect(parse(TEXT)).toEqual([{ type: "text", text: "listo\n" }]);
  });

  it("logs a tool once, when it starts, and only complains when it fails", () => {
    expect(parse(toolPart("pending"))).toEqual([]);
    expect(parse(toolPart("running", { time: { start: 1 } }))).toEqual([
      { type: "tool", name: "bash", detail: '{"command":"ls"}', input: { command: "ls" } },
    ]);
    expect(parse(toolPart("completed", { output: "ok", title: "ls", metadata: {}, time: { start: 1, end: 2 } }))).toEqual([]);
    expect(parse(toolPart("error", { error: "permiso denegado", time: { start: 1, end: 2 } }))).toEqual([
      { type: "error", text: "Tool bash failed: permiso denegado" },
    ]);
  });

  it("passes on what the model provider refused, in one line", () => {
    // A real 429 from the Gemini API, as opencode prints it: no `part`, the message inside `error`.
    const line = JSON.stringify({
      type: "error",
      timestamp: 1,
      sessionID: SESSION,
      error: {
        name: "APIError",
        data: { message: "You exceeded your current quota, please check your plan.\n* Quota exceeded for metric: …", statusCode: 429 },
      },
    });
    expect(parse(line)).toEqual([
      { type: "error", text: "You exceeded your current quota, please check your plan. (HTTP 429)" },
    ]);
  });

  it("keeps what is not JSON, and calls it an error when it came from stderr", () => {
    expect(spec.parseLine("no soy json", "stdout")).toEqual([{ type: "raw", text: "no soy json" }]);
    expect(spec.parseLine("algo se rompió", "stderr")).toEqual([{ type: "error", text: "algo se rompió" }]);
    expect(spec.parseLine("   ", "stdout")).toEqual([]);
  });
});

describe("opencode final answer and usage", () => {
  it("rebuilds the answer from its parts, counting a repeated one once", () => {
    const again = TEXT.replace('"text":"listo"', '"text":"listo del todo"');
    expect(spec.finalOutput?.([STEP_START, TEXT, STEP_FINISH])).toBe("listo");
    // The same part id arriving twice is one answer, not two.
    expect(spec.finalOutput?.([TEXT, again])).toBe("listo del todo");
  });

  it("adds up what every step spent", () => {
    const second = STEP_FINISH.replace('"input":7592', '"input":100').replace('"output":25', '"output":8').replace('"cost":0', '"cost":0.002');
    expect(opencodeUsage([STEP_START, TEXT, STEP_FINISH, second])).toEqual({
      inputTokens: 7692,
      outputTokens: 33,
      cachedInputTokens: 3584,
      costUsd: 0.002,
      turns: 2,
    });
  });

  it("says nothing when the run never finished a step", () => {
    expect(opencodeUsage([STEP_START, TEXT])).toBeUndefined();
  });
});

describe("parseOpencodeModels", () => {
  it("takes the provider/model lines and leaves the rest", () => {
    const stdout = [
      "opencode/big-pickle",
      "google/gemini-3-flash",
      "anthropic/claude-sonnet-5",
      "google/gemini-3-flash",
      "No models configured. Run `opencode auth login`.",
      "",
    ].join("\n");
    expect(parseOpencodeModels(stdout).map(m => m.id)).toEqual([
      "opencode/big-pickle",
      "google/gemini-3-flash",
      "anthropic/claude-sonnet-5",
    ]);
  });
});
