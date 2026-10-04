// Skills as folders: reading SKILL.md, finding the ones each tool has, writing ainess's into them,
// and handing a run the whole folder.
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { detectSkills, parseSkillMd, skillFromDetected, skillKnown, syncNativeSkills } from "@/lib/skills-native";
import { skillMarkdown, writeSkillFiles } from "@/lib/project-folder";
import type { Skill } from "@/types";

describe("parseSkillMd", () => {
  it("reads the plain, quoted and block spellings real skills use", () => {
    expect(parseSkillMd("---\nname: deploy-to-vercel\ndescription: Deploy apps. Use when asked.\nmetadata:\n  author: vercel\n  version: \"3.0.0\"\n---\n\n# Deploy\nbody")).toEqual({
      name: "deploy-to-vercel", description: "Deploy apps. Use when asked.", body: "# Deploy\nbody",
    });
    expect(parseSkillMd("---\nname: docs\ndescription: 'the docs (a doc''s home)'\n---\nx")?.description).toBe("the docs (a doc's home)");
    expect(parseSkillMd('---\nname: "x"\ndescription: "a \\"quoted\\" one"\n---\n')?.description).toBe('a "quoted" one');
    expect(parseSkillMd("---\nname: x\ndescription: >\n  folded over\n  two lines\n---\n")?.description).toBe("folded over two lines");
    expect(parseSkillMd("---\r\nname: x\r\ndescription:\r\n  React patterns that scale. Use when\r\n  refactoring components.\r\nlicense: MIT\r\n---\r\nbody")?.description)
      .toBe("React patterns that scale. Use when refactoring components.");
  });

  it("is not a skill without frontmatter or a name", () => {
    expect(parseSkillMd("# Just markdown")).toBeNull();
    expect(parseSkillMd("---\ndescription: x\n---\n")).toBeNull();
  });
});

describe("skillMarkdown", () => {
  it("writes the format every skills reader expects", () => {
    const text = skillMarkdown({ id: "1", name: "Revisión de PRs", description: 'Use when "reviewing"', content: "Check tests.", enabledFor: "all" });
    expect(text.startsWith('---\nname: revision-de-prs\ndescription: "Use when \\"reviewing\\""\n---\n')).toBe(true);
    expect(parseSkillMd(text)).toMatchObject({ name: "revision-de-prs", description: 'Use when "reviewing"' });
  });
});

const HOME = "C:\\Users\\u";
type Fs = { dirs: Record<string, string[]>; files: Record<string, string> };

function fakeFs(fs: Fs) {
  const copies: Array<[string, string]> = [];
  const removed: string[] = [];
  const written: Record<string, string> = {};
  setTransport({
    ...nullTransport,
    homeDir: async () => HOME,
    listDir: async (p: string) => (p in fs.dirs ? fs.dirs[p].map(name => ({ name, isDir: !name.includes(".md") })) : null),
    readFileAbs: async (p: string) => written[p] ?? fs.files[p] ?? null,
    writeFileAbs: async (p: string, c: string) => { written[p] = c; },
    copySkillDir: async (src: string, dst: string) => { copies.push([src, dst]); },
    removeSkillDir: async (p: string) => { removed.push(p); },
  } as never);
  return { copies, removed, written };
}

describe("detectSkills", () => {
  it("finds each skill once, with every tool it is in, Claude's synced ones included", async () => {
    fakeFs({
      dirs: {
        [`${HOME}\\.claude\\skills`]: ["deploy", "synced"],
        [`${HOME}\\.claude\\skills\\synced`]: [".bucket-x", "acct"],
        [`${HOME}\\.claude\\skills\\synced\\acct`]: ["pdf", ".last-complete-round"],
        [`${HOME}\\.agents\\skills`]: ["deploy"],
        [`${HOME}\\.codex\\skills`]: [".system"],
      },
      files: {
        [`${HOME}\\.claude\\skills\\deploy\\SKILL.md`]: "---\nname: deploy\ndescription: Deploys\n---\nbody",
        [`${HOME}\\.agents\\skills\\deploy\\SKILL.md`]: "---\nname: deploy\ndescription: Deploys\n---\nbody",
        [`${HOME}\\.claude\\skills\\synced\\acct\\pdf\\SKILL.md`]: "---\nname: pdf\ndescription: PDFs\n---\nb",
        [`${HOME}\\.codex\\skills\\.system\\SKILL.md`]: "---\nname: hidden\n---\n",
      },
    });
    const found = await detectSkills();
    expect(found.map(f => [f.name, f.sources])).toEqual([["deploy", ["claude-code", "agents"]], ["pdf", ["claude-synced"]]]);
    expect(skillFromDetected(found[0])).toMatchObject({ name: "deploy", dir: `${HOME}\\.claude\\skills\\deploy`, source: "claude-code", content: "body", enabledFor: "all" });
  });
});

