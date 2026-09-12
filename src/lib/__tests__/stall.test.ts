// A stuck agent looks like a thinking one. The silence since its last line is what tells them apart.
import { describe, it, expect, beforeEach } from "vitest";
import { forgetStall, lastOutputAt, resetStalls, silenceMs, stalledRuns, touchRun } from "@/lib/stall";

const run = (id: string, startedAt: number) => ({ id, startedAt });

beforeEach(() => resetStalls());

describe("silenceMs", () => {
  it("counts from the last line, or from the start when there was none", () => {
    expect(silenceMs(1_000, 0, 5_000)).toBe(4_000);
    expect(silenceMs(undefined, 2_000, 5_000)).toBe(3_000);
  });

  it("never goes negative", () => {
    expect(silenceMs(9_000, 0, 5_000)).toBe(0);
  });
});

describe("stalledRuns", () => {
  it("names a run that has been quiet long enough, once", () => {
    touchRun("r1", 0);
    expect(stalledRuns([run("r1", 0)], 100, 50).map(r => r.id)).toEqual(["r1"]);
    // The next look says nothing new.
    expect(stalledRuns([run("r1", 0)], 200, 50)).toEqual([]);
  });

  it("leaves a run that printed recently alone", () => {
    touchRun("r1", 90);
    expect(stalledRuns([run("r1", 0)], 100, 50)).toEqual([]);
  });

  it("uses the start for a run that has printed nothing at all", () => {
    expect(stalledRuns([run("quiet", 0)], 100, 50).map(r => r.id)).toEqual(["quiet"]);
  });

  it("forgets a run that ended, so its id can be announced again if reused", () => {
    touchRun("r1", 0);
    stalledRuns([run("r1", 0)], 100, 50);
    forgetStall("r1");
    expect(lastOutputAt("r1")).toBeUndefined();
    expect(stalledRuns([run("r1", 0)], 100, 50).map(r => r.id)).toEqual(["r1"]);
  });
});
