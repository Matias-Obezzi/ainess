// A project answers to one orchestrator. The rule lives where teams are edited, so the shapes that
// break the app cannot be saved in the first place.
import { describe, it, expect } from "vitest";
import { rootPlannerClash } from "@/lib/team";
import type { AgentConfig } from "@/types";

const a = (over: Partial<AgentConfig>): AgentConfig => ({
  id: "x",
  name: "Alguien",
  provider: "claude",
  role: "implementer",
  parentId: null,
  autoApprove: false,
  ...over,
});

const boss = a({ id: "boss", name: "Orchestrator", role: "planner", parentId: null });

describe("rootPlannerClash", () => {
  it("catches a second orchestrator at the root", () => {
    expect(rootPlannerClash([boss], { id: "new", role: "planner", parentId: null })?.id).toBe("boss");
  });

  it("is happy once it hangs off the first", () => {
    expect(rootPlannerClash([boss], { id: "new", role: "planner", parentId: "boss" })).toBeUndefined();
  });

  it("says nothing about the other roles", () => {
    expect(rootPlannerClash([boss], { id: "new", role: "implementer", parentId: null })).toBeUndefined();
    expect(rootPlannerClash([boss], { id: "new", role: "reviewer", parentId: null })).toBeUndefined();
    expect(rootPlannerClash([boss], { id: "new", role: "custom", parentId: null })).toBeUndefined();
  });

  it("does not catch the orchestrator on itself while it is being edited", () => {
    expect(rootPlannerClash([boss], { id: "boss", role: "planner", parentId: null })).toBeUndefined();
  });

  it("ignores a planner that is somebody's child", () => {
    const sub = a({ id: "sub", role: "planner", parentId: "boss" });
    expect(rootPlannerClash([sub], { id: "new", role: "planner", parentId: null })).toBeUndefined();
  });
});
