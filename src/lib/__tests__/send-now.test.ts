// The two ends of the queue: handing it over when the turn finishes, and cutting the turn short to
// hand it over now. Both send everything waiting as one message — interrupting a run to deliver one
// of three would still be three turns, which is the thing the queue stopped doing.
//
// `sendNowInterrupting` puts that one message at the head and stops the agent: the drain that
// follows a stop is what starts it, resuming the session, so nothing the agent did is repeated.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/store";
import { setTransport, getTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { processQueuedInstructions, sendNowInterrupting } from "@/lib/orchestrator";

const killed: string[] = [];

const withQueue = (queuedInstructions: string[], status = "working") => {
  useAppStore.setState({
    runs: {},
    messages: [],
    runtime: { p1: { a1: { agentId: "a1", status, currentRunId: "r-1", queuedInstructions } } },
    config: {
      ...useAppStore.getState().config,
      projects: [{
        id: "p1", name: "P", workspaceDir: "C:/p", createdAt: 1,
        agents: [{ id: "a1", name: "Uno", provider: "claude", role: "implementer", parentId: null, autoApprove: true }],
      }],
    },
  } as never);
};

const queue = () => useAppStore.getState().runtime.p1.a1.queuedInstructions ?? [];
const startedRuns = () => Object.values(useAppStore.getState().runs);

beforeEach(() => {
  killed.length = 0;
  setTransport({
    ...nullTransport,
    ...getTransport(),
    killRun: async (runId: string) => { killed.push(runId); return true; },
  } as never);
});

describe("processQueuedInstructions", () => {
  it("starts one run for everything waiting, not one run each", () => {
    withQueue(["primero", "segundo", "tercero"], "idle");
    processQueuedInstructions("a1", "p1");

    expect(startedRuns()).toHaveLength(1);
    expect(startedRuns()[0].prompt).toBe("primero\n\nsegundo\n\ntercero");
    expect(queue()).toEqual([]);
  });

  it("leaves a single message exactly as it was written", () => {
    withQueue(["arreglá el build"], "idle");
    processQueuedInstructions("a1", "p1");
    expect(startedRuns()[0].prompt).toBe("arreglá el build");
  });

  it("does not touch the queue of an agent that is still working", () => {
    // The end of the run that delegated is not the end of the work.
    withQueue(["primero"], "working");
    processQueuedInstructions("a1", "p1");
    expect(startedRuns()).toHaveLength(0);
    expect(queue()).toEqual(["primero"]);
  });

  it("starts nothing when there is nothing waiting", () => {
    withQueue([], "idle");
    processQueuedInstructions("a1", "p1");
    expect(startedRuns()).toHaveLength(0);
  });

  it("clears a queue of nothing but blanks instead of running an empty prompt", () => {
    withQueue(["  ", ""], "idle");
    processQueuedInstructions("a1", "p1");
    expect(startedRuns()).toHaveLength(0);
    expect(queue()).toEqual([]);
  });
});

describe("sendNowInterrupting", () => {
  it("stops the run and leaves everything waiting as one message, said to be an interruption", async () => {
    withQueue(["primero", "el urgente"]);
    await sendNowInterrupting("a1", "p1");

    expect(killed).toEqual(["r-1"]);
    expect(queue()).toHaveLength(1);
    // In the order it was written: a queue that reorders hands over a correction before the thing
    // it corrects.
    expect(queue()[0]).toContain("primero\n\nel urgente");
    // The agent must not read its cut turn as one it finished.
    expect(queue()[0].length).toBeGreaterThan("primero\n\nel urgente".length);
  });

  it("does nothing when the queue is already empty", async () => {
    withQueue([]);
    await sendNowInterrupting("a1", "p1");
    expect(killed).toEqual([]);
    expect(queue()).toEqual([]);
  });

  it("does not interrupt a turn to deliver nothing", async () => {
    withQueue(["   "]);
    await sendNowInterrupting("a1", "p1");
    expect(killed).toEqual([]);
  });
});

vi.mock("@/lib/hooks", () => ({ emitHookEvent: async () => {} }));
