import { describe, it, expect } from "vitest";
import { resolvedModel, costPerMillion } from "@/lib/model-cost";
import type { Run } from "@/types";

const makeRun = (opts: Partial<Run> = {}): Run => ({
  id: "r1",
  projectId: "p1",
  agentId: "a1",
  parentRunId: null,
  rootRunId: "r1",
  prompt: "test prompt",
  status: "done",
  startedAt: 1000,
  output: "done",
  rawLines: [],
  childRunIds: [],
  round: 0,
  ...opts,
});

describe("resolvedModel", () => {
  it("returns undefined without data or when agent has no runs", () => {
    expect(resolvedModel([], "a1")).toBeUndefined();
    expect(resolvedModel([makeRun({ agentId: "other" })], "a1")).toBeUndefined();
    expect(resolvedModel([makeRun({ agentId: "a1", usage: undefined })], "a1")).toBeUndefined();
    expect(resolvedModel([makeRun({ agentId: "a1", usage: { byModel: {} } })], "a1")).toBeUndefined();
  });

  it("takes the most recent run and not the first", () => {
    const olderRun = makeRun({
      id: "r-old",
      startedAt: 1000,
      usage: {
        byModel: {
          "claude-sonnet-5": { inputTokens: 500, outputTokens: 500 },
        },
      },
    });
    const newerRun = makeRun({
      id: "r-new",
      startedAt: 2000,
      usage: {
        byModel: {
          "claude-opus-5": { inputTokens: 100, outputTokens: 100 },
        },
      },
    });

    // Regardless of array order, picks the most recent run (startedAt 2000)
    expect(resolvedModel([olderRun, newerRun], "a1")).toBe("claude-opus-5");
    expect(resolvedModel([newerRun, olderRun], "a1")).toBe("claude-opus-5");
  });

  it("chooses the dominant model when a single run uses multiple models", () => {
    const run = makeRun({
      usage: {
        byModel: {
          "claude-haiku-4-5-20251001": { inputTokens: 200, outputTokens: 100, cachedInputTokens: 50 }, // 350 tokens
          "claude-opus-5": { inputTokens: 500, outputTokens: 400, cachedInputTokens: 1000 }, // 1900 tokens
        },
      },
    });
    expect(resolvedModel([run], "a1")).toBe("claude-opus-5");
  });

  it("supports runs passed as Record<string, Run>", () => {
    const run = makeRun({
      usage: {
        byModel: {
          "claude-opus-5": { inputTokens: 100, outputTokens: 100 },
        },
      },
    });
    expect(resolvedModel({ [run.id]: run }, "a1")).toBe("claude-opus-5");
  });
});

describe("costPerMillion", () => {
  it("computes cost per million with round numbers easily verifiable by hand", () => {
    // Run 1: 100,000 tokens (50k input + 30k output + 20k cache), cost $1.50
    // Run 2: 200,000 tokens (100k input + 50k output + 50k cache), cost $3.00
    // Total tokens = 300,000. Total cost = $4.50.
    // Cost per million = ($4.50 / 300,000) * 1,000,000 = $15.00
    const runs = [
      makeRun({
        id: "r1",
        usage: {
          byModel: {
            "claude-opus-5": { inputTokens: 50_000, outputTokens: 30_000, cachedInputTokens: 20_000, costUsd: 1.5 },
          },
        },
      }),
      makeRun({
        id: "r2",
        usage: {
          byModel: {
            "claude-opus-5": { inputTokens: 100_000, outputTokens: 50_000, cachedInputTokens: 50_000, costUsd: 3.0 },
            "claude-sonnet-5": { inputTokens: 500_000, outputTokens: 500_000, costUsd: 3.0 },
          },
        },
      }),
    ];

    expect(costPerMillion(runs, "claude-opus-5")).toBe(15);
    // Sonnet: $3.00 / 1,000,000 tokens * 1,000,000 = $3.00
    expect(costPerMillion(runs, "claude-sonnet-5")).toBe(3);
  });

  it("returns undefined when there are no tokens or no cost", () => {
    expect(costPerMillion([], "claude-opus-5")).toBeUndefined();

    // Model exists in byModel but has 0 tokens
    const zeroTokensRun = makeRun({
      usage: {
        byModel: {
          "claude-opus-5": { inputTokens: 0, outputTokens: 0, costUsd: 1.0 },
        },
      },
    });
    expect(costPerMillion([zeroTokensRun], "claude-opus-5")).toBeUndefined();

    // Model exists with tokens but has no costUsd or 0 cost
    const noCostRun = makeRun({
      usage: {
        byModel: {
          "claude-opus-5": { inputTokens: 1000, outputTokens: 1000 },
        },
      },
    });
    expect(costPerMillion([noCostRun], "claude-opus-5")).toBeUndefined();

    const zeroCostRun = makeRun({
      usage: {
        byModel: {
          "claude-opus-5": { inputTokens: 1000, outputTokens: 1000, costUsd: 0 },
        },
      },
    });
    expect(costPerMillion([zeroCostRun], "claude-opus-5")).toBeUndefined();
  });

  it("supports runs passed as Record<string, Run>", () => {
    const run = makeRun({
      usage: {
        byModel: {
          "claude-opus-5": { inputTokens: 500_000, outputTokens: 500_000, costUsd: 15 },
        },
      },
    });
    expect(costPerMillion({ [run.id]: run }, "claude-opus-5")).toBe(15);
  });
});
