import { describe, it, expect, beforeAll } from "vitest";
import { buildSystemPrompt } from "@/lib/providers";
import { loadLanguage } from "@/i18n";
import { useAppStore } from "@/store";
import type { AgentConfig, Task } from "@/types";

// The assertions below are written against the English prompt. `translateNow` (which
// `buildSystemPrompt` uses) reads `config.language` and, when it is unset, follows the system
// language, so pin English explicitly and load its dictionary: the result must not depend on
// the machine's locale.
beforeAll(async () => {
  useAppStore.setState(state => ({ config: { ...state.config, language: "en" } }));
  await loadLanguage("en");
});

const planner: AgentConfig = { id: "p", name: "Orquestador", provider: "claude", role: "planner", parentId: null, autoApprove: false, systemPrompt: "Sos groso." };
const worker: AgentConfig = { id: "w", name: "Obrero", provider: "antigravity", role: "implementer", parentId: "p", autoApprove: true };

describe("buildSystemPrompt in chat mode", () => {
  it("includes the ask block", () => {
    const prompt = buildSystemPrompt(planner, [], { chat: { role: "planner", others: [] }, sharedContext: "", skills: [] });
    expect(prompt).toContain("```ask");
  });

  it("does not include the delegate block nor the board, even when the agent is planner and gets children", () => {
    const tasks: Task[] = [{ id: "123", projectId: "p1", title: "Task 1", detail: "", status: "backlog", createdAt: 1, updatedAt: 1, dependsOn: [], order: 0, archived: false }];
    const prompt = buildSystemPrompt(planner, [worker], { 
      chat: { role: "planner", others: [] }, 
      sharedContext: "", 
      skills: [],
      tasks
    });
    expect(prompt).not.toContain("```delegate");
    expect(prompt).not.toContain("Task 1");
  });

  it("names the other participants when others has people, and does not add the section when empty", () => {
    const promptEmpty = buildSystemPrompt(planner, [], { chat: { role: "planner", others: [] }, sharedContext: "", skills: [] });
    expect(promptEmpty).not.toContain("Other participants in this conversation");
    
    const promptOthers = buildSystemPrompt(planner, [], { 
      chat: { role: "planner", others: [{ name: "Obrero", role: "implementer" }] }, 
      sharedContext: "", 
      skills: [] 
    });
    expect(promptOthers).toContain("Other participants in this conversation:");
    expect(promptOthers).toContain("- Obrero (implementer)");
    expect(promptOthers).toContain("Answer the user's last message");
  });

  it("lists a skill by its name and file path, and DOES NOT put its content in the prompt", () => {
    const prompt = buildSystemPrompt(planner, [], { 
      skills: [{ id: "1", name: "commits-convencionales", description: "Mensajes consistentes", content: "El contenido secreto", enabledFor: "all" }], 
      sharedContext: "",
      chat: { role: "planner", others: [] } 
    });
    expect(prompt).toContain("commits-convencionales");
    expect(prompt).toContain("commits-convencionales/SKILL.md");
    expect(prompt).not.toContain("El contenido secreto");
  });

  it("includes the user profile and shared context when passed", () => {
    const prompt = buildSystemPrompt(planner, [], { 
      skills: [], 
      sharedContext: "Contexto compartido de prueba",
      profile: { name: "Matias", about: "Dev", preferences: "Tabs" },
      chat: { role: "planner", others: [] } 
    });
    expect(prompt).toContain("Contexto compartido de prueba");
    expect(prompt).toContain("Matias");
    expect(prompt).toContain("Tabs");
  });

  // An agent in a chat names files as much as one working a card does, and the answer is drawn
  // the same way: a path becomes something to click, a bare name becomes a dead one.
  it("asks for the path from the project root, here as anywhere else", () => {
    const prompt = buildSystemPrompt(planner, [], { chat: { role: "planner", others: [] }, sharedContext: "", skills: [] });
    expect(prompt).toContain("write its path from the project root");
  });

  it("ends with the agent's own systemPrompt when it has one", () => {
    const prompt = buildSystemPrompt(planner, [], { chat: { role: "planner", others: [] }, sharedContext: "", skills: [] });
    expect(prompt.endsWith("Sos groso.")).toBe(true);
  });
});
