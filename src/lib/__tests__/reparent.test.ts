// Moving an agent under another planner. The hierarchy graph and the agent editor both ask this,
// which is why it is one function and not two that drift apart.
import { describe, it, expect } from "vitest";
import { descendantsOf, reparentProblem } from "@/lib/team";
import type { AgentConfig } from "@/types";

const agent = (id: string, parentId: string | null, role: AgentConfig["role"] = "implementer"): AgentConfig => ({
  id,
  name: id,
  provider: "claude",
  role,
  parentId,
  autoApprove: true,
});

// boss ─┬─ impl1 ─── sub
//       └─ impl2
const roster: AgentConfig[] = [
  agent("boss", null, "planner"),
  agent("impl1", "boss"),
  agent("sub", "impl1"),
  agent("impl2", "boss"),
];

describe("descendantsOf", () => {
  it("includes the agent itself", () => {
    expect(descendantsOf(roster, "impl2")).toEqual(new Set(["impl2"]));
  });

  it("goes all the way down", () => {
    expect(descendantsOf(roster, "boss")).toEqual(new Set(["boss", "impl1", "sub", "impl2"]));
  });

  // A team that already has a ring in it (written by hand, or by a bad merge) must not hang the walk.
  it("comes back from a team that already loops", () => {
    const looped = [agent("a", "b"), agent("b", "a")];
    expect(descendantsOf(looped, "a")).toEqual(new Set(["a", "b"]));
  });
});

describe("reparentProblem", () => {
  it("allows a plain move", () => {
    expect(reparentProblem(roster, "sub", "impl2")).toBeUndefined();
  });

  it("allows moving an implementer to the top", () => {
    expect(reparentProblem(roster, "impl2", null)).toBeUndefined();
  });

  it("refuses an agent reporting to itself", () => {
    expect(reparentProblem(roster, "impl1", "impl1")).toBe("self");
  });

  // The one that would break the app rather than the team: the tree walk would never come back out.
  it("refuses a ring", () => {
    expect(reparentProblem(roster, "impl1", "sub")).toBe("cycle");
    expect(reparentProblem(roster, "boss", "sub")).toBe("cycle");
  });

  // A project answers to one orchestrator; a second planner goes under the first.
  it("refuses a second planner at the top", () => {
    const withSecond = [...roster, agent("planner2", "boss", "planner")];
    expect(reparentProblem(withSecond, "planner2", null)).toBe("root-planner-clash");
  });

  it("lets the only planner stay at the top", () => {
    expect(reparentProblem(roster, "boss", null)).toBeUndefined();
  });

  it("refuses an agent or a parent that is not on the team", () => {
    expect(reparentProblem(roster, "ghost", "boss")).toBe("unknown");
    expect(reparentProblem(roster, "impl1", "ghost")).toBe("unknown");
  });
});
