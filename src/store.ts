import { create } from "zustand";
import { AppConfig, AgentConfig, Binaries, AgentRuntime, Run, CommMessage } from "@/types";
import { ipc, isTauri } from "@/lib/tauri";
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
  setWorkspaceDir(dir: string | null): void;
  setMaxRounds(n: number): void;
  upsertAgent(agent: AgentConfig): void;
  removeAgent(agentId: string): void;
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
    version: 1,
    workspaceDir: null,
    maxRounds: 6,
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
  config: { version: 1, agents: [], workspaceDir: null, maxRounds: 6 },
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
    if (isTauri()) {
      await ipc.saveConfig(get().config);
    }
  },

  setWorkspaceDir: (dir) => {
    set((state) => ({ config: { ...state.config, workspaceDir: dir } }));
    debouncedSave();
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
      const newRuntime = { ...state.runtime };
      delete newRuntime[agentId];
      return { config: { ...state.config, agents: newAgents }, runtime: newRuntime };
    });
    debouncedSave();
  },

  detectBinaries: async () => {
    if (isTauri()) {
      const binaries = await ipc.detectBinaries();
      set({ binaries });
    }
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
    let config = isTauri() ? await ipc.loadConfig() : null;
    let isSeed = false;
    if (!config) {
      config = generateSeedConfig();
      isSeed = true;
    }
    
    const runtime: Record<string, AgentRuntime> = {};
    for (const a of config.agents) {
      runtime[a.id] = { agentId: a.id, status: "idle", queuedInstructions: [] };
    }

    set({ config, runtime });
    
    if (isTauri() && isSeed) {
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
