// Which processes a fresh launch may kill. Getting this wrong is not a cosmetic bug: a pid the
// operating system has handed to something else could be the user's own dev server.
import { describe, it, expect } from "vitest";
import { orphansOf } from "@/lib/recovery";
import { INTERRUPTED_OUTPUT } from "@/lib/history";
import type { Run } from "@/types";

const run = (over: Partial<Run>): Run => ({
  id: "r1",
  projectId: "p1",
  agentId: "a1",
  parentRunId: null,
  rootRunId: "r1",
  prompt: "hacé algo",
  status: "running",
  startedAt: 1_000,
  output: "",
  rawLines: [],
  childRunIds: [],
  round: 0,
  process: { pid: 4242, image: "node.exe" },
  ...over,
});

describe("orphansOf", () => {
  it("takes a run the app never saw end", () => {
    expect(orphansOf([run({})])).toEqual([
      { runId: "r1", pid: 4242, image: "node.exe", startedAt: 1_000 },
    ]);
  });

  it("takes one the merge already closed as interrupted", () => {
    const closed = run({ status: "killed", output: INTERRUPTED_OUTPUT });
    expect(orphansOf([closed])).toHaveLength(1);
  });

  it("leaves alone every run that ended on its own", () => {
    expect(orphansOf([
      run({ status: "done", output: "listo" }),
      run({ status: "error", output: "falló" }),
      // Killed on purpose by the user: its process was already stopped.
      run({ status: "killed", output: "[detenido por el usuario]" }),
    ])).toEqual([]);
  });

  it("leaves alone a run from before pids were written down", () => {
    expect(orphansOf([run({ process: undefined })])).toEqual([]);
    expect(orphansOf([run({ process: { pid: 0, image: "node.exe" } })])).toEqual([]);
  });

  it("carries the start time, which is what tells a reused pid apart", () => {
    const [orphan] = orphansOf([run({ startedAt: 1_764_000_000_000 })]);
    expect(orphan.startedAt).toBe(1_764_000_000_000);
    expect(orphan.image).toBe("node.exe");
  });
});
