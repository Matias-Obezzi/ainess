import { beforeEach, describe, expect, it } from "vitest";
import { useAppStore } from "../../store";
import { AppConfig } from "../../types";

describe("Project restoration", () => {
  beforeEach(() => {
    // Reset state before each test
    useAppStore.setState({
      config: {
        projects: [
          { id: "a", name: "A", agents: [], defaultAgent: null, workspaceDir: null },
          { id: "b", name: "B", agents: [], defaultAgent: null, workspaceDir: null },
        ],
        chats: [
          { id: "chat-a1", projectId: "a", title: "Chat A1", timestamp: 1, role: "agent" },
          { id: "chat-a2", projectId: "a", title: "Chat A2", timestamp: 2, role: "agent" },
          { id: "chat-b1", projectId: "b", title: "Chat B1", timestamp: 3, role: "agent" },
        ],
        skills: [],
        mcpServers: [],
        version: 12,
      } as unknown as AppConfig,
      currentProjectId: null,
      currentChatId: null,
      screen: "home",
      projectModes: {},
      projectChats: {},
      navHistory: [],
    });
  });

  it("abro A, lo pongo en «graph», voy a B, vuelvo a A → A vuelve en «graph» y B había abierto en «tasks»", () => {
    const store = useAppStore.getState();
    store.openProject("a");
    useAppStore.getState().setProjectMode("graph");
    
    store.openProject("b");
    expect(useAppStore.getState().projectMode).toBe("tasks");
    
    store.openProject("a");
    expect(useAppStore.getState().projectMode).toBe("graph");
  });

  it("abro un chat de A, me voy a B, vuelvo a A con openProject('a') → vuelve al MISMO chat", () => {
    const store = useAppStore.getState();
    store.openProject("a", "chat-a1");
    expect(useAppStore.getState().currentChatId).toBe("chat-a1");
    
    store.openProject("b");
    expect(useAppStore.getState().currentProjectId).toBe("b");
    
    store.openProject("a");
    expect(useAppStore.getState().currentChatId).toBe("chat-a1");
  });

  it("lo mismo pero llamando openProject('a', null) → vuelve al hilo del orquestador", () => {
    const store = useAppStore.getState();
    store.openProject("a", "chat-a1");
    store.openProject("b");
    
    store.openProject("a", null);
    expect(useAppStore.getState().currentProjectId).toBe("a");
    expect(useAppStore.getState().currentChatId).toBe(null);
  });

  it("si el chat recordado se borró, volver al proyecto cae en el hilo sin romperse", () => {
    const store = useAppStore.getState();
    store.openProject("a", "chat-a1");
    
    store.openProject("b");
    
    // Simulate deletion
    store.removeChat("chat-a1");
    
    store.openProject("a");
    expect(useAppStore.getState().currentProjectId).toBe("a");
    expect(useAppStore.getState().currentChatId).toBe(null);
  });

  it("un chat de OTRO proyecto guardado por error en projectChats no se abre", () => {
    // Malicious or buggy state
    useAppStore.setState({
      projectChats: { "a": "chat-b1" }
    });
    const store = useAppStore.getState();
    
    store.openProject("a");
    expect(useAppStore.getState().currentProjectId).toBe("a");
    // "chat-b1" belongs to project "b", so it should fall back to null
    expect(useAppStore.getState().currentChatId).toBe(null);
  });
});
