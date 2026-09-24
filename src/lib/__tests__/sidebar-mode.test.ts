// The left rail has two shapes now, one shortcut that walks them, and one rule that picks a
// shape for you: the first time two projects are on screen at once, the menu gets out of the way.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAppStore, nextSidebarMode, sanitizeSidebarMode } from "@/store";

/** A localStorage that lives in this test, so what was written can be read back. */
function fakeStorage() {
  const store = new Map<string, string>();
  vi.stubGlobal("localStorage", {
    getItem: (k: string) => store.get(k) ?? null,
    setItem: (k: string, v: string) => void store.set(k, v),
    removeItem: (k: string) => void store.delete(k),
  });
  return store;
}

describe("sidebar mode", () => {
  beforeEach(() => {
    vi.unstubAllGlobals();
    useAppStore.setState({ sidebarMode: "expanded", openProjects: [], currentProjectId: null });
  });

  it("walks the two shapes in one direction", () => {
    expect(nextSidebarMode("expanded")).toBe("collapsed");
    expect(nextSidebarMode("collapsed")).toBe("expanded");

    // Ctrl+B and the title bar button are both this, so two presses are where you started.
    const start = useAppStore.getState().sidebarMode;
    for (let i = 0; i < 2; i++) useAppStore.getState().cycleSidebar();
    expect(useAppStore.getState().sidebarMode).toBe(start);
  });

  it("remembers the shape across restarts", () => {
    const store = fakeStorage();
    useAppStore.getState().setSidebarMode("collapsed");
    expect(JSON.parse(store.get("ainess.ui") ?? "{}").sidebarMode).toBe("collapsed");

    useAppStore.getState().cycleSidebar();
    expect(JSON.parse(store.get("ainess.ui") ?? "{}").sidebarMode).toBe("expanded");
    vi.unstubAllGlobals();
  });

  it("collapses itself when the screen splits in two, and only then", () => {
    const setPanes = (ids: string[]) => useAppStore.setState({ openProjects: ids });

    // One pane: the menu is the only navigation there is, so it stays as it was.
    setPanes(["p1"]);
    expect(useAppStore.getState().sidebarMode).toBe("expanded");

    // The first split takes the width the second project needs.
    useAppStore.getState().openProjectInPane("p2");
    expect(useAppStore.getState().openProjects).toEqual(["p1", "p2"]);
    expect(useAppStore.getState().sidebarMode).toBe("collapsed");

    // Opened again by hand, it is a decision and not a default: a third pane does not undo it.
    useAppStore.getState().setSidebarMode("expanded");
    useAppStore.getState().openProjectInPane("p3");
    expect(useAppStore.getState().openProjects).toEqual(["p1", "p2", "p3"]);
    expect(useAppStore.getState().sidebarMode).toBe("expanded");
  });

  it("leaves a collapsed menu collapsed when the screen splits", () => {
    useAppStore.setState({ sidebarMode: "collapsed", openProjects: ["p1"] });
    useAppStore.getState().openProjectInPane("p2");
    expect(useAppStore.getState().sidebarMode).toBe("collapsed");
  });

  it("reads back what a past build wrote into the two states that remain", () => {
    expect(sanitizeSidebarMode("expanded", undefined)).toBe("expanded");
    expect(sanitizeSidebarMode("collapsed", undefined)).toBe("collapsed");
    // 0.22.0 allowed hiding the rail completely; that now collapses to avatars.
    expect(sanitizeSidebarMode("hidden", undefined)).toBe("collapsed");
    // Before the strip existed there were two states, and closed meant gone; now collapsed.
    expect(sanitizeSidebarMode(undefined, false)).toBe("collapsed");
    expect(sanitizeSidebarMode(undefined, true)).toBe("expanded");
    expect(sanitizeSidebarMode("nonsense", undefined)).toBe("expanded");
    expect(sanitizeSidebarMode(undefined, undefined)).toBe("expanded");
  });
});
