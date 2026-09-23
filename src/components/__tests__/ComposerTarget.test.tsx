import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, fireEvent, resetStore, act } from "@/test/render";
import { Composer } from "../shell/Composer";
import { useAppStore } from "@/store";
import type { AgentConfig, Project } from "@/types";

const agent1: AgentConfig = {
  id: "a1",
  name: "Claude Code",
  provider: "claude",
  role: "planner",
  parentId: null,
  autoApprove: true,
};

const agent2: AgentConfig = {
  id: "a2",
  name: "Antigravity",
  provider: "antigravity",
  role: "implementer",
  parentId: "a1",
  autoApprove: true,
};

const agent3: AgentConfig = {
  id: "a3",
  name: "GitHub Copilot",
  provider: "copilot",
  role: "planner",
  parentId: null,
  autoApprove: true,
};

const project: Project = {
  id: "p1",
  name: "Test Project",
  workspaceDir: "C:/test",
  createdAt: 1000,
  agents: [agent1, agent2],
};

describe("Composer - orchestrator target tracking", () => {
  beforeEach(() => {
    resetStore();
    window.HTMLElement.prototype.hasPointerCapture = () => false;
    window.HTMLElement.prototype.setPointerCapture = () => {};
    window.HTMLElement.prototype.releasePointerCapture = () => {};
    window.HTMLElement.prototype.scrollIntoView = () => {};

    useAppStore.setState(state => ({
      currentProjectId: "p1",
      config: {
        ...state.config,
        projects: [project],
      },
    }));
  });

  it("follows the new orchestrator when defaultAgent changes in orchestrator thread", () => {
    render(<Composer />);

    // Initially, target should be defaultAgent ("Claude Code")
    expect(screen.getByText("Claude Code")).toBeDefined();

    // Now change hierarchy: promote agent2 to root planner and make agent1 implementer
    act(() => {
      useAppStore.setState(state => ({
        config: {
          ...state.config,
          projects: [
            {
              ...project,
              agents: [
                { ...agent2, role: "planner", parentId: null },
                { ...agent1, role: "implementer", parentId: "a2" },
              ],
            },
          ],
        },
      }));
    });

    // The composer target should automatically update to "Antigravity"
    expect(screen.getByText("Antigravity")).toBeDefined();
  });

  it("preserves explicitly selected agent when defaultAgent changes", () => {
    render(<Composer />);

    // Initially target is Claude Code
    expect(screen.getByText("Claude Code")).toBeDefined();

    // User explicitly selects Antigravity from the target dropdown
    const targetTrigger = screen.getAllByRole("combobox")[0];
    fireEvent.keyDown(targetTrigger, { key: "ArrowDown" });

    const antigravityOption = screen.getByRole("option", { name: /Antigravity/i });
    fireEvent.click(antigravityOption);

    expect(screen.getByText("Antigravity")).toBeDefined();

    // Now change the root planner to agent3
    act(() => {
      useAppStore.setState(state => ({
        config: {
          ...state.config,
          projects: [
            {
              ...project,
              agents: [agent3, agent2, agent1],
            },
          ],
        },
      }));
    });

    // Since the user explicitly selected Antigravity (a2), which was not the previous defaultAgent (a1),
    // Antigravity should still be targeted
    expect(screen.getByText("Antigravity")).toBeDefined();
  });

  it("does not show target selector in chatMode", () => {
    useAppStore.setState(state => ({
      config: {
        ...state.config,
        chats: [
          {
            id: "c1",
            projectId: "p1",
            name: "Chat 1",
            participants: [{ agentId: "a1" }],
            createdAt: 1000,
          },
        ],
      },
      currentChatId: "c1",
    }));

    render(<Composer />);

    // In chatMode, the target dropdown is not rendered
    expect(screen.queryByText("Claude Code")).toBeNull();
  });
});
