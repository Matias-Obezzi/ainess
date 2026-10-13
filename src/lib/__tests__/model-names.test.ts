// The model a planner names in a delegation: what the CLI reported counts, and so does the name it shows.
import { describe, it, expect } from "vitest";
import { providerModels, resolveModelName, setDiscoveredModels } from "@/lib/providers";

describe("resolveModelName", () => {
  it("takes the id or the label the CLI reported, and nothing it cannot run", () => {
    setDiscoveredModels("antigravity", [{ id: "claude-opus-5-5-high", label: "Claude Opus 5.5 (High)" }]);
    expect(resolveModelName("antigravity", "Claude Opus 5.5 (High)")).toBe("claude-opus-5-5-high");
    expect(resolveModelName("antigravity", "claude-opus-5-5-high")).toBe("claude-opus-5-5-high");
    expect(resolveModelName("antigravity", "claude-opus-4-6-thinking")).toBeUndefined();
    expect(resolveModelName("antigravity", "mine", "mine")).toBe("mine");
  });

  it("falls back to the built-in list when the CLI was never asked", () => {
    expect(providerModels("claude").map(m => m.id)).toContain("claude-opus-5-5");
  });
});
