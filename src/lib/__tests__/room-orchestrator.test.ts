// What an orchestrator's run says in the room: once, whichever way the block reached the app, and
// only if it really is the orchestrator speaking.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/store";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { attachListeners, flushStream } from "@/lib/orchestrator";
import { startRooms } from "@/lib/room";
import type { Run, RunExitEvent, RunOutputEvent } from "@/types";

vi.mock("@/lib/hooks", () => ({ emitHookEvent: async () => {} }));
const sent: Array<{ sender: string; text: string; kind: string }> = [];
vi.mock("@/lib/room/transports", () => ({
  openRoomTransport: () => ({
    send: async (m: { sender: string; text: string; kind: string }) => { sent.push(m); },
    stop: () => {},
  }),
}));

let emitOutput: ((e: RunOutputEvent) => void) | undefined;
let emitExit: ((e: RunExitEvent) => void) | undefined;

const BLOCK = "Listo.\n\n```room\nya está la API\n```";
const said = (text: string) => JSON.stringify({ type: "assistant.message", data: { messageId: "m", content: text } });

const run = (over: Partial<Run> & Pick<Run, "id" | "agentId">): Run => ({
  projectId: "p1", parentRunId: null, rootRunId: over.id, prompt: "hola", status: "running",
  startedAt: 1, output: "", rawLines: [], childRunIds: [], round: 0, ...over,
});

/** Sending goes through the signature on its own time, so "nothing went out" needs a moment. */
const published = async () => {
  await new Promise(r => setTimeout(r, 30));
  return sent.filter(m => m.kind === "agent").map(m => [m.sender, m.text]);
};

/** The block seen in the stream, and then again in the final answer. */
async function streamAndEnd(id: string) {
  emitOutput!({ runId: id, line: said(BLOCK), stream: "stdout" } as never);
  flushStream();
  useAppStore.setState(state => ({ runs: { ...state.runs, [id]: { ...state.runs[id], output: BLOCK } } }));
  emitExit!({ runId: id, code: 0, killed: false } as never);
  await vi.waitFor(() => expect(useAppStore.getState().runs[id].status).toBe("done"));
}

describe("what a run says in the room", () => {
  beforeEach(async () => {
    sent.length = 0;
    setTransport({
      ...nullTransport,
      spawnRun: async () => {},
      onRunOutput: async (h: (e: RunOutputEvent) => void) => { emitOutput ??= h; return () => {}; },
      onRunExit: async (h: (e: RunExitEvent) => void) => { emitExit ??= h; return () => {}; },
    } as never);
    await attachListeners();
    useAppStore.setState(s => ({ config: { ...s.config, projects: [] } }));
    startRooms()();
    useAppStore.setState(s => ({
      messages: [],
      questions: {},
      approvals: {},
      runs: {},
      runtime: {},
      config: {
        ...s.config,
        projects: [{
          id: "p1", name: "P", workspaceDir: "C:/p", createdAt: 1,
          agents: [
            { id: "a0", name: "Jefe", provider: "copilot", role: "planner", parentId: null, autoApprove: true },
            { id: "a1", name: "Uno", provider: "copilot", role: "implementer", parentId: "a0", autoApprove: true },
          ],
          room: { enabled: true, backend: "supabase", room: "sala", secret: "k", supabaseUrl: "https://x.supabase.co", supabaseKey: "k", chatId: "c1", allowed: {} },
        }] as never,
      },
    }));
    startRooms()();
  });

  it("publishes the orchestrator's block once, though it is seen while streaming and at the end", async () => {
    useAppStore.setState({ runs: { r1: run({ id: "r1", agentId: "a0" }) } } as never);
    await streamAndEnd("r1");

    expect(await published()).toEqual([["Jefe", "ya está la API"]]);
  });

  it("publishes a block that only shows up in the final answer", async () => {
    useAppStore.setState({ runs: { r2: run({ id: "r2", agentId: "a0" }) } } as never);
    useAppStore.setState(state => ({ runs: { ...state.runs, r2: { ...state.runs.r2, output: BLOCK } } }));
    emitExit!({ runId: "r2", code: 0, killed: false } as never);
    await vi.waitFor(() => expect(useAppStore.getState().runs.r2.status).toBe("done"));
    expect(await published()).toEqual([["Jefe", "ya está la API"]]);
  });

  it("publishes nothing from an agent that is not the orchestrator", async () => {
    useAppStore.setState({ runs: { r3: run({ id: "r3", agentId: "a1", parentRunId: "x" }) } } as never);
    await streamAndEnd("r3");

    expect(await published()).toEqual([]);
  });

  it("publishes nothing from a chat run, not even the orchestrator's", async () => {
    useAppStore.setState({ runs: { r4: run({ id: "r4", agentId: "a0", kind: "chat" }) } } as never);
    emitOutput!({ runId: "r4", line: said(BLOCK), stream: "stdout" } as never);
    flushStream();

    expect(await published()).toEqual([]);
  });
});
