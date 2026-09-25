// A whole run of an ACP agent, through the orchestrator and into the store.
//
// The unit tests next door (acp-client.test.ts) stop at the events the session produces. What this
// one asks is the question that follows: that a claude run — which no longer starts a CLI, but an
// adapter it talks to — ends up in the app looking exactly like a CLI run did. The answer in the
// run, the tool in the timeline, the usage on the run, the session remembered for the next turn,
// and the process gone when the turn is over.
//
// The adapter is replaced by a node script that speaks ACP and nothing else: what is under test is
// this side of the protocol, and a real agent would make it slow, flaky and billed.
import { describe, test, expect, afterEach, beforeEach, vi } from "vitest";
import { mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { useAppStore } from "@/store";
import { setTransport } from "@/lib/transport";
import { nodeTransport } from "@/lib/transport-node";
import { attachListeners, startRun, stopAgent } from "@/lib/orchestrator";
import { rawLinesOf } from "@/lib/raw-lines";
import type { Run } from "@/types";

/** Answers a turn with text, a tool call and a usage update, then stops. Exits on EOF. */
const FAKE_ADAPTER = String.raw`
const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const notify = (update) => send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "sess-9", update } });
const MODE = process.env.FAKE_MODE || "ok";

const rl = require("readline").createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.method === "initialize") return reply(msg.id, { protocolVersion: 1, agentCapabilities: {}, authMethods: [] });
  if (msg.method === "session/new") return reply(msg.id, { sessionId: "sess-9" });
  if (msg.method === "session/prompt") {
    if (MODE === "hang") return;
    if (MODE === "error") return send({ jsonrpc: "2.0", id: msg.id, error: { code: -32603, message: "se quedo sin nafta" } });
    notify({ sessionUpdate: "tool_call", toolCallId: "t1", title: "Read a.txt", name: "Read", status: "pending", rawInput: { path: "a.txt" } });
    notify({ sessionUpdate: "usage_update", used: 1234, size: 200000, cost: { amount: 0.25, currency: "USD" } });
    notify({ sessionUpdate: "agent_message_chunk", content: { type: "text", text: "Listo, lo hice." } });
    return reply(msg.id, { stopReason: "end_turn" });
  }
});
rl.on("close", () => process.exit(0));
`;

vi.mock("@/lib/hooks", () => ({ emitHookEvent: async () => {} }));
vi.mock("@/lib/acp/adapter", () => ({
  resolveAcpAdapter: async () => ({ program: process.execPath, args: ["-e", FAKE_ADAPTER], via: "installed" as const }),
  forgetAcpAdapter: () => {},
  ACP_ADAPTER_PACKAGE: "@agentclientprotocol/claude-agent-acp",
  ACP_ADAPTER_BIN: "claude-agent-acp",
}));

/** Resolves when `cond` holds, rejects after `ms`. No fixed sleep: a slow machine must not fail. */
function waitFor(cond: () => boolean, what: string, ms = 20_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + ms;
    const tick = () => {
      if (cond()) return resolve();
      if (Date.now() > deadline) return reject(new Error(`timed out waiting for ${what}`));
      setTimeout(tick, 20);
    };
    tick();
  });
}

let workspace = "";

const runOf = (runId: string): Run => useAppStore.getState().runs[runId];
const finished = (runId: string) => () => !!runOf(runId) && runOf(runId).status !== "running" && runOf(runId).status !== "queued";

function start(mode: string): string {
  process.env.FAKE_MODE = mode;
  const runId = startRun({ agentId: "a1", projectId: "p1", prompt: "hacé esto", parentRunId: null, round: 0 });
  if (!runId) throw new Error("the run did not start");
  return runId;
}

beforeEach(async () => {
  workspace = mkdtempSync(path.join(tmpdir(), "ainess-acp-run-"));
  setTransport(nodeTransport);
  await attachListeners();
  useAppStore.setState({
    runs: {},
    messages: {} as never,
    binaries: {},
    runtime: {},
    config: {
      ...useAppStore.getState().config,
      projects: [{
        id: "p1", name: "P", workspaceDir: workspace, createdAt: 1,
        agents: [{ id: "a1", name: "Uno", provider: "claude", role: "implementer", parentId: null, autoApprove: true }],
      }],
    },
  } as never);
  useAppStore.setState({ messages: [] } as never);
});

afterEach(() => {
  delete process.env.FAKE_MODE;
  try { rmSync(workspace, { recursive: true, force: true }); } catch { /* the system keeps it */ }
});

describe("a claude run, which speaks ACP", () => {
  test("ends as done, with the answer, the tool, the usage and the session", async () => {
    const runId = start("ok");
    await waitFor(finished(runId), "the run to end");

    const run = runOf(runId);
    expect(run.status).toBe("done");
    expect(run.output).toContain("Listo, lo hice.");
    expect(run.usage?.contextTokens).toBe(1234);
    expect(run.usage?.costUsd).toBe(0.25);
    // The session is what the next turn resumes on, and it only exists if the event travelled.
    expect(useAppStore.getState().runtime.p1.a1.sessionId).toBe("sess-9");

    const tools = useAppStore.getState().messages.filter(m => m.kind === "tool");
    expect(tools.map(m => m.meta?.tool)).toEqual(["Read"]);
    // No CLI was detected here — the adapter is the program, and it brings the agent with it.
    expect(useAppStore.getState().binaries.claude).toBeUndefined();
  });

  test("a turn the agent fails ends the run as an error, not as a run that simply finished", async () => {
    const runId = start("error");
    await waitFor(finished(runId), "the run to end");

    expect(runOf(runId).status).toBe("error");
    expect(runOf(runId).output).toContain("se quedo sin nafta");
    expect(useAppStore.getState().messages.some(m => m.kind === "error" && m.text.includes("se quedo sin nafta"))).toBe(true);
  });

  test("stopping the agent stops it, and says nothing about an error", async () => {
    const runId = start("hang");
    // Until the adapter has answered something, which is proof it is up and the session is open:
    // stopping before the spawn is a different path, tested elsewhere.
    await waitFor(() => (rawLinesOf(runId)?.length ?? 0) > 0, "the adapter to answer");
    await stopAgent("a1", "p1");
    await waitFor(finished(runId), "the run to end");

    expect(runOf(runId).status).toBe("killed");
    expect(useAppStore.getState().messages.some(m => m.kind === "error")).toBe(false);
  }, 20_000);
});
