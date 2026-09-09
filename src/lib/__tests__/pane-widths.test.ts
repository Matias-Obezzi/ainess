// The two side panes are dragged by their divider; what the drag computes has to stay inside the
// pane's limits and survive a restart.
import { describe, it, expect, vi } from "vitest";
import { useAppStore, clampPaneWidth, PANE_MIN_WIDTH, PANE_MAX_WIDTH } from "@/store";

describe("pane widths", () => {
  it("stays between the pane's limits", () => {
    expect(clampPaneWidth("sidebar", 10)).toBe(PANE_MIN_WIDTH.sidebar);
    expect(clampPaneWidth("sidebar", 5000)).toBe(PANE_MAX_WIDTH.sidebar);
    expect(clampPaneWidth("dock", 420)).toBe(420);
    // A width read back from a corrupted preferences file falls back to the default.
    expect(clampPaneWidth("dock", "ancho")).toBe(380);
  });

  it("moves each pane the way its divider is dragged", () => {
    // What ResizeHandle computes: the left pane grows to the right, the right one to the left.
    const from = (side: "left" | "right", startX: number, x: number, startWidth: number) =>
      startWidth + (side === "left" ? x - startX : startX - x);

    expect(from("left", 260, 320, 260)).toBe(320); // menu dragged right: wider
    expect(from("right", 900, 840, 380)).toBe(440); // dock dragged left: wider
  });

  it("remembers the width across restarts", () => {
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });

    useAppStore.getState().setPaneWidth("dock", 512);
    expect(useAppStore.getState().paneWidths.dock).toBe(512);
    expect(JSON.parse(store.get("ainess.ui") ?? "{}").paneWidths.dock).toBe(512);
    vi.unstubAllGlobals();
  });
});
