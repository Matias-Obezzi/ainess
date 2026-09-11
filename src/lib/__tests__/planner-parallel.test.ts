// A planner that delegated is not busy — it is waiting, with nothing of its own running. A message
// sent to it used to sit in a queue until the entire round came back, so the one agent whose job is
// to keep planning was the one that could not be talked to while work was in flight.
//
// The rule has one hard edge: an agent already in a turn of its own must not be given another, or
// two runs write the same CLI session at once.
import { describe, it, expect } from "vitest";
import { canTakeAMessageNow } from "@/lib/orchestrator";
import type { AgentStatus } from "@/types";

const state = (over: Partial<Parameters<typeof canTakeAMessageNow>[0]> = {}) => ({
  status: "waiting" as AgentStatus | undefined,
  currentRunId: undefined as string | undefined,
  hasRunningDelegations: true,
  ...over,
});

describe("canTakeAMessageNow", () => {
  it("takes it when the agent is waiting for the work it handed out", () => {
    expect(canTakeAMessageNow(state())).toBe(true);
  });

  // The one that must never be true: a second run would resume a conversation the first is still
  // writing.
  it("does not take it while the agent has a turn of its own running", () => {
    expect(canTakeAMessageNow(state({ currentRunId: "r-mine" }))).toBe(false);
    expect(canTakeAMessageNow(state({ status: "working", currentRunId: "r-mine" }))).toBe(false);
  });

  // "waiting" also means "asked you something" and "parked until quota returns". Neither has work
  // out there, and a new turn would talk over the very thing being waited for.
  it("does not take it when the agent is waiting for something other than its implementers", () => {
    expect(canTakeAMessageNow(state({ hasRunningDelegations: false }))).toBe(false);
  });

  it("does not take it when the agent is working", () => {
    expect(canTakeAMessageNow(state({ status: "working" }))).toBe(false);
  });

  // An idle agent is not this rule's business: `instructAgent` was already starting a run for it.
  it("says nothing about an agent that is free", () => {
    expect(canTakeAMessageNow(state({ status: "idle" }))).toBe(false);
    expect(canTakeAMessageNow(state({ status: undefined }))).toBe(false);
  });

  it("does not take it from an agent that stopped or failed", () => {
    expect(canTakeAMessageNow(state({ status: "stopped" }))).toBe(false);
    expect(canTakeAMessageNow(state({ status: "error" }))).toBe(false);
  });
});
