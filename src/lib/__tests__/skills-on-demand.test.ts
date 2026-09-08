// A skill is a name, a line of what it is for, and instructions the agent opens when the work is
// about that — not a manual poured into every run whether or not anybody reads it.
import { describe, it, expect, beforeEach } from "vitest";
import { buildSystemPrompt } from "@/lib/providers";
import { skillSlug, skillRelativePath, skillMarkdown, writeSkillFiles } from "@/lib/project-folder";
import { setTransport, getTransport } from "@/lib/transport";
import type { AgentConfig, Project, Skill } from "@/types";

const agent: AgentConfig = { id: "a1", name: "Uno", provider: "claude", role: "implementer", parentId: null, autoApprove: false };
const project = { id: "p1", name: "shop", workspaceDir: "C:/repos/shop", createdAt: 0, agents: [agent] } as Project;

const skill = (over: Partial<Skill>): Skill => ({
  id: "sk-1234abcd",
  name: "Convenciones del repo",
  description: "Cómo se escribe acá",
  content: "Usá tabs. Nunca console.log.",
  enabledFor: "all",
  ...over,
});

describe("what the prompt says about a skill", () => {
  const prompt = buildSystemPrompt(agent, [], { skills: [skill({})], sharedContext: "" });

  it("names it, says what it is for and where it is", () => {
    expect(prompt).toContain("Convenciones del repo");
    expect(prompt).toContain("Cómo se escribe acá");
    expect(prompt).toContain(".ainess/skills/convenciones-del-repo/SKILL.md");
  });

  it("does not carry the instructions themselves", () => {
    expect(prompt).not.toContain("Nunca console.log");
  });

  it("stands in with the first line when nobody wrote a description", () => {
    const p = buildSystemPrompt(agent, [], {
      skills: [skill({ description: undefined, content: "# Manual de marca\nEscribí en voz activa." })],
      sharedContext: "",
    });
    expect(p).toContain("Manual de marca");
    expect(p).not.toContain("Escribí en voz activa");
  });

  it("leaves an empty skill out entirely", () => {
    const p = buildSystemPrompt(agent, [], { skills: [skill({ content: "   " })], sharedContext: "" });
    expect(p).not.toContain("Convenciones del repo");
  });
});

describe("the file it opens", () => {
  const written: { path: string; content: string }[] = [];

  beforeEach(() => {
    written.length = 0;
    setTransport({
      ...getTransport(),
      readFileAbs: async () => null,
      writeFileAbs: async (path: string, content: string) => { written.push({ path, content }); },
    } as never);
  });

  it("is named after the skill, and survives a name that is not a path", () => {
    expect(skillSlug({ id: "x", name: "Revisión Técnica" })).toBe("revision-tecnica");
    expect(skillSlug({ id: "abc12345", name: "★" })).toBe("skill-abc12345");
    expect(skillRelativePath({ id: "x", name: "Otra" })).toBe(".ainess/skills/otra/SKILL.md");
  });

  it("carries what the prompt does not", () => {
    const text = skillMarkdown(skill({}));
    expect(text).toContain("# Convenciones del repo");
    expect(text).toContain("Cómo se escribe acá");
    expect(text).toContain("Nunca console.log");
  });

  it("is written where the prompt said it would be", async () => {
    await writeSkillFiles(project, [skill({})]);
    expect(written[0].path).toBe("C:/repos/shop/.ainess/skills/convenciones-del-repo/SKILL.md");
  });

  it("writes nothing for an empty skill, or with no workspace", async () => {
    await writeSkillFiles(project, [skill({ content: "" })]);
    await writeSkillFiles({ ...project, workspaceDir: "" }, [skill({})]);
    expect(written).toHaveLength(0);
  });
});
