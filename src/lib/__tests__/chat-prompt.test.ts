import { describe, it, expect } from "vitest";
import { buildSystemPrompt } from "@/lib/providers";
import type { AgentConfig, Task } from "@/types";

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

  it("ends with the agent's own systemPrompt when it has one", () => {
    const prompt = buildSystemPrompt(planner, [], { chat: { role: "planner", others: [] }, sharedContext: "", skills: [] });
    expect(prompt.endsWith("Sos groso.")).toBe(true);
  });
});
