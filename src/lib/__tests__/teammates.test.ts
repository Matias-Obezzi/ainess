import { describe, it, expect } from "vitest";
import { teammatesSection, buildSystemPrompt } from "@/lib/providers";
import type { AgentConfig } from "@/types";

const worker: AgentConfig = { id: "w", name: "Obrero", provider: "antigravity", role: "implementer", parentId: "p", autoApprove: true };

describe("teammatesSection", () => {
  it("devuelve '' si no hay compañeros", () => {
    expect(teammatesSection([])).toBe("");
  });

  it("nombra a los dos compañeros y sus tareas", () => {
    const res = teammatesSection([
      { name: "Alice", task: "Arreglar A" },
      { name: "Bob", task: "Arreglar B" }
    ]);
    expect(res).toContain("Alice");
    expect(res).toContain("Arreglar A");
    expect(res).toContain("Bob");
    expect(res).toContain("Arreglar B");
  });

  it("aplasta los saltos de línea a espacios", () => {
    const res = teammatesSection([
      { name: "Alice", task: "Línea 1\nLínea 2\r\nLínea 3" }
    ]);
    expect(res).toContain("Línea 1 Línea 2 Línea 3");
    expect(res).not.toContain("\nLínea 2");
  });

  it("recorta tareas largas a ~120 caracteres", () => {
    const longTask = "a".repeat(200);
    const res = teammatesSection([{ name: "Alice", task: longTask }]);
    const lines = res.split("\n");
    const taskLine = lines.find(l => l.includes("Alice:"));
    expect(taskLine!.length).toBeLessThan(135);
    expect(taskLine).toContain("…");
  });
});

describe("buildSystemPrompt with teammates", () => {
  it("incluye a los compañeros cuando se pasan", () => {
    const prompt = buildSystemPrompt(worker, [], {
      skills: [], sharedContext: "",
      teammates: [{ name: "Bob", task: "Trabajando en B" }]
    });
    expect(prompt).toContain("Bob");
    expect(prompt).toContain("Trabajando en B");
  });

  it("no agrega ninguna sección si no se pasan", () => {
    const prompt = buildSystemPrompt(worker, [], {
      skills: [], sharedContext: ""
    });
    expect(prompt).not.toContain("En paralelo");
  });

  it("los incluye en resuming: true", () => {
    const prompt = buildSystemPrompt(worker, [], {
      skills: [], sharedContext: "", resuming: true,
      teammates: [{ name: "Bob", task: "Trabajando en B" }]
    });
    expect(prompt).toContain("Bob");
    expect(prompt).toContain("Trabajando en B");
  });

  it("no los incluye en modo chat", () => {
    const prompt = buildSystemPrompt(worker, [], {
      skills: [], sharedContext: "",
      chat: { role: "amigo", others: [] },
      teammates: [{ name: "Bob", task: "Trabajando en B" }]
    });
    expect(prompt).not.toContain("Bob");
    expect(prompt).not.toContain("Trabajando en B");
  });
});