describe("skillKnown", () => {
  it("by name or by the folder name it would get", () => {
    const skills: Skill[] = [{ id: "1", name: "Revisión de PRs", content: "x", enabledFor: "all" }];
    expect(skillKnown(skills, "revisión de prs")).toBe(true);
    expect(skillKnown(skills, "revision-de-prs")).toBe(true);
    expect(skillKnown(skills, "other")).toBe(false);
  });
});

describe("syncNativeSkills", () => {
  const CLAUDE = `${HOME}\\.claude\\skills`;
  const text: Skill = { id: "t", name: "Mi convención", description: "Cómo escribir", content: "Nunca console.log", enabledFor: "all" };
  const folder: Skill = { id: "f", name: "pdf", content: "b", enabledFor: "all", dir: "C:\\mine\\pdf" };
  const solo: Skill = { id: "s", name: "solo", content: "x", enabledFor: ["a1"] };

  beforeEach(() => {
    useAppStore.setState(state => ({ config: { ...state.config, skillsNativeSync: undefined, skillsOwned: {}, skills: [text, folder, solo] } }));
  });

  it("writes the shared skills into the skills folders the user has, and owns them", async () => {
    const io = fakeFs({ dirs: { [CLAUDE]: ["deploy"] }, files: { "C:\\mine\\pdf\\SKILL.md": "---\nname: pdf\n---\nb" } });
    const results = await syncNativeSkills();

    expect(Object.keys(io.written)).toEqual([`${CLAUDE}\\mi-convencion\\SKILL.md`]);
    expect(parseSkillMd(io.written[`${CLAUDE}\\mi-convencion\\SKILL.md`])?.name).toBe("mi-convencion");
    expect(io.copies).toEqual([["C:\\mine\\pdf", `${CLAUDE}\\pdf`]]);
    expect(results.agents?.status).toBe("not-installed");
    expect(useAppStore.getState().config.skillsOwned?.["claude-code"]).toEqual(["mi-convencion", "pdf"]);
  });

  it("leaves alone a skill of the user's with the same name", async () => {
    const io = fakeFs({ dirs: { [CLAUDE]: ["pdf"] }, files: {} });
    const results = await syncNativeSkills();
    expect(io.copies).toEqual([]);
    expect(results["claude-code"]?.skipped).toEqual(["pdf"]);
  });

  it("does nothing on a second sync with nothing new, and removes only what it wrote", async () => {
    useAppStore.setState(state => ({ config: { ...state.config, skillsOwned: { "claude-code": ["mi-convencion", "pdf", "gone"] } } }));
    const io = fakeFs({
      dirs: { [CLAUDE]: ["mi-convencion", "pdf", "gone", "theirs"] },
      files: {
        [`${CLAUDE}\\mi-convencion\\SKILL.md`]: skillMarkdown(text),
        "C:\\mine\\pdf\\SKILL.md": "---\nname: pdf\n---\nb",
        [`${CLAUDE}\\pdf\\SKILL.md`]: "---\nname: pdf\n---\nb",
      },
    });
    await syncNativeSkills();
    expect(io.written).toEqual({});
    expect(io.copies).toEqual([]);
    expect(io.removed).toEqual([`${CLAUDE}\\gone`]);
  });
});

describe("writeSkillFiles", () => {
  it("hands a run the whole folder of a folder skill, in the folder the run works in", async () => {
    const io = fakeFs({ dirs: {}, files: { "C:\\mine\\pdf\\SKILL.md": "---\nname: pdf\n---\nb" } });
    const project = { id: "p", name: "P", workspaceDir: "C:\\repo", createdAt: 1, agents: [] };
    await writeSkillFiles(project, [{ id: "f", name: "pdf", content: "b", enabledFor: "all", dir: "C:\\mine\\pdf" }], "C:\\worktrees\\a1");
    expect(io.copies).toEqual([["C:\\mine\\pdf", "C:\\worktrees\\a1\\.ainess\\skills\\pdf"]]);
  });
});
