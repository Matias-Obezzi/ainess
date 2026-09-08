import { describe, it, expect } from "vitest";
import { delegationNeedsApproval } from "../approvals";

describe("delegationNeedsApproval", () => {
  it("uses the global setting when the agent override is undefined", () => {
    expect(delegationNeedsApproval({ requireApproval: undefined }, true)).toBe(true);
    expect(delegationNeedsApproval({ requireApproval: undefined }, false)).toBe(false);
  });

  it("prioritizes the agent override when it is false (never ask)", () => {
    // Even if global is true, agent being false means we don't ask
    expect(delegationNeedsApproval({ requireApproval: false }, true)).toBe(false);
    expect(delegationNeedsApproval({ requireApproval: false }, false)).toBe(false);
  });

  it("prioritizes the agent override when it is true (always ask)", () => {
    // Even if global is false, agent being true means we must ask
    expect(delegationNeedsApproval({ requireApproval: true }, false)).toBe(true);
    expect(delegationNeedsApproval({ requireApproval: true }, true)).toBe(true);
  });
});
