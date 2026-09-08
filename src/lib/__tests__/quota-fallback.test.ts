// A child that ran out of quota did not fail at the work, and the parent has to be able to tell
// the difference — otherwise it re-delegates onto the same exhausted model.
import { describe, it, expect } from "vitest";
import { outOfQuota, alternativeModels } from "@/lib/quota";

describe("outOfQuota", () => {
  it("knows how each CLI says it", () => {
    expect(outOfQuota("Error: quota reached for gemini-3.1-pro-high. Resets in 3h20m")).toBe(true);
    expect(outOfQuota("Claude usage limit reached. Your limit will reset at 5pm.")).toBe(true);
    expect(outOfQuota("You are out of premium requests for this month")).toBe(true);
    expect(outOfQuota("429: rate limit exceeded")).toBe(true);
    expect(outOfQuota("insufficient credits on this account")).toBe(true);
  });

  it("does not read an ordinary failure as one", () => {
    expect(outOfQuota("TypeError: cannot read properties of undefined")).toBe(false);
    expect(outOfQuota("2 tests failed")).toBe(false);
    expect(outOfQuota("")).toBe(false);
    // The word on its own is not the situation: a task can be *about* quotas.
    expect(outOfQuota("Añadí un contador de quota al dashboard")).toBe(false);
  });
});

describe("alternativeModels", () => {
  it("leaves out the model that ran out and the rest of its family", () => {
    const left = alternativeModels("antigravity", "gemini-3.1-pro-high");
    expect(left).not.toContain("gemini-3.1-pro-high");
    expect(left.some(m => m.startsWith("gemini"))).toBe(false);
    // The other pool of the same CLI is exactly what it should switch to.
    expect(left.some(m => m.startsWith("claude"))).toBe(true);
  });

  it("offers everything the CLI has when the spent model is unknown", () => {
    expect(alternativeModels("claude", undefined).length).toBeGreaterThan(0);
  });

  it("has nothing to offer for a CLI whose model is not ours to choose", () => {
    expect(alternativeModels("gemini", "whatever")).toEqual([]);
  });
});
