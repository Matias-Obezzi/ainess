import { describe, test, expect, afterEach } from "vitest";
import { nodeTransport } from "@/lib/transport-node";
import { setTransport } from "@/lib/transport";
import { createRunStream } from "@/lib/acp/stream";
import { eventsFromSessionUpdate } from "@/lib/acp/events";
import { runAcpPrompt } from "@/lib/acp/session";
import type { AnyMessage } from "@agentclientprotocol/sdk";
import type { Transport } from "@/lib/transport";
import type { ParsedEvent, RunExitEvent, RunOutputEvent } from "@/types";

/**
 * An agent that speaks ACP and nothing else: fixed frames, no network, no model. What is under test
 * is this side of the wire — the stream over the transport and the mapping to `ParsedEvent` — and a
 * real agent would only make these assertions slower, flakier and more expensive (it bills the
 * user). The real one is exercised by `scripts/acp-smoke.mjs`, which is out of `npm test`.
 *
 * Run through `process.execPath` so the suite depends on no binary but the node already running it.
 */
const FAKE_AGENT = String.raw`
const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const notify = (update) => send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "sess-1", update } });
const MODE = process.env.FAKE_MODE || "ok";

const rl = require("readline").createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.method === "initialize") {
    // A frame on stderr that would hijack the session if anything but stdout were parsed.
    if (MODE === "stderr") process.stderr.write('{"jsonrpc":"2.0","id":' + msg.id + ',"result":{"protocolVersion":0}}\n(node:1) Warning: chatter\n');
    return reply(msg.id, { protocolVersion: 1, agentCapabilities: {}, authMethods: [] });
  }
  if (msg.method === "session/new") {
    if (MODE === "split") {
      // One frame, two writes: the agent flushed half of it. The platform's line reader is what
      // puts it back together, so this side must never see two halves.
      const whole = JSON.stringify({ jsonrpc: "2.0", id: msg.id, result: { sessionId: "sess-1" } });
      process.stdout.write(whole.slice(0, 12));
      setTimeout(() => process.stdout.write(whole.slice(12) + "\n"), 20);
      return;
    }
    return reply(msg.id, { sessionId: "sess-1" });
  }
  if (msg.method === "session/prompt") {
    if (MODE === "hang") return;
    if (MODE === "error") {
      return send({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: "the agent gave up" } });
    }
    if (MODE === "noise") process.stdout.write("Warming up the agent...\n");
    notify({ sessionUpdate: "user_message_chunk", content: { type: "text", text: "ignored" } });
    notify({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "thinking" } });
    notify({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Hola " } });
    notify({ sessionUpdate: "tool_call", toolCallId: "t1", title: "Read file", name: "Read", status: "pending", rawInput: { path: "a.txt" } });
    notify({ sessionUpdate: "tool_call_update", toolCallId: "t1", status: "in_progress" });
    notify({ sessionUpdate: "tool_call_update", toolCallId: "t1", name: "Read", status: "failed", content: [{ type: "content", content: { type: "text", text: "no such file" } }] });
    notify({ sessionUpdate: "notice", severity: "error", title: "disk full", description: "no room left" });
    notify({ sessionUpdate: "usage_update", used: 1234, size: 200000 });
    notify({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "mundo" } });
    return reply(msg.id, { stopReason: "end_turn" });
  }
});
rl.on("close", () => process.exit(0));
`;

/** A second run that only shouts on stdout, to prove a session hears its own run and nobody else's. */
const NOISY_RUN = String.raw`
const frame = JSON.stringify({ jsonrpc: "2.0", id: 1, result: { sessionId: "intruder", protocolVersion: 1 } });
setInterval(() => process.stdout.write(frame + "\n"), 5);
setTimeout(() => process.exit(0), 5000);
`;

const running: string[] = [];

async function startAgent(runId: string, mode = "ok"): Promise<void> {
  // `getTransport()` answers the null transport outside Tauri, and that one spawns nothing.
  setTransport(nodeTransport);
  running.push(runId);
  await nodeTransport.spawnRun({
    runId,
    program: process.execPath,
    args: ["-e", FAKE_AGENT],
    env: { FAKE_MODE: mode },
    keepStdinOpen: true,
  });
}

/**
 * A transport that spawns nothing and lets the test push lines in by hand. Spawning a process to
 * assert which lines the stream kept would make the timing of every one of them a guess.
 */
