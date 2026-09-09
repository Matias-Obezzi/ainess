import { describe, test, expect, vi, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { getTransport } from "@/lib/transport";

vi.mock("@/lib/transport", () => ({
  getTransport: vi.fn(),
  isTauri: () => false,
}));

describe("terminals per project", () => {
  beforeEach(() => {
    useAppStore.setState(useAppStore.getInitialState());
    vi.mocked(getTransport).mockReturnValue({
      ptyKill: vi.fn().mockResolvedValue(undefined),
      deleteFile: vi.fn().mockResolvedValue(undefined),
    } as any);
  });

  test("openTerminal and closeTerminal respect activeTerminalIds", async () => {
    useAppStore.setState({ 
      shells: [{ id: "sh1", path: "/bin/sh", label: "sh" }],
      currentProjectId: "proj1",
    });

    useAppStore.getState().openTerminal();
    let state = useAppStore.getState();
    expect(state.terminals.length).toBe(1);
    const term1Id = state.terminals[0].id;
    expect(state.activeTerminalIds["proj1"]).toBe(term1Id);

    useAppStore.setState({ currentProjectId: "proj2" });
    useAppStore.getState().openTerminal();
    state = useAppStore.getState();
    expect(state.terminals.length).toBe(2);
    const term2Id = state.terminals[1].id;
    expect(state.activeTerminalIds["proj2"]).toBe(term2Id);

    // activeTerminalIds should keep both
    expect(state.activeTerminalIds["proj1"]).toBe(term1Id);
    expect(state.activeTerminalIds["proj2"]).toBe(term2Id);

    // closing proj2 terminal
    useAppStore.getState().closeTerminal(term2Id);
    state = useAppStore.getState();
    expect(state.terminals.length).toBe(1);
    expect(state.activeTerminalIds["proj2"]).toBeNull();
    expect(state.activeTerminalIds["proj1"]).toBe(term1Id);
  });

  test("removeProject detaches its terminals instead of killing them", () => {
    useAppStore.setState({
      shells: [{ id: "sh1", path: "/bin/sh", label: "sh" }],
      currentProjectId: "proj1",
      config: { ...useAppStore.getState().config, projects: [{ id: "proj1", name: "P1", createdAt: 0, agents: [], workspaceDir: "/test" }] }
    });

    useAppStore.getState().openTerminal();
    const term1 = useAppStore.getState().terminals[0];

    useAppStore.getState().removeProject("proj1");
    const state = useAppStore.getState();
    // The shell may be running something: deleting a project is not a reason to kill it. It loses
    // its project and shows up on the home screen, where a terminal with no project belongs.
    expect(state.terminals.length).toBe(1);
    expect(state.terminals[0].id).toBe(term1.id);
    expect(state.terminals[0].projectId).toBeNull();
    expect(state.activeTerminalIds["proj1"]).toBeUndefined();
    expect(getTransport().ptyKill).not.toHaveBeenCalledWith(term1.id);
  });
});
