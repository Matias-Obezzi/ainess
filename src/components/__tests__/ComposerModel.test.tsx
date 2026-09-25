// What the composer says about the model it will run on: the phone's collapsed picker has to
// wear the name of the model it hides, and a chat has to name the model of everyone in it.
import { describe, it, expect, beforeEach, afterEach, vi } from "vitest";
import { render, screen, fireEvent, resetStore } from "@/test/render";
import { useAppStore } from "@/store";
import { translateNow } from "@/i18n/useT";
import type { AgentConfig, Chat, Project } from "@/types";

// `isRemoteBuild` is a flag the entry point sets once and never clears, so the phone layout can
// only be reached from a test by standing in for the module.
const platform = vi.hoisted(() => ({ remote: false }));
vi.mock("@/lib/platform", () => ({
  isRemoteBuild: () => platform.remote,
  markRemoteBuild: () => { platform.remote = true; },
}));

const { Composer } = await import("../shell/Composer");

const planner: AgentConfig = {
  id: "a1",
  name: "Claude Code",
  provider: "claude",
  role: "planner",
  parentId: null,
  autoApprove: true,
};

const implementer: AgentConfig = {
  id: "a2",
  name: "Antigravity",
  provider: "antigravity",
  role: "implementer",
  parentId: "a1",
  model: "gemini-3.1-pro-high",
  autoApprove: true,
};

const project: Project = {
  id: "p1",
  name: "Test Project",
  workspaceDir: "C:/test",
  createdAt: 1000,
  agents: [planner, implementer],
};

const chat = (participants: Chat["participants"]): Chat => ({
  id: "c1",
  projectId: "p1",
  name: "Chat 1",
  mode: "individual",
  participants,
  createdAt: 1000,
});

const tDefaultModel = translateNow("composer.defaultModel");

function setUpProject(over: Partial<{ chats: Chat[]; currentChatId: string | null }> = {}) {
  useAppStore.setState(state => ({
    currentProjectId: "p1",
    currentChatId: over.currentChatId ?? null,
    config: { ...state.config, projects: [project], chats: over.chats ?? [] },
  }));
}

describe("Composer - the model it runs on", () => {
  beforeEach(() => {
    resetStore();
    platform.remote = false;
    window.HTMLElement.prototype.hasPointerCapture = () => false;
    window.HTMLElement.prototype.setPointerCapture = () => {};
    window.HTMLElement.prototype.releasePointerCapture = () => {};
    window.HTMLElement.prototype.scrollIntoView = () => {};
  });

  afterEach(() => {
    platform.remote = false;
  });

  it("on a phone, the button that opens the picker says the default model when none is chosen", () => {
    platform.remote = true;
    setUpProject();

    render(<Composer />);

    const button = screen.getByRole("button", { name: translateNow("composer.pickModel") });
    expect(button.textContent).toContain(tDefaultModel);
  });

  it("on a phone, the button that opens the picker says the name of the chosen model", () => {
    platform.remote = true;
    setUpProject();
    useAppStore.setState({
      // The label and the id differ on purpose: the button has to be reading the list, not the id.
      models: { claude: [{ id: "claude-opus-5", label: "Opus 5" }] },
      composerModels: { "project:p1": "claude-opus-5" },
    });

    render(<Composer />);

    const button = screen.getByRole("button", { name: translateNow("composer.pickModel") });
    expect(button.textContent).toContain("Opus 5");
    expect(button.textContent).not.toContain(tDefaultModel);
  });

  it("in a chat it names the member and the model it runs on", () => {
    setUpProject({ chats: [chat([{ agentId: "a2", role: "engineer" }])], currentChatId: "c1" });

    render(<Composer />);

    expect(screen.getByText("Antigravity")).toBeDefined();
    const model = screen.getByRole("combobox", { name: translateNow("composer.modelOf", { name: "Antigravity" }) });
    expect(model.textContent).toContain("gemini-3.1-pro-high");
    // The member itself is not a control: nothing to pick another one with, and nothing to type
    // a model into either — the select is the whole of it.
    expect(screen.queryAllByRole("combobox")).toHaveLength(1);
    expect(screen.queryByPlaceholderText(translateNow("composer.typeModel"))).toBeNull();
  });

  it("falls back to the default-model wording for an agent with no model of its own", () => {
    setUpProject({ chats: [chat([{ agentId: "a1", role: "engineer" }])], currentChatId: "c1" });

    render(<Composer />);

    const model = screen.getByRole("combobox", { name: translateNow("composer.modelOf", { name: "Claude Code" }) });
    expect(model.textContent).toContain(tDefaultModel);
  });

  it("names every participant of a chat with more than one", () => {
    setUpProject({
      chats: [chat([
        { agentId: "a1", role: "engineer" },
        // The chat was created pinning a model of its own: that is the one that runs, not a2's.
        { agentId: "a2", role: "reviewer", model: "gemini-3.8-flash-high" },
      ])],
      currentChatId: "c1",
    });

    render(<Composer />);

    expect(
      screen.getByRole("combobox", { name: translateNow("composer.modelOf", { name: "Claude Code" }) }).textContent,
    ).toContain(tDefaultModel);
    expect(
      screen.getByRole("combobox", { name: translateNow("composer.modelOf", { name: "Antigravity" }) }).textContent,
    ).toContain("gemini-3.8-flash-high");
  });

  it("writes the model picked in a chat onto that participant, and leaves the others alone", () => {
    setUpProject({
      chats: [chat([
        { agentId: "a1", role: "engineer" },
        { agentId: "a2", role: "reviewer", model: "gemini-3.8-flash-high" },
      ])],
      currentChatId: "c1",
    });
    useAppStore.setState({ models: { claude: [{ id: "claude-opus-5", label: "Opus 5" }] } });

    render(<Composer />);

    const model = screen.getByRole("combobox", { name: translateNow("composer.modelOf", { name: "Claude Code" }) });
    fireEvent.keyDown(model, { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: "Opus 5" }));

    const participants = useAppStore.getState().config.chats[0].participants;
    expect(participants[0].model).toBe("claude-opus-5");
    expect(participants[1].model).toBe("gemini-3.8-flash-high");
  });

  it("picking the default model again clears the one that was pinned", () => {
    setUpProject({
      chats: [chat([{ agentId: "a2", role: "engineer", model: "gemini-3.8-flash-high" }])],
      currentChatId: "c1",
    });

    render(<Composer />);

    const model = screen.getByRole("combobox", { name: translateNow("composer.modelOf", { name: "Antigravity" }) });
    fireEvent.keyDown(model, { key: "ArrowDown" });
    fireEvent.click(screen.getByRole("option", { name: tDefaultModel }));

    expect(useAppStore.getState().config.chats[0].participants[0].model).toBeUndefined();
  });
});
