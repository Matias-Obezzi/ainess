// A history file is read again only when it changed.
//
// Every save merged the file first, and the poll merged it every five seconds: megabytes read,
// carried across and parsed, nearly always to find what was already in memory.
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { saveHistory } from "@/lib/history";

let reads = 0;
let disk: string | null = null;
let version = 0;

beforeEach(() => {
  reads = 0;
  disk = null;
  version = 0;
  setTransport({
    ...nullTransport,
    readTextFile: async () => { reads++; return disk; },
    writeTextFile: async (path: string, content: string) => { disk = content; version++; return path; },
    configFileStamp: async () => (disk === null ? null : `v${version}`),
  } as never);
  useAppStore.setState({
    runs: {},
    messages: [],
    questions: {},
    approvals: {},
    config: { ...useAppStore.getState().config, projects: [{ id: "p-stamp", name: "P", workspaceDir: "C:/p", createdAt: 1, agents: [] }] },
  } as never);
});

describe("saving history", () => {
  it("does not read back the file it just wrote", async () => {
    await saveHistory("p-stamp");
    const afterFirst = reads;
    await saveHistory("p-stamp");
    await saveHistory("p-stamp");
    expect(reads).toBe(afterFirst);
  });

  it("reads it when somebody else wrote it", async () => {
    await saveHistory("p-stamp");
    const before = reads;
    // Another process (the CLI) writes the file: its stamp moves.
    version++;
    await saveHistory("p-stamp");
    expect(reads).toBe(before + 1);
  });
});

describe("a restart in the middle of delegated work", () => {
  it("brings its card back to you instead of leaving it working for good", async () => {
    const { loadHistory } = await import("@/lib/history");
    const { createTask } = await import("@/lib/tasks");
    const live = {
      id: "cut", projectId: "p-stamp", agentId: "a1", parentRunId: "root", rootRunId: "root",
      prompt: "hacé tu parte", status: "running", startedAt: 1, output: "", rawLines: [], childRunIds: [], round: 1,
    };
    disk = JSON.stringify({ version: 1, runs: [live], messages: [], approvals: [], questions: [] });
    useAppStore.setState({
      runs: {},
      tasks: { "p-stamp": [createTask({ id: "card", projectId: "p-stamp", title: "su parte", status: "working", runId: "cut" })] },
    } as never);

    await loadHistory("p-stamp");

    expect(useAppStore.getState().runs.cut.status).toBe("killed");
    expect(useAppStore.getState().tasks["p-stamp"][0].status).toBe("needs-you");
  });
});
