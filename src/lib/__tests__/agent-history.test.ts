// What each agent said, written into the project it said it in.
import { describe, it, expect, beforeEach } from "vitest";
import { appendEntry, historyEntry, historyFileName, recordTurn, MAX_HISTORY_CHARS } from "@/lib/agent-history";
import { setTransport, getTransport } from "@/lib/transport";
import type { AgentConfig, Project } from "@/types";

const agent = { id: "ag-1234abcd", name: "Implementer 1" } as AgentConfig;
const project = { id: "p1", name: "shop", workspaceDir: "C:/repos/shop", createdAt: 0, agents: [agent] } as Project;

describe("the file an agent writes to", () => {
  it("is named after it, with enough of its id to tell two of the same name apart", () => {
    expect(historyFileName(agent)).toBe("implementer-1-ag-1234a.md");
    expect(historyFileName({ id: "x", name: "Revisión Técnica" })).toBe("revision-tecnica-x.md");
  });

  it("is still a name when the agent's is not", () => {
    expect(historyFileName({ id: "abc12345", name: "★★★" })).toBe("agente-abc12345.md");
  });
});

describe("one turn", () => {
  const entry = historyEntry({
    at: new Date(Date.UTC(2026, 8, 8, 14, 5)),
    from: "Orchestrator",
    prompt: "Movés el checkout a la API v2",
    answer: "Hecho.",
  });

  it("says when, who asked, what was asked and what came back", () => {
    expect(entry).toContain("2026-09-08 14:05");
    expect(entry).toContain("Orchestrator");
    expect(entry).toContain("Movés el checkout a la API v2");
    expect(entry).toContain("Hecho.");
  });

  it("cuts an answer that would take over the file", () => {
    const huge = historyEntry({ at: new Date(), from: "x", prompt: "y", answer: "z".repeat(10_000) });
    expect(huge.length).toBeLessThan(5_000);
  });
});

describe("appending", () => {
  const header = "# Historial\n\n";
  const entry = (n: number) => `## turno ${n}\n\ncontenido\n`;

  it("keeps the header once and the turns in order", () => {
    let file = appendEntry("", header, entry(1));
    file = appendEntry(file, header, entry(2));
    expect(file.startsWith(header)).toBe(true);
    expect(file.match(/# Historial/g)).toHaveLength(1);
    expect(file.indexOf("turno 1")).toBeLessThan(file.indexOf("turno 2"));
  });

  it("drops whole turns from the top when the file is full", () => {
    const max = header.length + entry(0).length * 3;
    let file = "";
    for (let i = 1; i <= 5; i++) file = appendEntry(file, header, entry(i), max);
    expect(file).not.toContain("turno 1");
    expect(file).toContain("turno 5");
    expect(file.length).toBeLessThanOrEqual(max);
    // Never half a turn: what is left starts where one starts.
    expect(file.slice(header.length).startsWith("## ")).toBe(true);
  });
});

describe("recordTurn", () => {
  const written: { path: string; content: string }[] = [];

  beforeEach(() => {
    written.length = 0;
    setTransport({
      ...getTransport(),
      readFileAbs: async () => null,
      writeFileAbs: async (path: string, content: string) => { written.push({ path, content }); },
    } as never);
  });

  it("writes into the project's own folder", async () => {
    await recordTurn(project, agent, { from: "Usuario", prompt: "hola", answer: "chau" });
    expect(written[0].path).toBe("C:/repos/shop/.ainess/history/implementer-1-ag-1234a.md");
    expect(written[0].content).toContain("chau");
  });

  it("has nowhere to write without a workspace, and does not throw", async () => {
    await recordTurn({ ...project, workspaceDir: "" }, agent, { from: "u", prompt: "a", answer: "b" });
    expect(written).toHaveLength(0);
  });

  it("swallows a folder that cannot be written", async () => {
    setTransport({
      ...getTransport(),
      readFileAbs: async () => null,
      writeFileAbs: async () => { throw new Error("solo lectura"); },
    } as never);
    await expect(recordTurn(project, agent, { from: "u", prompt: "a", answer: "b" })).resolves.toBeUndefined();
  });

  it("keeps the cap in mind", () => {
    expect(MAX_HISTORY_CHARS).toBeGreaterThan(10_000);
  });
});
