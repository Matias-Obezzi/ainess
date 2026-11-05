// Renaming a chat where it stands: the row's name turns into a field.
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent, resetStore } from "@/test/render";
import { Sidebar } from "../shell/Sidebar";
import { useAppStore } from "@/store";
import { translateNow } from "@/i18n/useT";
import type { AgentConfig, Project } from "@/types";

const boss: AgentConfig = { id: "a1", name: "Jefe", provider: "claude", role: "planner", parentId: null, autoApprove: true };
const project: Project = { id: "p1", name: "P", workspaceDir: "C:/p", createdAt: 1, agents: [boss] };

const field = () => screen.getByRole("textbox", { name: translateNow("sidebar.renameChat.label") }) as HTMLInputElement;
const chatName = () => useAppStore.getState().config.chats[0].name;

describe("Renaming a chat in the sidebar", () => {
  beforeEach(() => {
    resetStore();
    useAppStore.setState(state => ({
      currentProjectId: "p1",
      currentChatId: null,
      screen: "project",
      config: {
        ...state.config,
        projects: [project],
        chats: [{ id: "c1", projectId: "p1", name: "Viejo", mode: "individual", participants: [{ agentId: "a1", role: "planner" }], createdAt: 1 }],
      },
    }));
    render(<Sidebar />);
    fireEvent.contextMenu(screen.getByText("Viejo"));
  });

  const startRename = async () => {
    fireEvent.click(await screen.findByRole("menuitem", { name: translateNow("common.rename") }));
    return screen.findByRole("textbox", { name: translateNow("sidebar.renameChat.label") });
  };

  it("saves the trimmed name on Enter, without opening the chat", async () => {
    const input = (await startRename()) as HTMLInputElement;
    expect(input.value).toBe("Viejo");
    fireEvent.change(input, { target: { value: "  Nuevo  " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(chatName()).toBe("Nuevo");
    expect(useAppStore.getState().currentChatId).toBeNull();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("refuses an empty name and stays open", async () => {
    const input = await startRename();
    fireEvent.change(input, { target: { value: "   " } });
    fireEvent.keyDown(input, { key: "Enter" });
    expect(chatName()).toBe("Viejo");
    expect(screen.getByText(translateNow("sidebar.renameChat.empty"))).toBeTruthy();
    expect(field()).toBeTruthy();
  });

  it("puts the old name back on Escape", async () => {
    const input = await startRename();
    fireEvent.change(input, { target: { value: "Otro" } });
    fireEvent.keyDown(input, { key: "Escape" });
    expect(chatName()).toBe("Viejo");
    expect(screen.queryByRole("textbox")).toBeNull();
    expect(screen.getByText("Viejo")).toBeTruthy();
  });
});
