import { create } from "zustand";
import { AppConfig, AgentConfig, Binaries, AgentRuntime, Run, CommMessage, Skill, McpServer, Project } from "@/types";
import { getTransport } from "@/lib/transport";
import * as orchestrator from "@/lib/orchestrator";

export interface AppState {
  loaded: boolean;
  config: AppConfig;
  binaries: Binaries;
  runtime: Record<string, Record<string, AgentRuntime>>;
  runs: Record<string, Run>;
  messages: CommMessage[];
  activeTaskRunId: Record<string, string | null>;
  currentProjectId: string | null;

  init(): Promise<void>;
  saveConfig(): Promise<void>;
  addProject(project: Omit<Project, "id" | "createdAt">): void;
  updateProject(id: string, patch: Partial<Project>): void;
  removeProject(id: string): void;
  setCurrentProject(id: string | null): void;
  setMaxRounds(n: number): void;
  upsertAgent(agent: AgentConfig): void;
  removeAgent(agentId: string): void;
  upsertSkill(skill: Skill): void;
  removeSkill(skillId: string): void;
  upsertMcpServer(server: McpServer): void;
  removeMcpServer(serverId: string): void;
  setSharedContext(text: string): void;
  detectBinaries(): Promise<void>;

  submitPrompt(text: string, targetAgentId: string, projectId: string): Promise<void>;
  instructAgent(agentId: string, text: string, projectId: string): Promise<void>;
  stopAgent(agentId: string, projectId: string): Promise<void>;
  stopAll(projectId?: string): Promise<void>;
  resetSession(agentId: string, projectId: string): void;
  clearMessages(projectId?: string): void;
}