function pushTransport() {
  const outputs = new Set<(e: RunOutputEvent) => void>();
  const exits = new Set<(e: RunExitEvent) => void>();
  const written: Array<{ runId: string; text: string }> = [];
  const transport = {
    onRunOutput: async (h: (e: RunOutputEvent) => void) => { outputs.add(h); return () => outputs.delete(h); },
    onRunExit: async (h: (e: RunExitEvent) => void) => { exits.add(h); return () => exits.delete(h); },
    writeStdin: async (runId: string, text: string) => { written.push({ runId, text }); return true; },
    closeStdin: async () => true,
    logAppend: async () => {},
  } as unknown as Transport;
  setTransport(transport);
  return {
    written,
    emit: (e: RunOutputEvent) => { for (const h of outputs) h(e); },
    exit: (e: RunExitEvent) => { for (const h of exits) h(e); },
    listeners: () => outputs.size + exits.size,
  };
}

afterEach(async () => {
  for (const runId of running.splice(0)) await nodeTransport.killRun(runId);
  setTransport(nodeTransport);
});

describe("createRunStream", () => {
  test("reads this run's stdout, and neither its stderr nor anybody else's lines", async () => {
    const bus = pushTransport();
    const run = await createRunStream("mine");
    const seen: AnyMessage[] = [];
    const reader = run.stream.readable.getReader();
    const pump = (async () => {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) return;
        if (value) seen.push(value);
      }
    })();

    bus.emit({ runId: "mine", stream: "stdout", line: JSON.stringify({ jsonrpc: "2.0", id: 1, result: {} }) });
    bus.emit({ runId: "mine", stream: "stderr", line: JSON.stringify({ jsonrpc: "2.0", id: 2, result: {} }) });
    bus.emit({ runId: "theirs", stream: "stdout", line: JSON.stringify({ jsonrpc: "2.0", id: 3, result: {} }) });
    bus.emit({ runId: "mine", stream: "stdout", line: "not json at all" });
    bus.emit({ runId: "mine", stream: "stdout", line: "" });
    bus.emit({ runId: "mine", stream: "stdout", line: JSON.stringify({ jsonrpc: "2.0", id: 4, result: {} }) });

    run.dispose();
    await pump;
    expect(seen.map((m) => (m as { id: number }).id)).toEqual([1, 4]);
  });

  test("stderr goes to the stderr sink, and only this run's", async () => {
    const bus = pushTransport();
    const stderr: string[] = [];
    const run = await createRunStream("mine", { onStderr: (line) => stderr.push(line) });
    bus.emit({ runId: "mine", stream: "stderr", line: "npm warn exec" });
    bus.emit({ runId: "theirs", stream: "stderr", line: "not mine" });
    run.dispose();
    expect(stderr).toEqual(["npm warn exec"]);
  });

  test("what is written is one JSON line per message, and dispose lets go of the transport", async () => {
    const bus = pushTransport();
    const run = await createRunStream("mine");
    const writer = run.stream.writable.getWriter();
    await writer.write({ jsonrpc: "2.0", id: 1, method: "initialize", params: {} } as AnyMessage);
    expect(bus.written).toEqual([{ runId: "mine", text: '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{}}\n' }]);
    expect(bus.listeners()).toBe(2);
    run.dispose();
    expect(bus.listeners()).toBe(0);
  });

  test("the run ending ends the readable instead of leaving a reader waiting", async () => {
    const bus = pushTransport();
    const run = await createRunStream("mine");
    const reader = run.stream.readable.getReader();
    const pending = reader.read();
    bus.exit({ runId: "mine", code: 1, killed: false });
    await expect(pending).rejects.toThrow(/ended/);
  });
});

describe("eventsFromSessionUpdate", () => {
  test("maps the kinds the timeline knows, and drops the rest", () => {
    expect(eventsFromSessionUpdate({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "hi" } }))
      .toEqual([{ type: "text", text: "hi" }]);
    expect(eventsFromSessionUpdate({ sessionUpdate: "tool_call", toolCallId: "t1", title: "Read file", name: "Read", rawInput: { path: "a.txt" } }))
      .toEqual([{ type: "tool", name: "Read", detail: '{"path":"a.txt"}', input: { path: "a.txt" } }]);
    expect(eventsFromSessionUpdate({ sessionUpdate: "notice", severity: "error", title: "boom" }))
      .toEqual([{ type: "error", text: "boom" }]);
    expect(eventsFromSessionUpdate({ sessionUpdate: "usage_update", used: 10, size: 100 }))
      .toEqual([{ type: "usage", usage: { contextTokens: 10 } }]);

    // Its own prompt coming back, the thinking, the plan and the info notices are not the answer.
    expect(eventsFromSessionUpdate({ sessionUpdate: "user_message_chunk", content: { type: "text", text: "hi" } })).toEqual([]);
    expect(eventsFromSessionUpdate({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "hmm" } })).toEqual([]);
    expect(eventsFromSessionUpdate({ sessionUpdate: "notice", severity: "info", title: "hello" })).toEqual([]);
    expect(eventsFromSessionUpdate({ sessionUpdate: "plan", entries: [] })).toEqual([]);
  });

  test("a tool call is logged once, when it starts, plus its failure", () => {
    expect(eventsFromSessionUpdate({ sessionUpdate: "tool_call_update", toolCallId: "t1", status: "in_progress" })).toEqual([]);
    expect(eventsFromSessionUpdate({ sessionUpdate: "tool_call_update", toolCallId: "t1", status: "completed" })).toEqual([]);
    expect(eventsFromSessionUpdate({
      sessionUpdate: "tool_call_update",
      toolCallId: "t1",
      name: "Read",
      status: "failed",
      content: [{ type: "content", content: { type: "text", text: "no such file" } }],
    })).toEqual([{ type: "tool", name: "Read", failed: true, error: "no such file" }]);
  });
});

