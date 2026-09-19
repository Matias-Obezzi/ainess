// The panes as state: what is open, which one has the focus, and the one rule that holds them
// together — the focused project is always in a pane.
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";

const S = () => useAppStore.getState();

beforeEach(() => {
  useAppStore.setState({
    currentProjectId: "a",
    openProjects: ["a"],
    currentChatId: null,
    projectModes: {},
    projectChats: {},
    projectPanels: {},
    projectMode: "chat",
    screen: "project",
    config: {
      ...S().config,
      projects: ["a", "b", "c", "d", "e"].map(id => ({
        id, name: id, workspaceDir: `C:/work/${id}`, createdAt: 0, agents: [],
      })),
    },
  });
});

describe("opening a project in a new pane", () => {
  it("puts it beside the one already there and gives it the focus", () => {
    S().openProjectInPane("b");

    expect(S().openProjects).toEqual(["a", "b"]);
    expect(S().currentProjectId).toBe("b");
  });

  it("only focuses a project that is already on screen", () => {
    S().openProjectInPane("b");
    S().openProjectInPane("a");

    expect(S().openProjects).toEqual(["a", "b"]);
    expect(S().currentProjectId).toBe("a");
  });

  it("stops at four panes", () => {
    for (const id of ["b", "c", "d"]) S().openProjectInPane(id);

    expect(S().openProjects).toEqual(["a", "b", "c", "d"]);
  });

  it("opens over the focused pane once there is no room for a fifth", () => {
    // The sidebar greys the option out at this point; asked for anyway, it is a plain open.
    for (const id of ["b", "c", "d"]) S().openProjectInPane(id);

    S().openProjectInPane("e");

    expect(S().openProjects).toEqual(["a", "b", "c", "e"]);
    expect(S().currentProjectId).toBe("e");
  });
});

describe("opening a project the way everything else does", () => {
  it("opens it over the pane with the focus, as it always did", () => {
    S().openProjectInPane("b");
    S().openProject("c");

    expect(S().openProjects).toEqual(["a", "c"]);
    expect(S().currentProjectId).toBe("c");
  });

  it("just focuses one that is already in a pane", () => {
    S().openProjectInPane("b");
    S().openProject("a");

    expect(S().openProjects).toEqual(["a", "b"]);
    expect(S().currentProjectId).toBe("a");
  });
});

describe("closing a pane", () => {
  it("takes it off the screen", () => {
    S().openProjectInPane("b");
    S().closeProjectPane("b");

    expect(S().openProjects).toEqual(["a"]);
    expect(S().currentProjectId).toBe("a");
  });

  it("hands the focus to the pane that slid into its place", () => {
    S().openProjectInPane("b");
    S().openProjectInPane("c");
    S().focusProjectPane("b");

    S().closeProjectPane("b");

    expect(S().openProjects).toEqual(["a", "c"]);
    expect(S().currentProjectId).toBe("c");
  });

  it("hands the focus left when the rightmost pane closes", () => {
    S().openProjectInPane("b");
    S().openProjectInPane("c");

    S().closeProjectPane("c");

    expect(S().openProjects).toEqual(["a", "b"]);
    expect(S().currentProjectId).toBe("b");
  });

  it("leaves the focus alone when another pane closes", () => {
    S().openProjectInPane("b");
    S().focusProjectPane("a");

    S().closeProjectPane("b");

    expect(S().currentProjectId).toBe("a");
  });

  it("does not close the last one", () => {
    S().closeProjectPane("a");

    expect(S().openProjects).toEqual(["a"]);
    expect(S().currentProjectId).toBe("a");
  });

  it("ignores a project that is not on screen", () => {
    S().openProjectInPane("b");
    S().closeProjectPane("c");

    expect(S().openProjects).toEqual(["a", "b"]);
  });
});

describe("focusing a pane", () => {
  it("moves the focus and brings that project's view and chat to the scalars", () => {
    S().openProjectInPane("b");
    useAppStore.setState({ projectModes: { a: "graph", b: "chat" }, projectChats: { a: "chat-of-a" } });

    S().focusProjectPane("a");

    expect(S().currentProjectId).toBe("a");
    expect(S().projectMode).toBe("graph");
    expect(S().currentChatId).toBe("chat-of-a");
  });

  it("does nothing for a project with no pane", () => {
    S().focusProjectPane("b");

    expect(S().currentProjectId).toBe("a");
    expect(S().openProjects).toEqual(["a"]);
  });
});

describe("the focused project is always in a pane", () => {
  it("holds when a project is set current from outside the shell", () => {
    S().setCurrentProject("b");

    expect(S().openProjects).toEqual(["b"]);
    expect(S().currentProjectId).toBe("b");
  });

  it("holds when nothing had the focus yet", () => {
    useAppStore.setState({ currentProjectId: null, openProjects: [] });

    S().setCurrentProject("c");

    expect(S().openProjects).toEqual(["c"]);
  });
});

describe("what a restart makes of the saved panes", () => {
  // `runInit` is where this happens; the rule it applies is the one pinned here.
  const rebuild = (saved: string[], exists: string[], focused: string | null): string[] => {
    const open = saved.filter(id => exists.includes(id));
    if (focused && !open.includes(focused)) open.unshift(focused);
    return open.slice(0, 4);
  };

  it("drops projects that no longer exist", () => {
    expect(rebuild(["a", "deleted", "b"], ["a", "b"], "a")).toEqual(["a", "b"]);
  });

  it("falls back to the focused project when nothing usable was saved", () => {
    expect(rebuild([], ["a"], "a")).toEqual(["a"]);
    expect(rebuild(["gone", "also-gone"], ["a"], "a")).toEqual(["a"]);
  });

  it("is empty when there is no project to fall back to either", () => {
    expect(rebuild(["gone"], [], null)).toEqual([]);
  });
});

describe("deleting a project", () => {
  it("takes its pane with it and leaves the focus on what is left", () => {
    S().openProjectInPane("b");
    expect(S().currentProjectId).toBe("b");

    S().removeProject("b");

    expect(S().openProjects).toEqual(["a"]);
    expect(S().currentProjectId).toBe("a");
    expect(S().screen).toBe("project");
  });

  it("goes home when it was the only pane", () => {
    S().removeProject("a");

    expect(S().openProjects).toEqual([]);
    expect(S().currentProjectId).toBeNull();
    expect(S().screen).toBe("home");
  });
});
