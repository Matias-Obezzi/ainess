// `/compact` asks each agent to summarise its own history file and only then drops its session.
//
// The order is the point. With the session alive the agent remembers the work and the summary is
// cheap; the other way round it would have to read the whole file back just to shorten it. So the
// reset waits for the compaction run to end — and it happens even when that run fails, because
// letting go of the session is what `/compact` has always done.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/store";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { attachListeners } from "@/lib/orchestrator";
import { clearSessions, compactProject, compactAgent } from "@/lib/commands";
import type { Run, RunExitEvent } from "@/types";

vi.mock("@/lib/hooks", () => ({ emitHookEvent: async () => {} }));

let emitExit: ((e: RunExitEvent) => void) | undefined;
const written: string[] = [];

/** `con-historial` has a finished run behind it, `sin-historial` has never run. */
const project = {
  id: "p1",
  name: "P",
  workspaceDir: "C:/p",
  createdAt: 1,
  agents: [
    { id: "a1", name: "Con historial", provider: "claude", role: "implementer", parentId: null, autoApprove: true },
    { id: "a2", name: "Sin historial", provider: "claude", role: "implementer", parentId: null, autoApprove: true },
  ],
};

const past: Run = {
  id: "old", projectId: "p1", agentId: "a1", parentRunId: null, rootRunId: "old",
  prompt: "lo de ayer", status: "done", startedAt: 1, output: "listo", rawLines: [],
  childRunIds: [], round: 0,
};

const runs = () => Object.values(useAppStore.getState().runs);
const compactRuns = () => runs().filter(r => r.kind === "compact");
const sessionOf = (agentId: string) => useAppStore.getState().runtime.p1[agentId]?.sessionId;

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
    runs: { old: past },
    messages: [],
    tasks: {},
    runtime: {
      p1: {
        a1: { agentId: "a1", status: "idle", queuedInstructions: [], sessionId: "ses-a1" },
        a2: { agentId: "a2", status: "idle", queuedInstructions: [], sessionId: "ses-a2" },
      },
    },
    binaries: { claude: { path: "claude", version: "1" } },
    config: { ...useAppStore.getState().config, projects: [project] },
  } as never);
});

describe("compactProject", () => {
  it("drops the session of an agent with nothing written down, without starting a run", () => {
    compactProject("p1");
    expect(sessionOf("a2")).toBeUndefined();
    expect(compactRuns().some(r => r.agentId === "a2")).toBe(false);
  });

  it("asks the agent that has a file, and keeps its session until the answer is in", () => {
    const asked = compactProject("p1");
    expect(asked).toBe(1);
    const run = compactRuns().find(r => r.agentId === "a1");
    expect(run?.kind).toBe("compact");
    expect(run?.prompt).toContain(".ainess/history/con-historial-a1.md");
    // Still there: the summary is written out of this very session.
    expect(sessionOf("a1")).toBe("ses-a1");
  });

  it("drops the session once the compaction run ends", () => {
    compactProject("p1");
    const run = compactRuns().find(r => r.agentId === "a1")!;
    emitExit!({ runId: run.id, code: 0, killed: false } as never);
    expect(sessionOf("a1")).toBeUndefined();
    expect(useAppStore.getState().runtime.p1.a1.status).toBe("idle");
  });

  it("drops it even when the compaction fails", () => {
    compactProject("p1");
    const run = compactRuns().find(r => r.agentId === "a1")!;
    emitExit!({ runId: run.id, code: 1, killed: false } as never);
    expect(useAppStore.getState().runs[run.id].status).toBe("error");
    expect(sessionOf("a1")).toBeUndefined();
    // A failure is still visible as a failure.
    expect(useAppStore.getState().runtime.p1.a1.status).toBe("error");
  });
});

describe("compactAgent", () => {
  it("drops the session of an agent with no history file and returns false", () => {
    const asked = compactAgent("p1", "a2");
    expect(asked).toBe(false);
    expect(sessionOf("a2")).toBeUndefined();
    expect(compactRuns().some(r => r.agentId === "a2")).toBe(false);
  });

  it("starts a compaction run for an agent with a history file and returns true", () => {
    const asked = compactAgent("p1", "a1");
    expect(asked).toBe(true);
    const run = compactRuns().find(r => r.agentId === "a1");
    expect(run?.kind).toBe("compact");
    expect(sessionOf("a1")).toBe("ses-a1");
  });
});

describe("a compaction run", () => {
  it("is not written to the history it has just rewritten, and opens no card", () => {
    compactProject("p1");
    const run = compactRuns().find(r => r.agentId === "a1")!;
    emitExit!({ runId: run.id, code: 0, killed: false } as never);
    expect(written.some(p => p.includes("history"))).toBe(false);
    expect(useAppStore.getState().tasks.p1 ?? []).toHaveLength(0);
  });

  it("says nothing to the user as a result", () => {
    compactProject("p1");
    const run = compactRuns().find(r => r.agentId === "a1")!;
    emitExit!({ runId: run.id, code: 0, killed: false } as never);
    expect(useAppStore.getState().messages.some(m => m.kind === "result")).toBe(false);
  });
});

// `/clear` is the same command without the summary: every agent lets go of its session where it
// stands, nothing is written and nothing runs.
describe("clearSessions", () => {
  it("drops the session of every agent of the project and says how many", () => {
    expect(clearSessions("p1")).toBe(2);
    expect(sessionOf("a1")).toBeUndefined();
    expect(sessionOf("a2")).toBeUndefined();
  });

  it("starts no run, not even for the agent that has a history file", () => {
    const before = runs().length;
    clearSessions("p1");
    expect(runs()).toHaveLength(before);
    expect(compactRuns()).toHaveLength(0);
  });
});
