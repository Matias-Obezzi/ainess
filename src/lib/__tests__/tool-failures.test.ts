import { describe, expect, it } from "vitest";
import { bumpToolFailure, REPEATED_FAILURE_AT } from "../tool-failures";

describe("tool-failures", () => {
  it("counts failures per run and tool without mixing", () => {
    const counts = new Map<string, number>();
    
    expect(bumpToolFailure(counts, "run1", "toolA")).toBe(1);
    expect(bumpToolFailure(counts, "run1", "toolA")).toBe(2);
    expect(bumpToolFailure(counts, "run1", "toolA")).toBe(3);
    
    // Different tool, same run
    expect(bumpToolFailure(counts, "run1", "toolB")).toBe(1);
    
    // Same tool, different run
    expect(bumpToolFailure(counts, "run2", "toolA")).toBe(1);
    
    expect(REPEATED_FAILURE_AT).toBe(3);
  });
});
