import { create } from "zustand";
import { AppConfig, AgentConfig, Binaries, AgentRuntime, Run, CommMessage, Skill, McpServer } from "@/types";
import { getTransport } from "@/lib/transport";
import * as orchestrator from "@/lib/orchestrator";

export interface AppState {
  loaded: boolean;
  config: AppConfig;
  binaries: Binaries;
  runtime: Record<string, AgentRuntime>;
  runs: Record<string, Run>;
  messages: CommMessage[];
  activeTaskRunId: string | null;

  init(): Promise<void>;
  saveConfig(): Promise<void>;
  setWorkspaceDir(dir: string | null, persist?: boolean): void;
  setMaxRounds(n: number): void;
  upsertAgent(agent: AgentConfig): void;
  removeAgent(agentId: string): void;
  upsertSkill(skill: Skill): void;
  removeSkill(skillId: string): void;
  upsertMcpServer(server: McpServer): void;
  removeMcpServer(serverId: string): void;
  setSharedContext(text: string): void;
  detectBinaries(): Promise<void>;

  submitPrompt(text: string, targetAgentId: string): Promise<void>;
  instructAgent(agentId: string, text: string): Promise<void>;
  stopAgent(agentId: string): Promise<void>;
  stopAll(): Promise<void>;
  resetSession(agentId: string): void;
  clearMessages(): void;
}

function generateSeedConfig(): AppConfig {
  const claudeId = crypto.randomUUID();
  const antigravityId = crypto.randomUUID();
  const copilotId = crypto.randomUUID();

  return {
    version: 2,
    workspaceDir: null,
    maxRounds: 6,
    skills: [],
    mcpServers: [],
    sharedContext: "",
    agents: [
      {
        id: claudeId,
        name: "Claude",
        provider: "claude",
        role: "planner",
        parentId: null,
        autoApprove: false,
        color: "#d97757",
      },
      {
        id: antigravityId,
        name: "Antigravity",
        provider: "antigravity",
        role: "implementer",
        parentId: claudeId,
        model: "gemini-3.1-pro-high",
        autoApprove: true,
        description: "Implementa cambios de código en el workspace usando Antigravity (Gemini)",
        color: "#4f8cff",
      },
      {
        id: copilotId,
        name: "Copilot",
        provider: "copilot",
        role: "implementer",
        parentId: claudeId,
        autoApprove: true,
        description: "Implementa cambios de código usando GitHub Copilot CLI",
        color: "#8b5cf6",
      }
    ]
  };
}

let initPromise: Promise<void> | null = null;
let saveTimeout: ReturnType<typeof setTimeout> | null = null;
function debouncedSave() {
  if (saveTimeout) clearTimeout(saveTimeout);
  saveTimeout = setTimeout(() => {
    useAppStore.getState().saveConfig();
  }, 300);
}

