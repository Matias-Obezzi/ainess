// The model picker of the phone's Agents tab: picking writes the agent's default model, and
// picking "default model" leaves the agent without one.
import { describe, it, expect, beforeEach, vi, type Mock } from "vitest";
import { render, screen, fireEvent, resetStore } from "@/test/render";
import { AgentModelSelect } from "@/remote/AgentModelSelect";
import { useAppStore } from "@/store";
import { translateNow } from "@/i18n/useT";
import type { AgentConfig } from "@/types";

const agent: AgentConfig = {
  id: "a1",
  name: "Claude Code",
  provider: "claude",
  role: "planner",
  parentId: null,
  autoApprove: true,
};

/** Opens the select and clicks the option with that label. */
function openAndPick(label: string | RegExp) {
  fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });
  fireEvent.click(screen.getByRole("option", { name: label }));
}

describe("AgentModelSelect", () => {
  let updateAgent: Mock<(projectId: string, agentId: string, patch: Partial<AgentConfig>) => void>;

  beforeEach(() => {
    resetStore();
    window.HTMLElement.prototype.hasPointerCapture = () => false;
    window.HTMLElement.prototype.setPointerCapture = () => {};
    window.HTMLElement.prototype.releasePointerCapture = () => {};
    window.HTMLElement.prototype.scrollIntoView = () => {};

    updateAgent = vi.fn();
    useAppStore.setState({ updateAgent });
  });

  it("shows the default-model wording for an agent with no model of its own", () => {
    render(<AgentModelSelect projectId="p1" agent={agent} />);

    expect(screen.getByRole("combobox").textContent).toContain(translateNow("composer.defaultModel"));
  });

  it("picking a model saves it on the agent", () => {
    useAppStore.setState({ models: { claude: [{ id: "claude-opus-5", label: "Opus 5" }] } });

    render(<AgentModelSelect projectId="p1" agent={agent} />);
    openAndPick("Opus 5");

    expect(updateAgent).toHaveBeenCalledWith("p1", "a1", { model: "claude-opus-5" });
  });

  it("picking the default model leaves the agent without one", () => {
    render(<AgentModelSelect projectId="p1" agent={{ ...agent, model: "sonnet" }} />);
    openAndPick(translateNow("composer.defaultModel"));

    expect(updateAgent).toHaveBeenCalledWith("p1", "a1", { model: undefined });
  });

  it("offers the same list as the composer: what the CLI reports plus what was typed before", () => {
    useAppStore.setState(state => ({
      models: { claude: [{ id: "claude-opus-5", label: "Opus 5" }] },
      config: { ...state.config, rememberedModels: { claude: ["my-own-build"] } },
    }));

    render(<AgentModelSelect projectId="p1" agent={agent} />);
    fireEvent.keyDown(screen.getByRole("combobox"), { key: "ArrowDown" });

    expect(screen.getByRole("option", { name: "Opus 5" })).toBeDefined();
    expect(screen.getByRole("option", { name: "my-own-build" })).toBeDefined();
  });

  it("'Other…' opens a box, clears the model while it is empty, and saves what is typed", () => {
    render(<AgentModelSelect projectId="p1" agent={{ ...agent, model: "sonnet" }} />);
    openAndPick(translateNow("composer.otherModel"));

    expect(updateAgent).toHaveBeenLastCalledWith("p1", "a1", { model: undefined });

    const box = screen.getByPlaceholderText(translateNow("composer.typeModel"));
    fireEvent.change(box, { target: { value: "some-nightly" } });

    expect(updateAgent).toHaveBeenLastCalledWith("p1", "a1", { model: "some-nightly" });
  });

  it("a model the CLI no longer lists is shown as typed by hand, not redrawn as the default", () => {
    render(<AgentModelSelect projectId="p1" agent={{ ...agent, model: "retired-model" }} />);

    expect(screen.getByRole("combobox").textContent).toContain(translateNow("composer.otherModel"));
    expect((screen.getByPlaceholderText(translateNow("composer.typeModel")) as HTMLInputElement).value)
      .toBe("retired-model");
  });
});