describe("runAcpPrompt", () => {
  test("a whole turn: session, text, tool, notice, usage and result", async () => {
    const runId = "acp-turn";
    await startAgent(runId);
    const events: ParsedEvent[] = [];
    const result = await runAcpPrompt({ runId, cwd: process.cwd(), prompt: "hola", onEvent: (e) => events.push(e) });

    expect(result).toEqual({ sessionId: "sess-1", stopReason: "end_turn", text: "Hola mundo" });
    expect(events).toEqual([
      { type: "session", sessionId: "sess-1" },
      { type: "text", text: "Hola " },
      { type: "tool", name: "Read", detail: '{"path":"a.txt"}', input: { path: "a.txt" } },
      { type: "tool", name: "Read", failed: true, error: "no such file" },
      { type: "error", text: "disk full: no room left" },
      { type: "usage", usage: { contextTokens: 1234 } },
      { type: "text", text: "mundo" },
      { type: "result", text: "Hola mundo", sessionId: "sess-1" },
    ]);
  });

  test("a frame on stderr cannot hijack the session", async () => {
    const runId = "acp-stderr";
    await startAgent(runId, "stderr");
    const result = await runAcpPrompt({ runId, cwd: process.cwd(), prompt: "hola", onEvent: () => {} });
    expect(result.text).toBe("Hola mundo");
  });

  test("a frame that arrives in two writes is still one message", async () => {
    const runId = "acp-split";
    await startAgent(runId, "split");
    const result = await runAcpPrompt({ runId, cwd: process.cwd(), prompt: "hola", onEvent: () => {} });
    expect(result).toMatchObject({ sessionId: "sess-1", stopReason: "end_turn" });
  });

  test("a stdout line that is not protocol is skipped, not fatal", async () => {
    const runId = "acp-noise";
    await startAgent(runId, "noise");
    const result = await runAcpPrompt({ runId, cwd: process.cwd(), prompt: "hola", onEvent: () => {} });
    expect(result.text).toBe("Hola mundo");
  });

  test("another run's stdout cannot answer for this one", async () => {
    setTransport(nodeTransport);
    const noisy = "acp-intruder";
    running.push(noisy);
    await nodeTransport.spawnRun({ runId: noisy, program: process.execPath, args: ["-e", NOISY_RUN], keepStdinOpen: true });

    const runId = "acp-mine";
    await startAgent(runId);
    const result = await runAcpPrompt({ runId, cwd: process.cwd(), prompt: "hola", onEvent: () => {} });
    expect(result).toMatchObject({ sessionId: "sess-1", stopReason: "end_turn", text: "Hola mundo" });
  });

  test("an agent that answers with an error ends as an error event", async () => {
    const runId = "acp-error";
    await startAgent(runId, "error");
    const events: ParsedEvent[] = [];
    await expect(runAcpPrompt({ runId, cwd: process.cwd(), prompt: "hola", onEvent: (e) => events.push(e) }))
      .rejects.toThrow(/gave up/);
    expect(events.at(-1)).toEqual({ type: "error", text: expect.stringContaining("gave up") });
  });

  test("killing the run settles the turn instead of leaving it hanging", async () => {
    const runId = "acp-killed";
    await startAgent(runId, "hang");
    const events: ParsedEvent[] = [];
    const turn = runAcpPrompt({ runId, cwd: process.cwd(), prompt: "hola", onEvent: (e) => events.push(e) });
    // Long enough for the session to be open and the prompt to be in flight.
    await new Promise((r) => setTimeout(r, 300));
    await nodeTransport.killRun(runId);
    await expect(turn).rejects.toThrow(/ended/);
    expect(events.at(-1)?.type).toBe("error");
  });
});
