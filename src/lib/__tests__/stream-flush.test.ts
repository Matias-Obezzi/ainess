const NL = String.fromCharCode(10);

// The streamed text of a run reaches the feed in one write per flush, not one per token: that is
// the whole point of the buffer (see `flushStream`), and the only place the behaviour is visible
// end to end is through the transport handler the orchestrator subscribes with.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/store";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { attachListeners, flushStream } from "@/lib/orchestrator";
import type { RunOutputEvent, Run } from "@/types";

let emitOutput: ((e: RunOutputEvent) => void) | undefined;

const run = (over: Partial<Run> = {}): Run => ({
  id: "r1", projectId: "p1", agentId: "a1", parentRunId: null, rootRunId: "r1",
  prompt: "hola", status: "running", startedAt: 1, output: "", rawLines: [],
  childRunIds: [], round: 0, ...over,
});

describe("streamed output", () => {
  beforeEach(async () => {
    vi.useFakeTimers();
    setTransport({
      ...nullTransport,
      onRunOutput: async (h: (e: RunOutputEvent) => void) => { emitOutput = h; return () => {}; },
    } as never);
    await attachListeners();
    useAppStore.setState({
      runs: { r1: run() },
      messages: [],
      config: {
        ...useAppStore.getState().config,
        projects: [{ id: "p1", name: "P", workspaceDir: "C:/p", agents: [{ id: "a1", name: "Uno", provider: "claude", role: "implementer", parentId: null, autoApprove: true }], createdAt: 1 }],
      },
    } as never);
  });

  it("gathers many deltas into a single store write", () => {
    const spy = vi.spyOn(useAppStore, "setState");
    for (let i = 0; i < 20; i++) {
      emitOutput!({ runId: "r1", line: JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: `x${i}` }] } }), stream: "stdout" } as never);
    }
    const duringStreaming = spy.mock.calls.length;
    vi.advanceTimersByTime(100);
    const afterFlush = spy.mock.calls.length;

    // Twenty lines must not be twenty writes; the flush that follows is one more.
    expect(afterFlush - duringStreaming).toBe(1);
    expect(duringStreaming).toBe(0);
    spy.mockRestore();
  });

  it("keeps every delta, in order, in one message", () => {
    for (const t of ["uno ", "dos ", "tres"]) {
      emitOutput!({ runId: "r1", line: JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: t }] } }), stream: "stdout" } as never);
    }
    flushStream();
    const text = useAppStore.getState().messages.find(m => m.id === "text-r1");
    expect(text?.text).toBe("uno dos tres");
    expect(useAppStore.getState().runs.r1.rawLines).toHaveLength(3);
  });

  it("drops what belonged to a run that is gone instead of throwing", () => {
    emitOutput!({ runId: "r1", line: JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: "hola" }] } }), stream: "stdout" } as never);
    useAppStore.setState({ runs: {} } as never);
    expect(() => flushStream()).not.toThrow();
    expect(useAppStore.getState().messages).toHaveLength(0);
  });
  it("hands a note over while the run is still going", () => {
    const note = ["```note", "el build tarda 20 minutos, sigo", "```"].join(NL);
    emitOutput!({ runId: "r1", line: JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: note }] } }), stream: "stdout" } as never);
    flushStream();

    const notes = useAppStore.getState().messages.filter(m => m.kind === "note");
    expect(notes.map(m => m.text)).toEqual(["el build tarda 20 minutos, sigo"]);
    expect(useAppStore.getState().runs.r1.status).toBe("running");
  });

  it("does not hand the same note over twice, however many flushes go by", () => {
    // Its own run: what has already been handed over is remembered per run, for the life of the run.
    useAppStore.setState({ runs: { ...useAppStore.getState().runs, r2: run({ id: "r2" }) } } as never);
    const note = ["```note", "ojo con el worktree", "```"].join(NL);
    emitOutput!({ runId: "r2", line: JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: note }] } }), stream: "stdout" } as never);
    flushStream();
    emitOutput!({ runId: "r2", line: JSON.stringify({ type: "assistant", message: { content: [{ type: "text", text: " y sigo escribiendo" }] } }), stream: "stdout" } as never);
    flushStream();

    expect(useAppStore.getState().messages.filter(m => m.kind === "note")).toHaveLength(1);
  });
});
