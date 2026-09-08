// A hook's "applies to": one field where there were two. An agent belongs to exactly one project,
// so the pair could only ever agree — or contradict each other and never fire.
import { describe, it, expect } from "vitest";
import { scopeOf, filterOf } from "@/components/HookDialog";
import type { Hook } from "@/types";

const hook = (filter?: Hook["filter"]): Hook => ({
  id: "h1",
  name: "un hook",
  event: "task.finished",
  enabled: true,
  action: { type: "notify", title: "t", template: "x" },
  filter,
});

describe("the scope of a hook", () => {
  it("goes out and comes back the same", () => {
    expect(filterOf(scopeOf(hook({ agentId: "a1" })))).toEqual({ agentId: "a1" });
    expect(filterOf(scopeOf(hook({ projectId: "p1" })))).toEqual({ projectId: "p1" });
    expect(filterOf(scopeOf(hook()))).toBeUndefined();
  });

  it("keeps the agent of a hook that was saved with both", () => {
    // The old dialog could store the two; the agent is the narrower of them and implies the other.
    expect(scopeOf(hook({ agentId: "a1", projectId: "p1" }))).toBe("agent:a1");
  });

  it("reads a filter nobody set as everything", () => {
    expect(scopeOf(undefined)).toBe("all");
    expect(scopeOf(hook({}))).toBe("all");
  });
});
