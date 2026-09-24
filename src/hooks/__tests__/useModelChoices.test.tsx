import { describe, it, expect, beforeEach, vi } from "vitest";
import { renderHook, act } from "@testing-library/react";
import { useModelChoices } from "@/hooks/useModelChoices";
import { useAppStore } from "@/store";
import { resetStore } from "@/test/render";
import { PROVIDERS } from "@/lib/providers";

describe("useModelChoices", () => {
  beforeEach(() => {
    resetStore();
  });

  it("returns empty array when provider is undefined", () => {
    const { result } = renderHook(() => useModelChoices(undefined));
    expect(result.current).toEqual([]);
  });

  it("calls ensureModels when provider is supplied", () => {
    const ensureSpy = vi.fn().mockResolvedValue(undefined);
    useAppStore.setState({ ensureModels: ensureSpy });

    renderHook(() => useModelChoices("antigravity"));
    expect(ensureSpy).toHaveBeenCalledWith("antigravity");
  });

  it("combines dynamic models with remembered models", () => {
    useAppStore.setState({
      models: {
        antigravity: [{ id: "dynamic-1", label: "Dynamic 1" }],
      },
      config: {
        ...useAppStore.getState().config,
        rememberedModels: {
          antigravity: ["custom-model-1"],
        },
      },
    });

    const { result } = renderHook(() => useModelChoices("antigravity"));
    expect(result.current).toEqual([
      { id: "dynamic-1", label: "Dynamic 1" },
      { id: "custom-model-1", label: "custom-model-1" },
    ]);
  });

  it("updates reactively when rememberedModels changes in store", () => {
    const { result } = renderHook(() => useModelChoices("claude"));
    const initialChoices = result.current;
    expect(initialChoices).toEqual(PROVIDERS.claude.models);

    act(() => {
      useAppStore.getState().rememberModel("claude", "claude-custom-special");
    });

    expect(result.current).toEqual([
      ...PROVIDERS.claude.models,
      { id: "claude-custom-special", label: "claude-custom-special" },
    ]);
  });
});
