import { describe, it, expect } from "vitest";
import { trimMessagesInMemory, trimRunsInMemory } from "@/lib/history";
import type { CommMessage, Run } from "@/types";

const msg = (id: string, projectId: string, ts: number): CommMessage => ({
  id,
  ts,
  projectId,
  fromAgentId: "a1",
  kind: "text",
  text: id,
});

/** The feed used to grow for as long as the app stayed open; it is now capped per project. */
describe("trimMessagesInMemory", () => {
  it("leaves a feed that fits untouched, and the same array", () => {
    const messages = [msg("1", "p1", 1), msg("2", "p2", 2)];
    expect(trimMessagesInMemory(messages)).toBe(messages);
  });

  it("keeps the newest per project and counts each project on its own", () => {
    const many: CommMessage[] = [];
    for (let i = 0; i < 3200; i++) many.push(msg(`p1-${i}`, "p1", i));
    // A quiet project must not lose anything because a noisy one filled up.
    many.push(msg("p2-only", "p2", 9999));

    const trimmed = trimMessagesInMemory(many);
    const p1 = trimmed.filter(m => m.projectId === "p1");
    const p2 = trimmed.filter(m => m.projectId === "p2");

    expect(p1).toHaveLength(3000);
    expect(p1[0].id).toBe("p1-200");
    expect(p1[p1.length - 1].id).toBe("p1-3199");
    expect(p2).toHaveLength(1);
  });

  it("keeps the original order", () => {
    const many: CommMessage[] = [];
    for (let i = 0; i < 3100; i++) many.push(msg(`m-${i}`, "p1", i));
    const trimmed = trimMessagesInMemory(many);
    const timestamps = trimmed.map(m => m.ts);
    expect([...timestamps].sort((a, b) => a - b)).toEqual(timestamps);
  });
});

const run = (id: string, projectId: string, endedAt: number | undefined, rawLines: number, status: Run["status"] = "done"): Run => ({
  id,
  projectId,
  agentId: "a1",
  parentRunId: null,
  rootRunId: id,
  prompt: "",
  status,
  startedAt: endedAt ?? 0,
  endedAt,
  output: "",
  rawLines: Array.from({ length: rawLines }, (_, i) => `line ${i}`),
  childRunIds: [],
  round: 0,
});

/** Finished runs used to pile up in memory with their whole raw buffer. */
describe("trimRunsInMemory", () => {
  it("keeps the newest 300 finished runs of that project and leaves other projects alone", () => {
    const runs: Record<string, Run> = {};
    for (let i = 0; i < 320; i++) runs[`p1-${i}`] = run(`p1-${i}`, "p1", i, 10);
    runs["p2-1"] = run("p2-1", "p2", 5, 10);

    const trimmed = trimRunsInMemory(runs, "p1");
    const kept = Object.values(trimmed).filter(r => r.projectId === "p1");

    expect(kept).toHaveLength(300);
    expect(trimmed["p1-0"]).toBeUndefined();
    expect(trimmed["p1-319"]).toBeDefined();
    expect(trimmed["p2-1"]).toBeDefined();
  });

  it("cuts the raw lines of a finished run but never of one still going", () => {
    const runs: Record<string, Run> = {
      done: run("done", "p1", 1, 900),
      live: run("live", "p1", undefined, 900, "running"),
    };
    const trimmed = trimRunsInMemory(runs, "p1");
    expect(trimmed.done.rawLines).toHaveLength(300);
    expect(trimmed.done.rawLines[299]).toBe("line 899");
    expect(trimmed.live.rawLines).toHaveLength(900);
  });

  it("returns the same object when there is nothing to trim", () => {
    const runs: Record<string, Run> = { a: run("a", "p1", 1, 10) };
    expect(trimRunsInMemory(runs, "p1")).toBe(runs);
  });
});
