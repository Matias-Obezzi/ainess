// The `.ainess/` folder of a project: what the app knows, written where the agents can read it.
// A card the user typed by hand on the board never reached an agent, because the board lived in
// `%APPDATA%` and nothing in the workspace mentioned it.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { agentsMarkdown, boardMarkdown, filePath, readmeMarkdown, writeProjectFolder } from "@/lib/project-folder";
import { shortTaskId } from "@/lib/providers";
import { createTask } from "@/lib/tasks";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import type { AgentConfig, Project, Task } from "@/types";

const planner: AgentConfig = { id: "p", name: "Orquestador", provider: "claude", role: "planner", parentId: null, autoApprove: false, description: "Reparte el trabajo" };
const worker: AgentConfig = { id: "w", name: "Obrero", provider: "antigravity", role: "implementer", parentId: "p", autoApprove: true, model: "gemini-3.8-flash-high" };

const project: Project = { id: "p1", name: "tienda", workspaceDir: "C:\\repos\\tienda", createdAt: 1, agents: [planner, worker] };
const task = (over: Partial<Task>): Task => createTask({ projectId: project.id, ...over });

/** Records what was written where, without touching a disk. */
function recording() {
  const written = new Map<string, string>();
  setTransport({ ...nullTransport, writeFileAbs: async (path: string, content: string) => { written.set(path, content); } });
  return written;
}

beforeEach(() => {
  vi.resetModules();
});

describe("the board file", () => {
  it("groups the cards by column, with the id a delegation quotes back", () => {
    const open = task({ title: "Cachear el catálogo", status: "backlog" });
    const mine = task({ title: "Cupones", status: "working", agentId: "w", branch: "ainess/obrero" });
    const md = boardMarkdown(project, [open, mine], project.agents);

    expect(md).toContain(shortTaskId(open.id));
    expect(md).toContain("Cachear el catálogo");
    // Who has it and where it is being done, when we know.
    expect(md).toContain("Obrero");
    expect(md).toContain("ainess/obrero");
    // The columns are what the board shows, in the board's order.
    expect(md.indexOf("Cachear el catálogo")).toBeLessThan(md.indexOf("Cupones"));
  });

  it("leaves the archived out and says so when nothing is open", () => {
    const md = boardMarkdown(project, [task({ title: "Vieja", status: "done", archived: true })], project.agents);
    expect(md).not.toContain("Vieja");
    expect(md).toContain("#");
  });

  it("says it is generated, so nobody edits it expecting it to stick", () => {
    expect(boardMarkdown(project, [], [])).toContain("ainess");
    expect(agentsMarkdown(project, project.agents)).toContain("ainess");
  });
});

describe("the team file", () => {
  it("nests each agent under the one it answers to", () => {
    const md = agentsMarkdown(project, project.agents);
    const lines = md.split("\n").filter(l => l.trim().startsWith("- **"));
    expect(lines[0]).toContain("Orquestador");
    expect(lines[1]).toMatch(/^\s+- \*\*Obrero/);
    expect(md).toContain("gemini-3.8-flash-high");
    expect(md).toContain("Reparte el trabajo");
  });
});

describe("writing the folder", () => {
  it("writes the three files inside the workspace", async () => {
    const written = recording();
    await writeProjectFolder(project, [task({ title: "Una" })], project.agents);

    expect([...written.keys()]).toEqual([
      "C:\\repos\\tienda\\.ainess\\BOARD.md",
      "C:\\repos\\tienda\\.ainess\\AGENTS.md",
      "C:\\repos\\tienda\\.ainess\\README.md",
    ]);
    expect(written.get("C:\\repos\\tienda\\.ainess\\BOARD.md")).toContain("Una");
    expect(written.get("C:\\repos\\tienda\\.ainess\\README.md")).toBe(readmeMarkdown(project));
  });

  it("keeps the separator the workspace already uses", () => {
    expect(filePath("/home/me/repo", "BOARD.md")).toBe("/home/me/repo/.ainess/BOARD.md");
    expect(filePath("C:\\repos\\tienda\\", "BOARD.md")).toBe("C:\\repos\\tienda\\.ainess\\BOARD.md");
  });

  it("does nothing for a project with no folder, and survives a write that fails", async () => {
    const written = recording();
    await writeProjectFolder({ ...project, workspaceDir: "" }, [], []);
    expect(written.size).toBe(0);

    setTransport({ ...nullTransport, writeFileAbs: async () => { throw new Error("solo lectura"); } });
    await expect(writeProjectFolder(project, [], [])).resolves.toBeUndefined();
  });
});
