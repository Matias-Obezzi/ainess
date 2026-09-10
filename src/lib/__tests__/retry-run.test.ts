import { describe, it, expect } from "vitest";
import { retryModelFor, retryModels } from "../retry";
import type { AgentConfig } from "@/types";

function agent(overrides: Partial<AgentConfig> = {}): AgentConfig {
  return {
    id: "a1",
    name: "Agent",
    provider: "claude",
    role: "implementer",
    parentId: null,
    autoApprove: false,
    ...overrides,
  };
}

describe("retryModels", () => {
  it("offers the provider's default models", () => {
    const models = retryModels(agent({ provider: "claude" }));
    expect(models).toEqual(expect.arrayContaining(["sonnet", "opus", "haiku"]));
  });

  it("includes the agent's own model even when the provider list doesn't have it", () => {
    const models = retryModels(agent({ provider: "claude", model: "my-custom-model" }));
    expect(models).toContain("my-custom-model");
  });

  it("does not repeat the agent's model when it is already in the provider list", () => {
    const models = retryModels(agent({ provider: "claude", model: "sonnet" }));
    expect(models.filter(m => m === "sonnet")).toHaveLength(1);
  });

  // The list belongs to the provider and every agent of that provider reads it. Handing back the
  // original would put it one `sort` away from whoever asked for the models of one retry.
  it("hands back a copy, so a caller cannot rewrite the provider's own list", () => {
    const a = agent();
    const first = retryModels(a);
    first.push("something-invented");
    first.sort();
    expect(retryModels(a)).not.toContain("something-invented");
    expect(retryModels(a)).toEqual(retryModels(agent()));
  });

  it("works for an agent with no model of its own", () => {
    const models = retryModels(agent({ provider: "claude", model: undefined }));
    expect(models).toEqual(expect.arrayContaining(["sonnet", "opus", "haiku"]));
  });
});

describe("retryModelFor", () => {
  it("keeps the previous model when the new agent supports it", () => {
    expect(retryModelFor(agent({ provider: "claude" }), "sonnet")).toBe("sonnet");
  });

  it("keeps the previous model when it is the new agent's own model, absent from the provider list", () => {
    expect(retryModelFor(agent({ provider: "claude", model: "my-custom-model" }), "my-custom-model")).toBe("my-custom-model");
  });

  it("returns undefined when the new agent cannot run the previous model", () => {
    expect(retryModelFor(agent({ provider: "claude" }), "gemini-3.1-pro-high")).toBeUndefined();
  });

  it("returns undefined when there was no previous model", () => {
    expect(retryModelFor(agent({ provider: "claude" }), undefined)).toBeUndefined();
  });

  it("does not break for an agent with no model and no previous model", () => {
    expect(retryModelFor(agent({ provider: "claude", model: undefined }), undefined)).toBeUndefined();
  });
});
