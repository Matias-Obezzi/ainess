// Two readers on the run events, both hearing them.
//
// One listener per event was the rule, and the ACP client — subscribing for its own run — replaced
// the orchestrator's. From the first Claude run on, no run was ever closed: the process exited, the
// app never heard, stop had nothing to kill and the composer stayed locked.
import { describe, it, expect, vi, beforeEach } from "vitest";

const tauriListeners = new Map<string, (ev: { payload: unknown }) => void>();
vi.mock("@tauri-apps/api/event", () => ({
  listen: async (event: string, cb: (ev: { payload: unknown }) => void) => {
    tauriListeners.set(event, cb);
    return () => { if (tauriListeners.get(event) === cb) tauriListeners.delete(event); };
  },
}));
vi.mock("@tauri-apps/api/core", () => ({ invoke: async () => null }));

const { onRunExit, onRunOutput } = await import("@/lib/tauri");
const emit = (event: string, payload: unknown) => tauriListeners.get(event)?.({ payload });

beforeEach(() => {
  (globalThis as { __ainessFanout?: Map<string, unknown> }).__ainessFanout?.clear();
  (globalThis as { __ainessListeners?: Map<string, () => void> }).__ainessListeners?.clear();
  tauriListeners.clear();
});

describe("run events", () => {
  it("reach the orchestrator and the ACP client both", async () => {
    const orchestrator: unknown[] = [];
    const acp: unknown[] = [];
    await onRunExit(e => orchestrator.push(e), "orchestrator");
    await onRunExit(e => acp.push(e));

    emit("run-exit", { runId: "r", code: 0, killed: false });
    expect(orchestrator).toHaveLength(1);
    expect(acp).toHaveLength(1);
  });

  it("let a reader go without taking the others with it", async () => {
    const orchestrator: unknown[] = [];
    await onRunOutput(e => orchestrator.push(e), "orchestrator");
    const off = await onRunOutput(() => {});
    off();

    emit("run-output", { runId: "r", stream: "stdout", line: "hola" });
    expect(orchestrator).toHaveLength(1);
  });

  it("replace, rather than stack, a reader registered again under its key", async () => {
    // What a hot reload does: the same module subscribes a second time.
    const first: unknown[] = [];
    const second: unknown[] = [];
    await onRunExit(e => first.push(e), "orchestrator");
    await onRunExit(e => second.push(e), "orchestrator");

    emit("run-exit", { runId: "r", code: 0, killed: false });
    expect(first).toHaveLength(0);
    expect(second).toHaveLength(1);
  });

  it("keep going when one reader throws", async () => {
    const heard: unknown[] = [];
    await onRunExit(() => { throw new Error("boom"); });
    await onRunExit(e => heard.push(e), "orchestrator");
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});

    emit("run-exit", { runId: "r", code: 0, killed: false });
    expect(heard).toHaveLength(1);
    spy.mockRestore();
  });
});