function generateSeedConfig(): AppConfig {
  const claudeId = crypto.randomUUID();
  const antigravityId = crypto.randomUUID();
  const copilotId = crypto.randomUUID();

  return {
    version: 3,
    projects: [],
    lastProjectId: null,
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
  config: { version: 3, agents: [], projects: [], lastProjectId: null, maxRounds: 6, skills: [], mcpServers: [], sharedContext: "" },
  binaries: {},
  runtime: {},
  runs: {},
  messages: [],
  activeTaskRunId: {},
  currentProjectId: null,

  init: () => {
    // Idempotent: StrictMode mounts twice and both calls must share one initialization.
    if (!initPromise) initPromise = runInit();
    return initPromise;
  },

  saveConfig: async () => {
    await getTransport().saveConfig(get().config);
  },

  addProject: (project) => {
    set((state) => {
      const id = crypto.randomUUID();
      const newProject: Project = { ...project, id, createdAt: Date.now() };
      return { config: { ...state.config, projects: [...state.config.projects, newProject] } };
    });
    debouncedSave();
  },

  updateProject: (id, patch) => {
    set((state) => {
      const newProjects = state.config.projects.map(p => p.id === id ? { ...p, ...patch } : p);
      return { config: { ...state.config, projects: newProjects } };
    });
    debouncedSave();
  },

  removeProject: (id) => {
    // stopAll(id) is an async action, so we do it here, but zustand set is sync.
    // The plan says "mata sus runs primero con stopAll(projectId)". 
    // Wait, the orchestrator might be async, so we just call it.
    orchestrator.stopAll(id);
    set((state) => {
      const newProjects = state.config.projects.filter(p => p.id !== id);
      const newRuntime = { ...state.runtime };
      delete newRuntime[id];
      const newActiveTask = { ...state.activeTaskRunId };
      delete newActiveTask[id];
      // clear messages for project
      const newMessages = state.messages.filter(m => m.projectId !== id);
      const newRuns = Object.fromEntries(Object.entries(state.runs).filter(([_, r]) => r.projectId !== id));
      return { 
        config: { ...state.config, projects: newProjects }, 
        runtime: newRuntime, 
        activeTaskRunId: newActiveTask,
        messages: newMessages,
        runs: newRuns,
        currentProjectId: state.currentProjectId === id ? null : state.currentProjectId
      };
    });
    debouncedSave();
  },

  setCurrentProject: (id) => {
    set((state) => ({ currentProjectId: id, config: { ...state.config, lastProjectId: id } }));
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
      for (const p of state.config.projects) {
        if (!newRuntime[p.id]) newRuntime[p.id] = {};
        if (!newRuntime[p.id][agent.id]) {
          newRuntime[p.id][agent.id] = { agentId: agent.id, status: "idle", queuedInstructions: [] };
        }
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
      for (const pId of Object.keys(newRuntime)) {
        newRuntime[pId] = { ...newRuntime[pId] };
        delete newRuntime[pId][agentId];
      }
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

  submitPrompt: async (text, targetAgentId, projectId) => {
    await orchestrator.submitPrompt(text, targetAgentId, projectId);
  },

  instructAgent: async (agentId, text, projectId) => {
    await orchestrator.instructAgent(agentId, text, projectId);
  },

  stopAgent: async (agentId, projectId) => {
    await orchestrator.stopAgent(agentId, projectId);
  },

  stopAll: async (projectId) => {
    await orchestrator.stopAll(projectId);
  },

  resetSession: (agentId, projectId) => {
    set((state) => {
      if (!state.runtime[projectId]) return state;
      const r = state.runtime[projectId][agentId];
      if (!r) return state;
      return { 
        runtime: { 
          ...state.runtime, 
          [projectId]: { 
            ...state.runtime[projectId], 
            [agentId]: { ...r, sessionId: undefined } 
          } 
        } 
      };
    });
  },

  clearMessages: (projectId) => set((state) => {
    if (projectId) {
      return { messages: state.messages.filter(m => m.projectId !== projectId) };
    }
    return { messages: [] };
  })
}));

async function runInit(): Promise<void> {
    const { set, get } = { set: useAppStore.setState, get: useAppStore.getState };
    let config = await getTransport().loadConfig();
    let isSeed = false;
    if (!config) {
      config = generateSeedConfig();
      isSeed = true;
    }
    
    // Migration to version 3
    if ((config.version as number) < 3) {
      const oldConfig = config as any;
      let projects: Project[] = [];
      let lastProjectId = null;
      if (oldConfig.workspaceDir) {
        lastProjectId = crypto.randomUUID();
        projects.push({
          id: lastProjectId,
          name: "Principal",
          workspaceDir: oldConfig.workspaceDir,
          createdAt: Date.now()
        });
      }
      config = {
        ...config,
        version: 3,
        projects,
        lastProjectId,
        skills: config.skills || [],
        mcpServers: config.mcpServers || [],
        sharedContext: config.sharedContext || ""
      } as AppConfig;
      delete (config as any).workspaceDir;
      isSeed = true; // force save
    }
    
    const runtime: Record<string, Record<string, AgentRuntime>> = {};
    for (const p of config.projects) {
      runtime[p.id] = {};
      for (const a of config.agents) {
        runtime[p.id][a.id] = { agentId: a.id, status: "idle", queuedInstructions: [] };
      }
    }

    set({ config, runtime, currentProjectId: config.lastProjectId });
    
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

export function selectRuntime(state: AppState, projectId: string | null | undefined, agentId: string): AgentRuntime {
  if (!projectId) return { agentId, status: "idle", queuedInstructions: [] };
  const projectRuntime = state.runtime[projectId];
  if (!projectRuntime) return { agentId, status: "idle", queuedInstructions: [] };
  return projectRuntime[agentId] || { agentId, status: "idle", queuedInstructions: [] };
}

export function selectProjectMessages(state: AppState, projectId: string | null | undefined): CommMessage[] {
  if (!projectId) return [];
  return state.messages.filter(m => m.projectId === projectId || (!m.projectId && m.kind === "system"));
}

export function selectRunningCount(state: AppState, projectId?: string): number {
  let count = 0;
  if (projectId) {
    const projectRuntime = state.runtime[projectId];
    if (!projectRuntime) return 0;
    for (const r of Object.values(projectRuntime)) {
      if (r.status === "working" || r.status === "waiting") count++;
    }
    return count;
  }
  // Count across all projects
  for (const pr of Object.values(state.runtime)) {
    for (const r of Object.values(pr)) {
      if (r.status === "working" || r.status === "waiting") count++;
    }
  }
  return count;
}

export function selectProject(state: AppState, id: string | null | undefined): Project | undefined {
  if (!id) return undefined;
  return state.config.projects.find(p => p.id === id);
}

// Dev-only hook so the app can be driven from a debugger / e2e script.
if (import.meta.env.DEV) {
  if (typeof window !== "undefined") {
    (window as unknown as { __ais?: typeof useAppStore }).__ais = useAppStore;
  }
}