export const useAppStore = create<AppState>()((set, get) => ({
  loaded: false,
  config: { version: 2, agents: [], workspaceDir: null, maxRounds: 6, skills: [], mcpServers: [], sharedContext: "" },
  binaries: {},
  runtime: {},
  runs: {},
  messages: [],
  activeTaskRunId: null,

  init: () => {
    // Idempotent: StrictMode mounts twice and both calls must share one initialization.
    if (!initPromise) initPromise = runInit();
    return initPromise;
  },

  saveConfig: async () => {
    await getTransport().saveConfig(get().config);
  },

  setWorkspaceDir: (dir, persist = true) => {
    set((state) => ({ config: { ...state.config, workspaceDir: dir } }));
    if (persist) debouncedSave();
  },

  setMaxRounds: (n) => {
    set((state) => ({ config: { ...state.config, maxRounds: n } }));
    debouncedSave();
  },

  upsertAgent: (agent) => {
    set((state) => {
      const idx = state.config.agents.findIndex(a => a.id === agent.id);
      const newAgents = [...state.config.agents];
      if (idx >= 0) {
        newAgents[idx] = agent;
      } else {
        newAgents.push(agent);
      }
      const newRuntime = { ...state.runtime };
      if (!newRuntime[agent.id]) {
        newRuntime[agent.id] = { agentId: agent.id, status: "idle", queuedInstructions: [] };
      }
      return { config: { ...state.config, agents: newAgents }, runtime: newRuntime };
    });
    debouncedSave();
  },

  removeAgent: (agentId) => {
    set((state) => {
      const agent = state.config.agents.find(a => a.id === agentId);
      const newAgents = state.config.agents.filter(a => a.id !== agentId).map(a => {
        if (a.parentId === agentId) {
          return { ...a, parentId: agent?.parentId || null };
        }
        return a;
      });
      // Cleanup enabledFor in skills and mcpServers
      const newSkills = state.config.skills.map(s => {
        if (s.enabledFor !== "all") {
          return { ...s, enabledFor: s.enabledFor.filter(id => id !== agentId) };
        }
        return s;
      });
      const newMcp = state.config.mcpServers.map(s => {
        if (s.enabledFor !== "all") {
          return { ...s, enabledFor: s.enabledFor.filter(id => id !== agentId) };
        }
        return s;
      });
      const newRuntime = { ...state.runtime };
      delete newRuntime[agentId];
      return { config: { ...state.config, agents: newAgents, skills: newSkills, mcpServers: newMcp }, runtime: newRuntime };
    });
    debouncedSave();
  },

  upsertSkill: (skill) => {
    set((state) => {
      const idx = state.config.skills.findIndex(s => s.id === skill.id || s.name.toLowerCase() === skill.name.toLowerCase());
      const newSkills = [...state.config.skills];
      if (idx >= 0) {
        newSkills[idx] = skill;
      } else {
        newSkills.push(skill);
      }
      return { config: { ...state.config, skills: newSkills } };
    });
    debouncedSave();
  },

  removeSkill: (skillId) => {
    set((state) => {
      const newSkills = state.config.skills.filter(s => s.id !== skillId && s.name.toLowerCase() !== skillId.toLowerCase());
      return { config: { ...state.config, skills: newSkills } };
    });
    debouncedSave();
  },

  upsertMcpServer: (server) => {
    set((state) => {
      const idx = state.config.mcpServers.findIndex(s => s.id === server.id || s.name.toLowerCase() === server.name.toLowerCase());
      const newMcp = [...state.config.mcpServers];
      if (idx >= 0) {
        newMcp[idx] = server;
      } else {
        newMcp.push(server);
      }
      return { config: { ...state.config, mcpServers: newMcp } };
    });
    debouncedSave();
  },

  removeMcpServer: (serverId) => {
    set((state) => {
      const newMcp = state.config.mcpServers.filter(s => s.id !== serverId && s.name.toLowerCase() !== serverId.toLowerCase());
      return { config: { ...state.config, mcpServers: newMcp } };
    });
    debouncedSave();
  },

  setSharedContext: (text) => {
    set((state) => ({ config: { ...state.config, sharedContext: text } }));
    debouncedSave();
  },

  detectBinaries: async () => {
    const binaries = await getTransport().detectBinaries();
    set({ binaries });
  },

  submitPrompt: async (text, targetAgentId) => {
    await orchestrator.submitPrompt(text, targetAgentId);
  },

  instructAgent: async (agentId, text) => {
    await orchestrator.instructAgent(agentId, text);
  },

  stopAgent: async (agentId) => {
    await orchestrator.stopAgent(agentId);
  },

  stopAll: async () => {
    await orchestrator.stopAll();
  },

  resetSession: (agentId) => {
    set((state) => {
      const r = state.runtime[agentId];
      if (!r) return state;
      return { runtime: { ...state.runtime, [agentId]: { ...r, sessionId: undefined } } };
    });
  },

  clearMessages: () => set({ messages: [] })
}));

async function runInit(): Promise<void> {
    const { set, get } = { set: useAppStore.setState, get: useAppStore.getState };
    let config = await getTransport().loadConfig();
    let isSeed = false;
    if (!config) {
      config = generateSeedConfig();
      isSeed = true;
    }
    
    // Migration to version 2
    if (config.version === 1 || !config.skills) {
      config = {
        ...config,
        version: 2,
        skills: config.skills || [],
        mcpServers: config.mcpServers || [],
        sharedContext: config.sharedContext || ""
      } as AppConfig;
      isSeed = true; // force save
    }
    
    const runtime: Record<string, AgentRuntime> = {};
    for (const a of config.agents) {
      runtime[a.id] = { agentId: a.id, status: "idle", queuedInstructions: [] };
    }

    set({ config, runtime });
    
    if (isSeed) {
      await get().saveConfig();
    }
    
    await get().detectBinaries();
    await orchestrator.attachListeners();
    
    set({ loaded: true });
}

export function selectChildren(state: AppState, agentId: string): AgentConfig[] {
  return state.config.agents.filter(a => a.parentId === agentId);
}

export function selectRoots(state: AppState): AgentConfig[] {
  return state.config.agents.filter(a => a.parentId === null);
}

export function selectAgent(state: AppState, id: string): AgentConfig | undefined {
  return state.config.agents.find(a => a.id === id);
}

export function selectSkillsFor(state: AppState, agentId: string): Skill[] {
  return state.config.skills.filter(s => s.enabledFor === "all" || s.enabledFor.includes(agentId));
}

export function selectMcpFor(state: AppState, agentId: string): McpServer[] {
  return state.config.mcpServers.filter(s => s.enabledFor === "all" || s.enabledFor.includes(agentId));
}

// Dev-only hook so the app can be driven from a debugger / e2e script.
if (import.meta.env.DEV) {
  if (typeof window !== "undefined") {
    (window as unknown as { __ais?: typeof useAppStore }).__ais = useAppStore;
  }
}
