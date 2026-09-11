// Starting work from the home screen.
//
// Two things here are the feature rather than plumbing. `projectForDir` is what stops a folder from
// becoming a second project: two projects on one workspace means two teams editing the same files,
// neither knowing the other exists. And `startBlockers` is the difference between a box that is
// disabled and a box that says why.
import { describe, it, expect } from "vitest";
import { normalizePath, plannerOf, projectForDir, projectNameFromDir, startBlockers, startTarget } from "@/lib/home-start";
import type { AgentConfig, Formation, Project } from "@/types";

const project = (over: Partial<Project> = {}): Project => ({
  id: "p1", name: "P", workspaceDir: "C:/proyectos/ainess", createdAt: 1, agents: [], ...over,
});

const formation = (over: Partial<Formation> = {}): Formation => ({
  id: "f1", name: "Mi equipo", agents: [], ...over,
});

const agent = (over: Partial<AgentConfig> = {}): AgentConfig => ({
  id: "a1", name: "Uno", provider: "claude", role: "implementer", parentId: null, ...over,
} as AgentConfig);

describe("normalizePath", () => {
  it("reads the same folder written three ways as one folder", () => {
    const forms = ["C:\\proyectos\\ainess", "C:/proyectos/ainess", "C:/proyectos/ainess/", "c:/PROYECTOS/Ainess"];
    const seen = new Set(forms.map(normalizePath));
    expect(seen.size).toBe(1);
  });

  it("keeps different folders different", () => {
    expect(normalizePath("C:/a")).not.toBe(normalizePath("C:/b"));
  });
});

describe("projectForDir", () => {
  it("finds the project already working in that folder, however it was typed", () => {
    const found = projectForDir([project()], "C:\\Proyectos\\Ainess\\");
    expect(found?.id).toBe("p1");
  });

  it("finds nothing for a folder nobody has", () => {
    expect(projectForDir([project()], "C:/otro")).toBeUndefined();
  });

  it("never matches on an empty folder, whatever the projects hold", () => {
    expect(projectForDir([project({ workspaceDir: "" })], "")).toBeUndefined();
  });
});

describe("projectNameFromDir", () => {
  it("names it after the folder", () => {
    expect(projectNameFromDir("C:\\proyectos\\ainess")).toBe("ainess");
    expect(projectNameFromDir("/home/matias/ainess/")).toBe("ainess");
  });
});

describe("plannerOf", () => {
  it("prefers the planner at the root", () => {
    const agents = [agent({ id: "impl" }), agent({ id: "plan", role: "planner" })];
    expect(plannerOf(agents)?.id).toBe("plan");
  });

  it("takes the first root when no one is a planner", () => {
    expect(plannerOf([agent({ id: "uno" }), agent({ id: "dos" })])?.id).toBe("uno");
  });

  it("never reaches for a child: a prompt to a random implementer is worse than none", () => {
    expect(plannerOf([agent({ id: "hijo", parentId: "otro" })])).toBeUndefined();
    expect(plannerOf([])).toBeUndefined();
  });
});

describe("startBlockers", () => {
  const base = { prompt: "hacé algo", workspaceDir: "C:/nuevo", formationId: "f1", formations: [formation()], projects: [] as Project[] };

  it("is clear when all three are there", () => {
    expect(startBlockers(base)).toEqual([]);
  });

  it("asks for the folder first, then the team, then the words", () => {
    expect(startBlockers({ ...base, prompt: "", workspaceDir: "", formationId: null }))
      .toEqual(["folder", "team", "prompt"]);
  });

  it("points at making a team when the user has never made one", () => {
    expect(startBlockers({ ...base, formations: [], formationId: null })).toEqual(["formations"]);
  });

  it("asks nothing about a team for a folder that is already a project", () => {
    // It has one. Picking a second would add agents to a project, not start one.
    const blockers = startBlockers({ ...base, workspaceDir: "C:/proyectos/ainess", formationId: null, projects: [project()] });
    expect(blockers).toEqual([]);
  });

  it("still lets an existing folder be used with no teams saved at all", () => {
    const blockers = startBlockers({ ...base, workspaceDir: "C:/proyectos/ainess", formationId: null, formations: [], projects: [project()] });
    expect(blockers).toEqual([]);
  });

  it("counts a prompt of only spaces as nothing written", () => {
    expect(startBlockers({ ...base, prompt: "   " })).toEqual(["prompt"]);
  });

  it("asks again when the remembered team has been deleted since", () => {
    // The default formation id survives in the config; the formation may not. Trusting the id gave
    // a button that was enabled and did nothing.
    expect(startBlockers({ ...base, formationId: "borrado" })).toEqual(["team"]);
  });
});

describe("startTarget", () => {
  const formations = [formation()];

  it("sends an existing folder to the project that owns it, team and all", () => {
    const target = startTarget({ workspaceDir: "C:\\Proyectos\\Ainess", formationId: "f1", formations, projects: [project()] });
    expect(target).toEqual({ kind: "existing", project: project() });
  });

  it("makes a new one named after the folder", () => {
    const target = startTarget({ workspaceDir: "C:/proyectos/nuevo", formationId: "f1", formations, projects: [] });
    expect(target).toEqual({ kind: "new", name: "nuevo", workspaceDir: "C:/proyectos/nuevo", formation: formation() });
  });

  it("refuses a new one with no team, rather than inventing an empty project", () => {
    expect(startTarget({ workspaceDir: "C:/nuevo", formationId: null, formations, projects: [] })).toBeNull();
    expect(startTarget({ workspaceDir: "C:/nuevo", formationId: "gone", formations, projects: [] })).toBeNull();
  });

  it("refuses with no folder", () => {
    expect(startTarget({ workspaceDir: "  ", formationId: "f1", formations, projects: [] })).toBeNull();
  });
});
