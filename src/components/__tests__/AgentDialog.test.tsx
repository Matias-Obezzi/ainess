import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, resetStore } from "@/test/render";
import { AgentDialog } from "../AgentDialog";
import { useAppStore } from "@/store";
import type { AgentConfig } from "@/types";

vi.mock("@tauri-apps/plugin-dialog", () => ({ open: vi.fn() }));

const baseAgent: AgentConfig = {
  id: "agent-1",
  name: "Claude Code",
  provider: "claude",
  role: "planner",
  parentId: null,
  autoApprove: true,
};

describe("AgentDialog - provider and name synchronization", () => {
  beforeEach(() => {
    resetStore();
    window.HTMLElement.prototype.hasPointerCapture = () => false;
    window.HTMLElement.prototype.setPointerCapture = () => {};
    window.HTMLElement.prototype.releasePointerCapture = () => {};
    window.HTMLElement.prototype.scrollIntoView = () => {};
    // Configure binaries so both claude and antigravity are offered
    useAppStore.setState(state => ({
      binaries: {
        ...state.binaries,
        claude: { path: "C:/claude.exe" },
        antigravity: { path: "C:/antigravity.exe" },
      },
    }));
  });

  it("automatically renames an agent with default provider name when provider changes", () => {
    const onSave = vi.fn();
    render(
      <AgentDialog
        open={true}
        onOpenChange={() => {}}
        agent={baseAgent}
        agents={[baseAgent]}
        onSave={onSave}
      />
    );

    const nameInput = screen.getByDisplayValue("Claude Code") as HTMLInputElement;
    expect(nameInput).toBeDefined();

    // Open provider select
    const triggers = screen.getAllByRole("combobox");
    const providerTrigger = triggers[0]; // first combobox is Provider
    fireEvent.keyDown(providerTrigger, { key: "ArrowDown" });

    // Click Antigravity option
    const antigravityOption = screen.getByRole("option", { name: /Antigravity/i });
    fireEvent.click(antigravityOption);

    // Name should automatically update to "Antigravity"
    expect(nameInput.value).toBe("Antigravity");

    // Click save
    const saveButton = screen.getByRole("button", { name: /guardar|save/i });
    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "agent-1",
        provider: "antigravity",
        name: "Antigravity",
      })
    );
  });

  it("preserves custom agent name when provider changes", () => {
    const customAgent: AgentConfig = {
      ...baseAgent,
      id: "agent-custom",
      name: "Lead Architect",
    };

    const onSave = vi.fn();
    render(
      <AgentDialog
        open={true}
        onOpenChange={() => {}}
        agent={customAgent}
        agents={[customAgent]}
        onSave={onSave}
      />
    );

    const nameInput = screen.getByDisplayValue("Lead Architect") as HTMLInputElement;
    expect(nameInput).toBeDefined();

    // Open provider select
    const triggers = screen.getAllByRole("combobox");
    const providerTrigger = triggers[0];
    fireEvent.keyDown(providerTrigger, { key: "ArrowDown" });

    const antigravityOption = screen.getByRole("option", { name: /Antigravity/i });
    fireEvent.click(antigravityOption);

    // Name should remain "Lead Architect"
    expect(nameInput.value).toBe("Lead Architect");

    const saveButton = screen.getByRole("button", { name: /guardar|save/i });
    fireEvent.click(saveButton);

    expect(onSave).toHaveBeenCalledWith(
      expect.objectContaining({
        id: "agent-custom",
        provider: "antigravity",
        name: "Lead Architect",
      })
    );
  });

  it("excludes the current agent from collision check and avoids colliding with another agent", () => {
    // Project already has another agent named "Antigravity"
    const existingAntigravity: AgentConfig = {
      id: "agent-2",
      name: "Antigravity",
      provider: "antigravity",
      role: "implementer",
      parentId: "agent-1",
      autoApprove: true,
    };

    const onSave = vi.fn();
    render(
      <AgentDialog
        open={true}
        onOpenChange={() => {}}
        agent={baseAgent}
        agents={[baseAgent, existingAntigravity]}
        onSave={onSave}
      />
    );

    const nameInput = screen.getByDisplayValue("Claude Code") as HTMLInputElement;

    const triggers = screen.getAllByRole("combobox");
    const providerTrigger = triggers[0];
    fireEvent.keyDown(providerTrigger, { key: "ArrowDown" });

    const antigravityOption = screen.getByRole("option", { name: /Antigravity/i });
    fireEvent.click(antigravityOption);

    // Because "Antigravity" is taken by agent-2, nextAgentName proposes "Antigravity 2"
    expect(nameInput.value).toBe("Antigravity 2");
  });

  it("updates name if name was cleared by the user before changing provider", () => {
    const customAgent: AgentConfig = {
      ...baseAgent,
      name: "Custom Agent",
    };

    render(
      <AgentDialog
        open={true}
        onOpenChange={() => {}}
        agent={customAgent}
        agents={[customAgent]}
      />
    );

    const nameInput = screen.getByDisplayValue("Custom Agent") as HTMLInputElement;
    fireEvent.change(nameInput, { target: { value: "" } });

    const triggers = screen.getAllByRole("combobox");
    const providerTrigger = triggers[0];
    fireEvent.keyDown(providerTrigger, { key: "ArrowDown" });

    const antigravityOption = screen.getByRole("option", { name: /Antigravity/i });
    fireEvent.click(antigravityOption);

    expect(nameInput.value).toBe("Antigravity");
  });
});
