import { describe, it, expect } from "vitest";
import {
  MAX_LINE_CHARS,
  MAX_RUN_RAW_CHARS,
  RUNS_KEEPING_RAW,
  needsTrim,
  trimRawLines,
  trimRunsForDisk,
} from "@/lib/history-trim";

const line = (n: number, fill = "x") => fill.repeat(n);

describe("trimRawLines", () => {
  it("leaves output that is already small alone", () => {
    const lines = ["a", "b", "c"];
    expect(trimRawLines(lines)).toEqual(lines);
  });

  it("cuts a line that is longer than the limit, and says so", () => {
    const [kept] = trimRawLines([line(MAX_LINE_CHARS + 500)]);
    expect(kept.length).toBe(MAX_LINE_CHARS + 1);
    expect(kept.endsWith("…")).toBe(true);
  });

  // The end of a run is what anyone opens the raw view to look at.
  it("keeps the tail, not the head", () => {
    const lines = [];
    for (let i = 0; i < 200; i++) lines.push(`${i}:${line(1000)}`);
    const kept = trimRawLines(lines);
    expect(kept.length).toBeLessThan(lines.length);
    expect(kept[kept.length - 1]).toBe(lines[lines.length - 1]);
    expect(kept[0]).not.toBe(lines[0]);
  });

  it("stays inside the budget for a run", () => {
    const lines = [];
    for (let i = 0; i < 500; i++) lines.push(line(2000));
    const chars = trimRawLines(lines).reduce((a, l) => a + l.length, 0);
    expect(chars).toBeLessThanOrEqual(MAX_RUN_RAW_CHARS + MAX_LINE_CHARS + 1);
  });

  // A run whose every line is enormous used to come back with nothing at all, which reads as a run
  // that printed nothing rather than one that printed too much.
  it("keeps one line even when that line alone is over the budget", () => {
    const kept = trimRawLines([line(MAX_RUN_RAW_CHARS * 3)]);
    expect(kept).toHaveLength(1);
    expect(kept[0].length).toBe(MAX_LINE_CHARS + 1);
  });

  it("handles no output", () => {
    expect(trimRawLines([])).toEqual([]);
  });
});

describe("needsTrim", () => {
  it("says no to output that fits", () => {
    expect(needsTrim(["a", "b"])).toBe(false);
  });

  it("says yes to one long line", () => {
    expect(needsTrim(["a", line(MAX_LINE_CHARS + 1)])).toBe(true);
  });

  it("says yes to many short lines that add up", () => {
    const lines = [];
    for (let i = 0; i < 100; i++) lines.push(line(1000));
    expect(needsTrim(lines)).toBe(true);
  });

  it("agrees with trimRawLines about whether there is work to do", () => {
    const small = ["a", "b", "c"];
    expect(needsTrim(small)).toBe(false);
    expect(trimRawLines(small)).toEqual(small);
  });
});

describe("trimRunsForDisk", () => {
  const runsWith = (count: number) =>
    Array.from({ length: count }, (_, i) => ({ id: `r${i}`, rawLines: ["one", "two"] }));

  it("keeps raw output only for the most recent runs", () => {
    const runs = runsWith(RUNS_KEEPING_RAW + 10);
    const out = trimRunsForDisk(runs, r => r.rawLines);
    expect(out[0].rawLines).toEqual([]);
    expect(out[9].rawLines).toEqual([]);
    expect(out[10].rawLines).toEqual(["one", "two"]);
    expect(out[out.length - 1].rawLines).toEqual(["one", "two"]);
  });

  it("keeps all of them when there are fewer than the limit", () => {
    const out = trimRunsForDisk(runsWith(3), r => r.rawLines);
    expect(out.every(r => r.rawLines.length === 2)).toBe(true);
  });

  // The lines of a live run are held elsewhere, so the caller passes a reader rather than the field.
  it("takes the lines from where the caller says they are", () => {
    const out = trimRunsForDisk([{ id: "r0", rawLines: ["stale"] }], () => ["fresh"]);
    expect(out[0].rawLines).toEqual(["fresh"]);
  });

  it("does not mind a run with no lines anywhere", () => {
    const out = trimRunsForDisk([{ id: "r0", rawLines: undefined }], r => r.rawLines);
    expect(out[0].rawLines).toEqual([]);
  });
});
