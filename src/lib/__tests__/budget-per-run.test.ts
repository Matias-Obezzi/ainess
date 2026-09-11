// A day's limit does not stop one run from spending the day's limit in one go. This is the ceiling
// that does — and the rules for what it can honestly stop, given that the CLIs only report their
// cost once they are finished.
import { describe, it, expect } from "vitest";
import { runOverCap, capBreachIn, capAllowsContinue } from "@/lib/budget";
import type { Budget, Run } from "@/types";

const budget = (over: Partial<Budget> = {}): Budget => ({ onReached: "block", perRunUsd: 2, ...over });

const run = (id: string, costUsd?: number, rootRunId = "root"): Run => ({
  id,
  projectId: "p1",
  agentId: "a1",
  parentRunId: id === rootRunId ? null : rootRunId,
  rootRunId,
  prompt: "",
  status: "done",
  startedAt: 1,
  output: "",
  rawLines: [],
  childRunIds: [],
  round: 0,
  ...(costUsd === undefined ? {} : { usage: { costUsd } }),
});

describe("runOverCap", () => {
  it("is over when the run cost more than the ceiling", () => {
    expect(runOverCap(run("r", 2.5), budget())).toBe(true);
  });

  it("is not over at exactly the ceiling", () => {
    expect(runOverCap(run("r", 2), budget())).toBe(false);
  });

  // Absence of a number is not a large number: plenty of providers report no cost at all.
  it("is not over when the run reported no cost", () => {
    expect(runOverCap(run("r"), budget())).toBe(false);
  });

  it("is not over when there is no ceiling", () => {
    expect(runOverCap(run("r", 99), budget({ perRunUsd: undefined }))).toBe(false);
    expect(runOverCap(run("r", 99), budget({ perRunUsd: 0 }))).toBe(false);
    expect(runOverCap(run("r", 99), undefined)).toBe(false);
  });
});

describe("capBreachIn", () => {
  // The whole chain: letting the next round start because the expensive run was two rounds ago is
  // how a ceiling stops being one.
  it("finds an expensive run anywhere in the chain", () => {
    const runs = [run("root", 0.1), run("r2", 5), run("r3", 0.2)];
    expect(capBreachIn(runs, "root", budget())?.id).toBe("r2");
  });

  it("counts the root itself", () => {
    expect(capBreachIn([run("root", 9, "root")], "root", budget())?.id).toBe("root");
  });

  it("ignores other chains", () => {
    const runs = [run("other", 9, "other-root")];
    expect(capBreachIn(runs, "root", budget())).toBeUndefined();
  });

  it("finds nothing without a chain or without a ceiling", () => {
    expect(capBreachIn([run("r", 9)], undefined, budget())).toBeUndefined();
    expect(capBreachIn([run("r", 9)], "root", budget({ perRunUsd: undefined }))).toBeUndefined();
  });
});

describe("capAllowsContinue", () => {
  it("stops the chain when the budget blocks", () => {
    expect(capAllowsContinue(run("r", 9), budget({ onReached: "block" }))).toBe(false);
  });

  // A budget set to warn has never stopped anything, and this does not change that.
  it("lets it carry on when the budget only warns", () => {
    expect(capAllowsContinue(run("r", 9), budget({ onReached: "warn" }))).toBe(true);
  });

  it("lets it carry on when nothing went over", () => {
    expect(capAllowsContinue(undefined, budget({ onReached: "block" }))).toBe(true);
  });
});
