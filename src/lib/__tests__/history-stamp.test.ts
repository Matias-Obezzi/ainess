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
