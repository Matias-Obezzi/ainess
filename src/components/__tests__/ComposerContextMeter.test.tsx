// The ring in the composer's footer: how heavy the target agent's session is, against the point
// where it compacts by itself.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, resetStore } from "@/test/render";
import { useAppStore } from "@/store";
import { translateNow } from "@/i18n/useT";
import type { AgentConfig, Project, Run } from "@/types";

const platform = vi.hoisted(() => ({ remote: false }));
vi.mock("@/lib/platform", () => ({
  isRemoteBuild: () => platform.remote,
  markRemoteBuild: () => { platform.remote = true; },
}));
const compactProject = vi.hoisted(() => vi.fn(() => 1));
vi.mock("@/lib/commands", async original => ({ ...(await original<typeof import("@/lib/commands")>()), compactProject }));

const { Composer } = await import("../shell/Composer");

const boss: AgentConfig = { id: "a1", name: "Jefe", provider: "claude", role: "planner", parentId: null, autoApprove: true };
const project: Project = { id: "p1", name: "P", workspaceDir: "C:/p", createdAt: 1, agents: [boss] };

const run = (contextTokens: number | undefined, projectId = "p1"): Run => ({
  id: `r-${projectId}`, projectId, agentId: "a1", parentRunId: null, rootRunId: `r-${projectId}`, prompt: "x",
  status: "done", startedAt: 1, output: "", rawLines: [], childRunIds: [], round: 0,
  usage: contextTokens === undefined ? undefined : { contextTokens },
});

const ring = (percent: number) => screen.queryByLabelText(translateNow("contextMeter.trigger", { percent }));

describe("Composer's context meter", () => {
  beforeEach(() => {
    resetStore();
    platform.remote = false;
    compactProject.mockClear();
    useAppStore.setState(state => ({
      currentProjectId: "p1",
      currentChatId: null,
      remoteLayout: "desktop",
      runs: { r1: run(100_000) },
      config: {
        ...state.config,
        projects: [project],
        chats: [{ id: "c1", projectId: "p1", name: "Otro", mode: "individual", participants: [{ agentId: "a1", role: "planner" }], createdAt: 1 }],
      },
    }));
  });

  it("shows the share of the compaction threshold when the provider reports it", () => {
    render(<Composer />);
    expect(ring(50)).toBeTruthy();
    expect(document.querySelector("[data-slot='context-meter']")).toBeTruthy();
  });

  it("shows nothing without a reported weight", () => {
    useAppStore.setState({ runs: { r1: run(undefined) } });
    render(<Composer />);
    expect(document.querySelector("[data-slot='context-meter']")).toBeNull();
  });

  it("ignores the weight of another project's runs", () => {
    useAppStore.setState({ runs: { r2: run(100_000, "p2") } });
    render(<Composer />);
    expect(ring(50)).toBeNull();
  });

  it("ignores the weight of the agent's chats", () => {
    useAppStore.setState({ runs: { r1: { ...run(100_000), kind: "chat", chatId: "c1" } } });
    render(<Composer />);
    expect(ring(50)).toBeNull();
  });

  it("is not in a chat", () => {
    useAppStore.setState({ currentChatId: "c1" });
    render(<Composer />);
    expect(ring(50)).toBeNull();
  });

  it("is not on the phone layout", () => {
    platform.remote = true;
    useAppStore.setState({ remoteLayout: "mobile" });
    render(<Composer />);
    expect(ring(50)).toBeNull();
  });

  it("compacts the project from its button once the session is heavy", async () => {
    useAppStore.setState({ runs: { r1: run(180_000) } });
    render(<Composer />);
    fireEvent.click(ring(90)!);
    fireEvent.click(await screen.findByRole("button", { name: translateNow("contextMeter.compact") }));
    expect(compactProject).toHaveBeenCalledWith("p1");
  });
});
