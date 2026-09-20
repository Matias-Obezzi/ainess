import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/store";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { attachListeners, startRun } from "@/lib/orchestrator";
import { COMPACT_AT_TOKENS, shouldCompact } from "@/lib/session-weight";
import type { Run, RunExitEvent } from "@/types";

vi.mock("@/lib/hooks", () => ({ emitHookEvent: async () => {} }));

describe("shouldCompact", () => {
  const makeRun = (opts: Partial<Run> = {}): Run => ({
    id: "r1",
    projectId: "p1",
    agentId: "a1",
    parentRunId: null,
    rootRunId: "r1",
    prompt: "do work",
    status: "done",
    startedAt: 1,
    output: "done",
    rawLines: [],
    childRunIds: [],
    round: 0,
    ...opts,
  });

  it("returns true when contextTokens exceeds the threshold", () => {
    const run = makeRun({ usage: { contextTokens: COMPACT_AT_TOKENS + 10_000 } });
    expect(shouldCompact(run)).toBe(true);
  });

  it("returns true when contextTokens equals the threshold", () => {
    const run = makeRun({ usage: { contextTokens: COMPACT_AT_TOKENS } });
    expect(shouldCompact(run)).toBe(true);
  });

  it("returns false when contextTokens is below the threshold", () => {
    const run = makeRun({ usage: { contextTokens: COMPACT_AT_TOKENS - 1 } });
    expect(shouldCompact(run)).toBe(false);
  });

  it("returns false when contextTokens is missing or undefined", () => {
    const run = makeRun({ usage: { inputTokens: 100 } });
    expect(shouldCompact(run)).toBe(false);
  });

  it("returns false when usage is missing completely", () => {
    const run = makeRun();
    expect(shouldCompact(run)).toBe(false);
  });

  it("returns false when the run itself has kind compact even if contextTokens is heavy", () => {
    const run = makeRun({ kind: "compact", usage: { contextTokens: 300_000 } });
    expect(shouldCompact(run)).toBe(false);
  });

  it("respects a custom threshold when passed", () => {
    const run = makeRun({ usage: { contextTokens: 50_000 } });
    expect(shouldCompact(run, 40_000)).toBe(true);
    expect(shouldCompact(run, 60_000)).toBe(false);
  });
});

describe("auto-compaction on run finish", () => {
  let emitExit: ((e: RunExitEvent) => void) | undefined;
  const written: string[] = [];

  const project = {
    id: "p1",
    name: "Project",
    workspaceDir: "C:/p",
    createdAt: 1,
    agents: [
      { id: "a1", name: "Worker", provider: "claude", role: "implementer", parentId: null, autoApprove: true },
    ],
  };

  const pastRun: Run = {
    id: "past",
    projectId: "p1",
    agentId: "a1",
    parentRunId: null,
    rootRunId: "past",
    prompt: "previous turn",
    status: "done",
    startedAt: 1,
    output: "done",
    rawLines: [],
    childRunIds: [],
    round: 0,
  };

  const runs = () => Object.values(useAppStore.getState().runs);
  const compactRuns = () => runs().filter(r => r.kind === "compact");
  const sessionOf = (agentId: string) => useAppStore.getState().runtime.p1?.[agentId]?.sessionId;

  beforeEach(async () => {
    written.length = 0;
    setTransport({
      ...nullTransport,
      spawnRun: async () => {},
      writeFileAbs: async (path: string) => { written.push(path); },
      onRunExit: async (h: (e: RunExitEvent) => void) => { emitExit = h; return () => {}; },
    } as never);
    await attachListeners();
    useAppStore.setState({
      runs: { past: pastRun },
      messages: [],
      tasks: {},
      runtime: {
        p1: {
          a1: { agentId: "a1", status: "idle", queuedInstructions: [], sessionId: "ses-a1" },
        },
      },
      binaries: { claude: { path: "claude", version: "1" } },
      config: { ...useAppStore.getState().config, projects: [project] },
    } as never);
  });

  it("triggers compaction and adds a system message when conversation got heavy", () => {
    const runId = startRun({
      agentId: "a1",
      projectId: "p1",
      prompt: "heavy task",
      parentRunId: null,
      round: 0,
    })!;

    // Simulate run output with heavy context
    useAppStore.setState(state => ({
      runs: {
        ...state.runs,
        [runId]: {
          ...state.runs[runId],
          usage: { contextTokens: 250_000 },
        },
      },
    }));

    // Finish the run
    emitExit!({ runId, code: 0, killed: false } as never);

    // Auto-compaction started a new compact run
    const compRuns = compactRuns();
    expect(compRuns.length).toBe(1);
    expect(compRuns[0].agentId).toBe("a1");
    expect(compRuns[0].kind).toBe("compact");

    // System message was added
    const systemMsgs = useAppStore.getState().messages.filter(m => m.kind === "system");
    expect(systemMsgs.length).toBeGreaterThan(0);
    const compactMsg = systemMsgs.find(m => m.text.includes("Worker"));
    expect(compactMsg).toBeDefined();
    expect(compactMsg?.text).toMatch(/250[.,]000/);
  });

  it("does NOT trigger compaction when a compaction run itself exceeds the threshold (breaks loop)", () => {
    // Start a compaction run
    const compactRunId = startRun({
      agentId: "a1",
      projectId: "p1",
      prompt: "summarize history",
      parentRunId: null,
      round: 0,
      kind: "compact",
      resume: true,
    })!;

    // Even if this compaction run somehow has heavy contextTokens
    useAppStore.setState(state => ({
      runs: {
        ...state.runs,
        [compactRunId]: {
          ...state.runs[compactRunId],
          usage: { contextTokens: 250_000 },
        },
      },
    }));

    // Compaction run finishes
    emitExit!({ runId: compactRunId, code: 0, killed: false } as never);

    // Should NOT launch another compaction run: only the one we started exists
    expect(compactRuns().length).toBe(1);
    // The session was dropped as expected
    expect(sessionOf("a1")).toBeUndefined();
  });

  it("does NOT trigger compaction when contextTokens is below threshold", () => {
    const runId = startRun({
      agentId: "a1",
      projectId: "p1",
      prompt: "light task",
      parentRunId: null,
      round: 0,
    })!;

    useAppStore.setState(state => ({
      runs: {
        ...state.runs,
        [runId]: {
          ...state.runs[runId],
          usage: { contextTokens: 100_000 },
        },
      },
    }));

    emitExit!({ runId, code: 0, killed: false } as never);

    expect(compactRuns().length).toBe(0);
    // Session is still open
    expect(sessionOf("a1")).toBe("ses-a1");
  });

  it("does NOT trigger compaction when agent has no open session", () => {
    // Clear session first
    useAppStore.setState(state => ({
      runtime: {
        ...state.runtime,
        p1: {
          ...state.runtime.p1,
          a1: { ...state.runtime.p1.a1, sessionId: undefined },
        },
      },
    }));

    const runId = startRun({
      agentId: "a1",
      projectId: "p1",
      prompt: "first task",
      parentRunId: null,
      round: 0,
    })!;

    useAppStore.setState(state => ({
      runs: {
        ...state.runs,
        [runId]: {
          ...state.runs[runId],
          usage: { contextTokens: 250_000 },
        },
      },
    }));

    emitExit!({ runId, code: 0, killed: false } as never);

    expect(compactRuns().length).toBe(0);
  });
});
