// Which models a provider really has: what its CLI or its session reports, and what a planner may name.
import { describe, it, expect } from "vitest";
import { providerModels, resolveModelName, setDiscoveredModels } from "@/lib/providers";
import { parseCopilotModels } from "@/lib/quota";
import { sessionModels } from "@/lib/acp/session";

describe("resolveModelName", () => {
  it("takes the id or the label the CLI reported, and nothing it cannot run", () => {
    setDiscoveredModels("antigravity", [{ id: "claude-opus-5-5-high", label: "Claude Opus 5.5 (High)" }]);
    expect(resolveModelName("antigravity", "Claude Opus 5.5 (High)")).toBe("claude-opus-5-5-high");
    expect(resolveModelName("antigravity", "claude-opus-5-5-high")).toBe("claude-opus-5-5-high");
    expect(resolveModelName("antigravity", "claude-opus-4-6-thinking")).toBeUndefined();
    expect(resolveModelName("antigravity", "mine", "mine")).toBe("mine");
  });

  it("falls back to the built-in list when nothing was reported", () => {
    expect(providerModels("claude").map(m => m.id)).toContain("claude-opus-5-5");
  });
});

describe("reported models", () => {
  it("reads copilot's model values from `copilot help config`", () => {
    const help = [
      '  `logLevel`: log level for CLI; defaults to "default". Set to "all" for debug logging.',
      "",
      "  `model`: AI model to use for Copilot CLI; can be changed with /model command or --model flag option.",
      '    - "claude-sonnet-5"',
      '    - "gpt-5.5"',
      "",
      "  `contextTier`: context window tier.",
      '    - Can also be set with --context flag',
    ].join("\r\n");
    expect(parseCopilotModels(help).map(m => m.id)).toEqual(["auto", "claude-sonnet-5", "gpt-5.5"]);
    expect(parseCopilotModels("no such section")).toEqual([]);
  });

  it("takes the models of a session's model select, without its default", () => {
    const models = sessionModels([{
      id: "model", name: "Model", type: "select", currentValue: "default",
      options: [
        { value: "default", name: "Default (recommended)" },
        { value: "opus[1m]", name: "Opus 5.5" },
        { value: "haiku", name: "Haiku 4.5" },
      ],
    }] as never);
    expect(models).toEqual([{ id: "opus[1m]", label: "Opus 5.5" }, { id: "haiku", label: "Haiku 4.5" }]);
    expect(sessionModels(undefined)).toEqual([]);
  });
});
