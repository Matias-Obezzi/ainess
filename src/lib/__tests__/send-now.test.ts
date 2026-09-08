// Cutting a turn short to hand a message over. What matters is the order: the message goes to the
// head of the queue, marked as an interruption, and the agent is stopped — the drain that follows
// a stop is what starts it, resuming the session, so nothing the agent did is repeated.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/store";
import { setTransport, getTransport } from "@/lib/transport";
import { sendNowInterrupting } from "@/lib/orchestrator";

const killed: string[] = [];

beforeEach(() => {
  killed.length = 0;
  setTransport({ ...getTransport(), killRun: async (runId: string) => { killed.push(runId); return true; } } as never);
  useAppStore.setState({
    runtime: {
      p1: {
        a1: {
          agentId: "a1",
          status: "working",
          currentRunId: "r-1",
          queuedInstructions: ["primero", "el urgente"],
        },
      },
    },
  } as never);
});

describe("sendNowInterrupting", () => {
  it("stops the run and leaves the message first, said to be an interruption", async () => {
    await sendNowInterrupting("a1", "p1", 1);

    expect(killed).toEqual(["r-1"]);
    const queue = useAppStore.getState().runtime.p1.a1.queuedInstructions;
    expect(queue).toHaveLength(2);
    expect(queue[0]).toContain("el urgente");
    // The agent must not read its cut turn as one it finished.
    expect(queue[0].length).toBeGreaterThan("el urgente".length);
    // Whatever was already waiting keeps waiting, behind it.
    expect(queue[1]).toBe("primero");
  });

  it("does nothing for a message that is no longer there", async () => {
    await sendNowInterrupting("a1", "p1", 7);
    expect(killed).toEqual([]);
    expect(useAppStore.getState().runtime.p1.a1.queuedInstructions).toEqual(["primero", "el urgente"]);
  });
});

vi.mock("@/lib/hooks", () => ({ emitHookEvent: async () => {} }));
