// Tests for store.rememberModel: remembers hand-typed models per provider,
// trimming whitespace, deduplicating against static and dynamic models,
// prioritizing the newest entry and capping at 10 items.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/store";
import { PROVIDERS } from "@/lib/providers";

const S = () => useAppStore.getState();

beforeEach(() => {
  useAppStore.setState({
    config: {
      ...S().config,
      rememberedModels: {},
    },
    models: {},
  });
});

describe("rememberModel", () => {
  it("trims whitespace from the model id", () => {
    S().rememberModel("claude", "  my-custom-model  ");
    expect(S().config.rememberedModels?.claude).toEqual(["my-custom-model"]);
  });

  it("ignores empty or whitespace-only strings", () => {
    S().rememberModel("claude", "");
    S().rememberModel("claude", "   ");
    expect(S().config.rememberedModels?.claude).toBeUndefined();
  });

  it("ignores ids already present in the provider's static models list", () => {
    const staticId = PROVIDERS.claude.models[0].id;
    S().rememberModel("claude", staticId);
    expect(S().config.rememberedModels?.claude).toBeUndefined();
  });

  it("ignores ids already present in the provider's dynamic models list", () => {
    useAppStore.setState({
      models: {
        antigravity: [{ id: "dynamic-gemini", label: "Dynamic Gemini" }],
      },
    });

    S().rememberModel("antigravity", "dynamic-gemini");
    expect(S().config.rememberedModels?.antigravity).toBeUndefined();
  });

  it("puts the most recently remembered model first", () => {
    S().rememberModel("claude", "model-1");
    S().rememberModel("claude", "model-2");
    S().rememberModel("claude", "model-3");

    expect(S().config.rememberedModels?.claude).toEqual([
      "model-3",
      "model-2",
      "model-1",
    ]);

    // Re-adding model-1 moves it to the front
    S().rememberModel("claude", "model-1");
    expect(S().config.rememberedModels?.claude).toEqual([
      "model-1",
      "model-3",
      "model-2",
    ]);
  });

  it("caps remembered models at 10 per provider", () => {
    for (let i = 1; i <= 15; i++) {
      S().rememberModel("ollama", `custom-ollama-${i}`);
    }

    const list = S().config.rememberedModels?.ollama ?? [];
    expect(list).toHaveLength(10);
    // Most recent (15 down to 6)
    expect(list[0]).toBe("custom-ollama-15");
    expect(list[9]).toBe("custom-ollama-6");
  });
});

describe("ensureModels", () => {
  it("calls refreshModels for askable provider with detected binary when older than 10m", async () => {
    const refreshSpy = vi.fn().mockResolvedValue([]);
    useAppStore.setState({
      binaries: {
        antigravity: { path: "C:/bin/agy.exe" },
      },
      modelsFetchedAt: {},
      refreshModels: refreshSpy,
    });

    await S().ensureModels("antigravity");
    expect(refreshSpy).toHaveBeenCalledWith("antigravity");
  });

  it("skips non-askable provider like claude", async () => {
    const refreshSpy = vi.fn().mockResolvedValue([]);
    useAppStore.setState({
      binaries: {
        claude: { path: "C:/bin/claude.exe" },
      },
      modelsFetchedAt: {},
      refreshModels: refreshSpy,
    });

    await S().ensureModels("claude");
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("skips askable provider when binary path is missing", async () => {
    const refreshSpy = vi.fn().mockResolvedValue([]);
    useAppStore.setState({
      binaries: {
        ollama: null,
      },
      modelsFetchedAt: {},
      refreshModels: refreshSpy,
    });

    await S().ensureModels("ollama");
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("skips refresh when last fetch was less than 10 minutes ago", async () => {
    const refreshSpy = vi.fn().mockResolvedValue([]);
    useAppStore.setState({
      binaries: {
        opencode: { path: "C:/bin/opencode.exe" },
      },
      modelsFetchedAt: {
        opencode: Date.now() - 5 * 60 * 1000,
      },
      refreshModels: refreshSpy,
    });

    await S().ensureModels("opencode");
    expect(refreshSpy).not.toHaveBeenCalled();
  });

  it("reuses in-flight promise when called concurrently", async () => {
    let resolveRefresh: (val: unknown) => void = () => {};
    const refreshSpy = vi.fn().mockImplementation(() => new Promise(r => { resolveRefresh = r; }));
    useAppStore.setState({
      binaries: {
        ollama: { path: "C:/bin/ollama.exe" },
      },
      modelsFetchedAt: {},
      refreshModels: refreshSpy,
    });

    const p1 = S().ensureModels("ollama");
    const p2 = S().ensureModels("ollama");
    expect(refreshSpy).toHaveBeenCalledTimes(1);
    resolveRefresh([]);
    await Promise.all([p1, p2]);
  });
});
