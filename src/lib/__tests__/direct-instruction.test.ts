// Writing to an agent yourself. It reads the same prompt whether the work came from its planner or
// from you, and an implementer that answered by delegating left the app waiting for a team that
// was never coming.
import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "@/lib/providers";
import { childFor, noneLand } from "@/lib/orchestrator";
import type { AgentConfig } from "@/types";

const agent = (over: Partial<AgentConfig>): AgentConfig => ({
  id: "a1",
  name: "Implementer 1",
  provider: "claude",
  role: "implementer",
  parentId: "p1",
  autoApprove: false,
  ...over,
});

const extras = { skills: [], sharedContext: "" };

describe("a message from the user", () => {
  it("tells the agent who it is and that the message is yours", () => {
    const prompt = buildSystemPrompt(agent({}), [], { ...extras, fromUser: true });
    expect(prompt).toContain("Implementer 1");
    // Its role, in the user's language, and the order not to hand the work on.
    expect(prompt.toLowerCase()).toMatch(/implementador|implementer/);
    expect(prompt).toMatch(/no deleg|do not delegate/i);
  });

  it("does not tell a planner to stop delegating: that is its job", () => {
    const prompt = buildSystemPrompt(agent({ role: "planner", parentId: null }), [], { ...extras, fromUser: true });
    expect(prompt).not.toMatch(/no deleg|do not delegate/i);
  });

  it("keeps the role's own prompt underneath", () => {
    const prompt = buildSystemPrompt(agent({}), [], { ...extras, fromUser: true });
    const plain = buildSystemPrompt(agent({}), [], extras);
    // Everything the agent used to be told is still there, with the header on top.
    expect(prompt.endsWith(plain)).toBe(true);
  });

  it("says nothing extra when the work came from its planner", () => {
    const prompt = buildSystemPrompt(agent({}), [], extras);
    expect(prompt).not.toContain("Implementer 1");
  });
});

describe("a delegation that names nobody", () => {
  const children = [agent({ id: "c1", name: "Antigravity" })];

  it("finds the child however it was written", () => {
    expect(childFor(children, "antigravity")?.id).toBe("c1");
    expect(childFor(children, "c1")?.id).toBe("c1");
  });

  it("says nobody is coming when not one of them is under this agent", () => {
    expect(noneLand([{ agent: "Copilot", task: "algo" }], children)).toBe(true);
    // One that does land is enough to be waiting for somebody.
    expect(noneLand([{ agent: "Copilot", task: "algo" }, { agent: "Antigravity", task: "otra" }], children)).toBe(false);
  });
});
