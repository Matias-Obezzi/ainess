// The right dock belongs to the project you are in.
//
// The bug: opening the terminals panel in one project and walking into another left it open there
// too, showing an empty panel above an empty tab bar — the panel was global state describing
// something that is not. What is pinned here is that the flags follow the project both ways: put
// away when you leave, taken out again when you come back, and off for a project that never had it.
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";

const panels = () => {
  const s = useAppStore.getState();
  return { comm: s.commPanelOpen, diff: s.diffPanelOpen, term: s.termPanelOpen };
};

beforeEach(() => {
  useAppStore.setState({
    currentProjectId: null,
    projectPanels: {},
    commPanelOpen: false,
    diffPanelOpen: false,
    termPanelOpen: false,
  });
});

describe("the dock follows the project", () => {
  it("remembers what one project had open", () => {
    useAppStore.setState({ currentProjectId: "a" });
    useAppStore.getState().toggleTermPanel(true);

    expect(useAppStore.getState().projectPanels.a).toEqual({ comm: false, diff: false, term: true });
  });

  it("does not carry it into the next project", () => {
    useAppStore.setState({ currentProjectId: "a" });
    useAppStore.getState().toggleTermPanel(true);

    useAppStore.getState().setCurrentProject("b");
    expect(panels()).toEqual({ comm: false, diff: false, term: false });
  });

  it("gives it back on the way home", () => {
    useAppStore.setState({ currentProjectId: "a" });
    useAppStore.getState().toggleTermPanel(true);
    useAppStore.getState().toggleCommPanel(true);

    useAppStore.getState().setCurrentProject("b");
    useAppStore.getState().setCurrentProject("a");
    expect(panels()).toEqual({ comm: true, diff: false, term: true });
  });

  it("keeps the two projects apart", () => {
    useAppStore.setState({ currentProjectId: "a" });
    useAppStore.getState().toggleTermPanel(true);

    useAppStore.getState().setCurrentProject("b");
    useAppStore.getState().toggleDiffPanel(true);

    const saved = useAppStore.getState().projectPanels;
    expect(saved.a).toEqual({ comm: false, diff: false, term: true });
    expect(saved.b).toEqual({ comm: false, diff: true, term: false });
  });

  it("closing is remembered too, not just opening", () => {
    useAppStore.setState({ currentProjectId: "a" });
    useAppStore.getState().toggleTermPanel(true);
    useAppStore.getState().toggleTermPanel(false);

    useAppStore.getState().setCurrentProject("b");
    useAppStore.getState().setCurrentProject("a");
    expect(panels().term).toBe(false);
  });

  it("writes nothing down while no project is open", () => {
    useAppStore.getState().toggleCommPanel(true);
    expect(useAppStore.getState().projectPanels).toEqual({});
  });
});
