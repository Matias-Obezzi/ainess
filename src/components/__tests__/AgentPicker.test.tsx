// Agents with the same name in two projects must still be told apart.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, resetStore } from "@/test/render";
import userEvent from "@testing-library/user-event";
import { AgentPicker } from "@/components/AgentPicker";
import { useAppStore } from "@/store";

const project = (id: string, name: string) => ({
  id, name, workspaceDir: `C:/${id}`, createdAt: 1,
  agents: [{ id: `${id}-pl`, name: "Planner", provider: "claude", role: "planner", parentId: null }],
});

describe("AgentPicker", () => {
  beforeEach(() => {
    resetStore();
    useAppStore.setState(state => ({ config: { ...state.config, projects: [project("a", "Alpha"), project("b", "Beta")] as never } }));
  });

  it("names each agent with its project and hands back the ids", async () => {
    const onValueChange = vi.fn();
    render(<AgentPicker value={["a-pl"]} onValueChange={onValueChange} />);
    expect(document.body.textContent).toContain("Planner · Alpha");

    await userEvent.click(screen.getByRole("combobox"));
    await userEvent.click(screen.getByRole("option", { name: /Planner · Beta/ }));
    expect(onValueChange).toHaveBeenLastCalledWith(["a-pl", "b-pl"]);
  });
});
