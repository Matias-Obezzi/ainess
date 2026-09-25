// The strip of saved orders above the box, and the button that folds it away: one click from the
// box is the point of the strip, but a row of them over a conversation you are reading is a row
// you are not using. Whether it is folded survives a restart, so it lives in the UI preferences.
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, resetStore } from "@/test/render";
import { Composer } from "../shell/Composer";
import { useAppStore } from "@/store";
import { translateNow } from "@/i18n/useT";
import type { AgentConfig, Preset, Project } from "@/types";

const planner: AgentConfig = {
  id: "a1",
  name: "Claude Code",
  provider: "claude",
  role: "planner",
  parentId: null,
  autoApprove: true,
};

const project: Project = {
  id: "p1",
  name: "Test Project",
  workspaceDir: "C:/test",
  createdAt: 1000,
  agents: [planner],
};

const preset: Preset = { id: "pr1", name: "Review the diff", prompt: "Review the diff" };

const tHide = translateNow("composer.hidePresets");
const tShow = translateNow("composer.showPresets");

function setUpProject(presets: Preset[]) {
  useAppStore.setState(state => ({
    currentProjectId: "p1",
    currentChatId: null,
    config: { ...state.config, projects: [project], presets },
  }));
}

describe("Composer - showing and hiding the saved orders", () => {
  beforeEach(() => {
    resetStore();
    window.HTMLElement.prototype.hasPointerCapture = () => false;
    window.HTMLElement.prototype.setPointerCapture = () => {};
    window.HTMLElement.prototype.releasePointerCapture = () => {};
    window.HTMLElement.prototype.scrollIntoView = () => {};
  });

  it("starts showing them, with a button offering to fold them away", () => {
    setUpProject([preset]);

    render(<Composer />);

    const button = screen.getByRole("button", { name: tHide });
    expect(button.getAttribute("aria-expanded")).toBe("true");
    expect(screen.getByRole("button", { name: preset.name })).toBeDefined();
  });

  it("folds them on a click, and says so in the store and on the button", () => {
    setUpProject([preset]);

    render(<Composer />);
    fireEvent.click(screen.getByRole("button", { name: tHide }));

    expect(useAppStore.getState().presetsVisible).toBe(false);
    const button = screen.getByRole("button", { name: tShow });
    expect(button.getAttribute("aria-expanded")).toBe("false");
  });

  it("unfolds them again on the next click", () => {
    setUpProject([preset]);

    render(<Composer />);
    fireEvent.click(screen.getByRole("button", { name: tHide }));
    fireEvent.click(screen.getByRole("button", { name: tShow }));

    expect(useAppStore.getState().presetsVisible).toBe(true);
    expect(screen.getByRole("button", { name: tHide })).toBeDefined();
  });

  it("comes up folded when that is how it was left", () => {
    setUpProject([preset]);
    useAppStore.setState({ presetsVisible: false });

    render(<Composer />);

    expect(screen.getByRole("button", { name: tShow })).toBeDefined();
    expect(screen.queryByRole("button", { name: tHide })).toBeNull();
  });

  it("has no button when there is nothing saved to fold", () => {
    setUpProject([]);

    render(<Composer />);

    expect(screen.queryByRole("button", { name: tHide })).toBeNull();
    expect(screen.queryByRole("button", { name: tShow })).toBeNull();
  });

  it("has no button when nothing saved applies to the agent the prompt is aimed at", () => {
    setUpProject([{ ...preset, agentId: "somebody-else" }]);

    render(<Composer />);

    expect(screen.queryByRole("button", { name: tHide })).toBeNull();
  });
});
