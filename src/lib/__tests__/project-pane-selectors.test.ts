// A pane asks the store "what is project X showing?", not "what is on screen?".
//
// Step one of putting several projects on screen at once: every per-project map already existed,
// but each component looked its own entry up and made up its own default. These selectors are the
// single answer, and what is pinned here is the default — a project nobody has opened yet, which
// is what a second pane starts as.
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore, selectProjectMode, selectProjectChatId, selectProjectPanels, selectPanelOpen } from "@/store";

const S = () => useAppStore.getState();

beforeEach(() => {
  useAppStore.setState({
    currentProjectId: null,
    projectModes: {},
    projectChats: {},
    projectPanels: {},
    projectMode: "chat",
    currentChatId: null,
    commPanelOpen: false,
    diffPanelOpen: false,
    termPanelOpen: false,
  });
});

describe("a project with nothing remembered", () => {
  it("is on its board", () => {
    expect(selectProjectMode(S(), "never-opened")).toBe("tasks");
  });

  it("is on its orchestrator thread, not on the focused pane's chat", () => {
    useAppStore.setState({ currentProjectId: "a", currentChatId: "chat-of-a" });
    expect(selectProjectChatId(S(), "never-opened")).toBeNull();
  });

  it("has its whole dock closed, whatever the focused pane has open", () => {
    useAppStore.setState({ currentProjectId: "a", commPanelOpen: true, termPanelOpen: true });
    expect(selectProjectPanels(S(), "never-opened")).toEqual({ comm: false, diff: false, term: false });
  });
});

describe("a project that was left somewhere", () => {
  it("gives back its own view, chat and dock", () => {
    useAppStore.setState({
      currentProjectId: "a",
      projectModes: { b: "graph" },
      projectChats: { b: "chat-of-b" },
      projectPanels: { b: { comm: false, diff: true, term: false } },
    });

    expect(selectProjectMode(S(), "b")).toBe("graph");
    expect(selectProjectChatId(S(), "b")).toBe("chat-of-b");
    expect(selectProjectPanels(S(), "b")).toEqual({ comm: false, diff: true, term: false });
    expect(selectPanelOpen(S(), "b", "diff")).toBe(true);
    expect(selectPanelOpen(S(), "b", "term")).toBe(false);
  });

  it("keeps two projects apart", () => {
    useAppStore.setState({ projectModes: { a: "chat", b: "graph" } });
    expect(selectProjectMode(S(), "a")).toBe("chat");
    expect(selectProjectMode(S(), "b")).toBe("graph");
  });
});

describe("the focused project", () => {
  // The three scalars are its copy of the maps. They are what an older build's saved prefs restore
  // when the maps are still empty, so they are also the fallback for the project holding the focus.
  it("falls back to the scalars when the maps know nothing about it", () => {
    useAppStore.setState({
      currentProjectId: "a",
      projectMode: "graph",
      currentChatId: "chat-of-a",
      commPanelOpen: true,
    });

    expect(selectProjectMode(S(), "a")).toBe("graph");
    expect(selectProjectChatId(S(), "a")).toBe("chat-of-a");
    expect(selectProjectPanels(S(), "a")).toEqual({ comm: true, diff: false, term: false });
  });

  it("is what no project at all means", () => {
    useAppStore.setState({ projectMode: "graph", currentChatId: "loose-chat" });
    expect(selectProjectMode(S(), null)).toBe("graph");
    expect(selectProjectChatId(S(), null)).toBe("loose-chat");
  });
});

describe("writing to a project that is not the focused one", () => {
  it("moves its view without moving the one on screen", () => {
    useAppStore.setState({ currentProjectId: "a", projectMode: "chat", projectModes: { a: "chat" } });

    S().setProjectMode("graph", "b");

    expect(S().projectModes.b).toBe("graph");
    expect(S().projectMode).toBe("chat");
    expect(S().projectModes.a).toBe("chat");
  });

  it("opens its dock without opening the one on screen", () => {
    useAppStore.setState({ currentProjectId: "a" });

    S().toggleDiffPanel(true, "b");

    expect(S().projectPanels.b).toEqual({ comm: false, diff: true, term: false });
    expect(S().diffPanelOpen).toBe(false);
  });

  it("toggles off what that project itself had, not what the screen has", () => {
    useAppStore.setState({
      currentProjectId: "a",
      termPanelOpen: true,
      projectPanels: { b: { comm: false, diff: false, term: true } },
    });

    S().toggleTermPanel(undefined, "b");

    expect(S().projectPanels.b.term).toBe(false);
    expect(S().termPanelOpen).toBe(true);
  });

  it("opens a chat in it without leaving the one on screen", () => {
    useAppStore.setState({ currentProjectId: "a", currentChatId: "chat-of-a" });

    S().setCurrentChat("chat-of-b", "b");

    expect(S().projectChats.b).toBe("chat-of-b");
    expect(S().currentChatId).toBe("chat-of-a");
  });
});
