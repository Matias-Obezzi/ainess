// The turn waits on the user: a permission and a form go out to whoever runs it and their answers
// come back to the agent; the session is put in the mode asked for, and pictures travel as images.
import { describe, test, expect, afterEach } from "vitest";
import { nodeTransport } from "@/lib/transport-node";
import { setTransport } from "@/lib/transport";
import { runAcpPrompt } from "@/lib/acp/session";

const AGENT = String.raw`
const send = (msg) => process.stdout.write(JSON.stringify(msg) + "\n");
const reply = (id, result) => send({ jsonrpc: "2.0", id, result });
const seen = {};
let promptId = null;
const rl = require("readline").createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  if (msg.method === "initialize") {
    seen.elicitation = msg.params.clientCapabilities.elicitation ?? null;
    return reply(msg.id, { protocolVersion: 1, agentCapabilities: { promptCapabilities: { image: true } }, authMethods: [] });
  }
  if (msg.method === "session/new") {
    return reply(msg.id, { sessionId: "s1", modes: { currentModeId: "default", availableModes: [{ id: "default", name: "Default" }, { id: "acceptEdits", name: "Accept edits" }] } });
  }
  if (msg.method === "session/set_mode") { seen.mode = msg.params.modeId; return reply(msg.id, {}); }
  if (msg.method === "session/prompt") {
    promptId = msg.id;
    seen.blocks = msg.params.prompt.map(b => b.type + (b.mimeType ? ":" + b.mimeType : ""));
    return send({ jsonrpc: "2.0", id: 900, method: "session/request_permission", params: {
      sessionId: "s1",
      toolCall: { toolCallId: "t1", title: "npm install", kind: "execute", rawInput: { command: "npm install" } },
      options: [{ optionId: "yes", name: "Allow", kind: "allow_once" }, { optionId: "no", name: "Reject", kind: "reject_once" }],
    } });
  }
  if (msg.id === 900) {
    seen.permission = msg.result.outcome;
    return send({ jsonrpc: "2.0", id: 901, method: "elicitation/create", params: {
      sessionId: "s1", mode: "form", message: "¿Qué framework?",
      requestedSchema: { type: "object", required: ["q0"], properties: { q0: { type: "string", oneOf: [{ const: "Vite", title: "Vite" }] } } },
    } });
  }
  if (msg.id === 901) {
    seen.answer = msg.result;
    send({ jsonrpc: "2.0", method: "session/update", params: { sessionId: "s1", update: { sessionUpdate: "agent_message_chunk", content: { type: "text", text: JSON.stringify(seen) } } } });
    return reply(promptId, { stopReason: "end_turn" });
  }
});
rl.on("close", () => process.exit(0));
`;

const runs: string[] = [];
afterEach(async () => {
  for (const id of runs.splice(0)) await nodeTransport.killRun(id).catch(() => {});
});

describe("a turn that asks the user", () => {
  test("sends the permission and the form out, the answers back, the mode and the image in", async () => {
    setTransport(nodeTransport);
    const runId = `live-${Date.now()}`;
    runs.push(runId);
    await nodeTransport.spawnRun({ runId, program: process.execPath, args: ["-e", AGENT], keepStdinOpen: true });

    const asked: string[] = [];
    const result = await runAcpPrompt({
      runId,
      cwd: process.cwd(),
      prompt: "hola",
      images: [{ data: "aGVsbG8=", mimeType: "image/png" }],
      session: { mode: "acceptEdits" },
      onEvent: () => {},
      askPermission: async (request) => {
        asked.push(request.toolCall.title ?? "");
        return { outcome: "selected", optionId: "no" };
      },
      elicit: async (request) => {
        asked.push(request.message);
        return { action: "accept", content: { q0: "Vite" } };
      },
    });

    expect(asked).toEqual(["npm install", "¿Qué framework?"]);
    expect(JSON.parse(result.text)).toEqual({
      elicitation: { form: {} },
      mode: "acceptEdits",
      blocks: ["text", "image:image/png"],
      permission: { outcome: "selected", optionId: "no" },
      answer: { action: "accept", content: { q0: "Vite" } },
    });
  });
});
