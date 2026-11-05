import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, resetStore } from "@/test/render";
import { Composer } from "../shell/Composer";
import { useAppStore } from "@/store";
import { translateNow } from "@/i18n/useT";
import type { AgentConfig, Project } from "@/types";

const boss: AgentConfig = { id: "a1", name: "Jefe", provider: "claude", role: "planner", parentId: null, autoApprove: true };
const project: Project = {
  id: "p1", name: "P", workspaceDir: "C:/p", createdAt: 1, agents: [boss],
  room: { enabled: true, backend: "supabase", room: "sala", secret: "k", supabaseUrl: "https://x.supabase.co", supabaseKey: "k", chatId: "c1", allowed: {} },
};

describe("Composer in a room's chat", () => {
  beforeEach(() => {
    resetStore();
    useAppStore.setState(state => ({
      currentProjectId: "p1",
      config: {
        ...state.config,
        projects: [project],
        chats: [
          { id: "c1", projectId: "p1", name: "Sala", mode: "shared", participants: [{ agentId: "a1", role: "planner" }], createdAt: 1 },
          { id: "c2", projectId: "p1", name: "Otro", mode: "individual", participants: [{ agentId: "a1", role: "planner" }], createdAt: 1 },
        ],
      },
    }));
  });

  it("shows a read-only notice instead of the box", () => {
    useAppStore.setState({ currentChatId: "c1" });
    render(<Composer />);
    expect(screen.getByText(translateNow("room.readOnlyHint"))).toBeTruthy();
    expect(screen.queryByRole("textbox")).toBeNull();
  });

  it("keeps the box in any other chat", () => {
    useAppStore.setState({ currentChatId: "c2" });
    render(<Composer />);
    expect(screen.queryByText(translateNow("room.readOnlyHint"))).toBeNull();
    expect(screen.getByRole("textbox")).toBeTruthy();
  });
});
