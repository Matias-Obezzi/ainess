// Plugins: reading one, installing what it brings, switching it off, taking it away.
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import {
  commandPrompt, enabledPluginCommands, installPlugin, parseCommandFile, readMarketplace, readPlugin,
  setPluginEnabled, uninstallPlugin,
} from "@/lib/plugins";
import { cameFromClaude, syncNativeSkills } from "@/lib/skills-native";

const P = "C:\\plugins\\market\\plugins\\tool";

describe("parseCommandFile", () => {
  it("reads Gemini's TOML, single-line and triple-quoted", () => {
    expect(parseCommandFile("review.toml", 'description = "Review for bloat"\nprompt = "Review the changes. {{args}}"\n'))
      .toEqual({ name: "review", description: "Review for bloat", prompt: "Review the changes. {{args}}" });
    expect(parseCommandFile("long.toml", 'prompt = """\nLine one\nLine two\n"""\n')?.prompt).toBe("Line one\nLine two");
  });

  it("reads Claude's markdown, with or without frontmatter", () => {
    expect(parseCommandFile("fix.md", "---\ndescription: Fix an issue\nallowed-tools: Bash\n---\nFix issue $ARGUMENTS following our style."))
      .toEqual({ name: "fix", description: "Fix an issue", prompt: "Fix issue $ARGUMENTS following our style." });
    expect(parseCommandFile("plain.md", "Just do it")).toEqual({ name: "plain", prompt: "Just do it" });
  });

  it("is nothing for an empty prompt or another kind of file", () => {
    expect(parseCommandFile("x.toml", 'description = "no prompt"')).toBeNull();
    expect(parseCommandFile("notes.txt", "x")).toBeNull();
  });
});

describe("commandPrompt", () => {
  it("drops the arguments placeholder of either format", () => {
    expect(commandPrompt({ name: "a", prompt: "Fix $ARGUMENTS now" })).toBe("Fix  now");
    expect(commandPrompt({ name: "b", prompt: "Review. {{args}}" })).toBe("Review.");
  });
});

function fakeFs(dirs: Record<string, string[]>, files: Record<string, string>) {
  const removed: string[] = [];
  setTransport({
    ...nullTransport,
    homeDir: async () => "C:\\Users\\u",
    listDir: async (p: string) => (p in dirs ? dirs[p].map(name => ({ name, isDir: !/\.\w+$/.test(name) })) : null),
    readFileAbs: async (p: string) => files[p] ?? null,
    removePluginDir: async (p: string) => { removed.push(p); },
  } as never);
  return { removed };
}

const pluginFs = () => fakeFs(
  {
    [`${P}\\skills`]: ["lint", ".hidden"],
    [`${P}\\commands`]: ["review.md", "audit.toml", "README.txt"],
    [`${P}\\agents`]: ["helper.md"],
  },
  {
    [`${P}\\.claude-plugin\\plugin.json`]: JSON.stringify({ name: "tool", version: "1.0.0", description: "Tools", author: { name: "Me" }, hooks: "./hooks/x.json" }),
    [`${P}\\skills\\lint\\SKILL.md`]: "---\nname: lint\ndescription: Lints\n---\nRun the linter.",
    [`${P}\\.mcp.json`]: JSON.stringify({ mcpServers: { db: { command: "node", args: ["${CLAUDE_PLUGIN_ROOT}/server.js"], env: { ROOT: "${CLAUDE_PLUGIN_ROOT}" } } } }),
    [`${P}\\commands\\review.md`]: "---\ndescription: Review\n---\nReview $ARGUMENTS",
    [`${P}\\commands\\audit.toml`]: 'prompt = "Audit it"',
  },
);

describe("readPlugin", () => {
  it("finds its skills, servers (rooted in its folder), commands, and what only Claude Code runs", async () => {
    pluginFs();
    const c = await readPlugin(P);
    expect(c).toMatchObject({ name: "tool", version: "1.0.0", description: "Tools", author: "Me", hooks: true, agents: 1 });
    expect(c?.skills.map(s => [s.skill.name, s.dir])).toEqual([["lint", `${P}\\skills\\lint`]]);
    expect(c?.mcp).toEqual([{ name: "db", transport: "stdio", command: "node", args: [`${P}/server.js`], env: { ROOT: P } }]);
    expect(c?.commands.map(x => x.name)).toEqual(["review", "audit"]);
  });

  it("is nothing without a manifest", async () => {
    fakeFs({}, {});
    expect(await readPlugin(P)).toBeNull();
  });
});

describe("readMarketplace", () => {
  it("lists the plugins in its own folders and in other repositories", async () => {
    const M = "C:\\plugins\\market";
    fakeFs({}, { [`${M}\\.claude-plugin\\marketplace.json`]: JSON.stringify({ plugins: [
      { name: "self", source: "./" },
      { name: "tool", source: "./plugins/tool", description: "Tools" },
      { name: "far", source: { source: "github", repo: "org/far" } },
      { name: "broken" },
    ] }) });
    expect(await readMarketplace(M)).toEqual([
      { name: "self", where: { dir: M } },
      { name: "tool", description: "Tools", where: { dir: `${M}\\plugins\\tool` } },
      { name: "far", where: { repo: "org/far" } },
    ]);
  });
});

describe("installing, switching and removing", () => {
  beforeEach(() => {
    useAppStore.setState(state => ({ config: { ...state.config, plugins: [], skills: [], mcpServers: [] } }));
  });

  it("brings its skills and servers in, tagged, and its commands to the menu", async () => {
    pluginFs();
    const plugin = await installPlugin(P, { source: "git", repo: "org/market", managed: true });
    const config = useAppStore.getState().config;
    expect(config.plugins).toHaveLength(1);
    expect(config.skills).toMatchObject([{ name: "lint", dir: `${P}\\skills\\lint`, source: "plugin", plugin: plugin!.id, enabledFor: "all" }]);
    expect(config.mcpServers).toMatchObject([{ name: "db", plugin: plugin!.id, enabledFor: "all" }]);
    expect(enabledPluginCommands(config.plugins).map(c => c.name)).toEqual(["review", "audit"]);

    // Installed again (an update): replaced, not doubled.
    await installPlugin(P, { source: "git", repo: "org/market", managed: true });
    expect(useAppStore.getState().config.skills).toHaveLength(1);
  });

  it("switches everything it brought off and on together", async () => {
    pluginFs();
    const plugin = await installPlugin(P, { source: "folder" });
    setPluginEnabled(plugin!.id, false);
    let config = useAppStore.getState().config;
    expect(config.skills[0].enabledFor).toEqual([]);
    expect(config.mcpServers[0].enabledFor).toEqual([]);
    expect(enabledPluginCommands(config.plugins)).toEqual([]);
    setPluginEnabled(plugin!.id, true);
    config = useAppStore.getState().config;
    expect(config.skills[0].enabledFor).toBe("all");
  });

  it("takes all of it away, and the clone only with the last plugin that came from it", async () => {
    const io = pluginFs();
    const a = await installPlugin(P, { source: "git", repo: "org/market", managed: true });
    useAppStore.setState(state => ({ config: { ...state.config, plugins: [...state.config.plugins!, { ...state.config.plugins![0], id: "other", name: "other" }] } }));
    await uninstallPlugin(a!.id);
    expect(io.removed).toEqual([]);
    expect(useAppStore.getState().config.skills).toEqual([]);
    expect(useAppStore.getState().config.mcpServers).toEqual([]);
    await uninstallPlugin("other");
    expect(io.removed).toEqual([P]);
  });
});

describe("what came from Claude", () => {
  const plugins = [{ id: "s", name: "unity", dir: "x", source: "claude-synced" as const, enabled: true, commands: [] }];

  it("is told apart", () => {
    expect(cameFromClaude({ source: "claude-synced" }, [])).toBe(true);
    expect(cameFromClaude({ plugin: "s" }, plugins)).toBe(true);
    expect(cameFromClaude({ source: "agents" }, plugins)).toBe(false);
  });

  it("is not written back into Claude Code, which already has it", async () => {
    const CLAUDE = "C:\\Users\\u\\.claude\\skills";
    const copies: Array<[string, string]> = [];
    setTransport({
      ...nullTransport,
      homeDir: async () => "C:\\Users\\u",
      listDir: async (p: string) => (p === CLAUDE ? [] : null),
      readFileAbs: async () => "---\nname: x\n---\n",
      copySkillDir: async (src: string, dst: string) => { copies.push([src, dst]); },
    } as never);
    useAppStore.setState(state => ({ config: { ...state.config, skillsOwned: {}, skillsNativeSync: undefined, plugins, skills: [
      { id: "1", name: "pdf", content: "b", enabledFor: "all", dir: "C:\\synced\\pdf", source: "claude-synced" },
      { id: "2", name: "unity-ui", content: "b", enabledFor: "all", dir: "C:\\p\\skills\\ui", source: "plugin", plugin: "s" },
      { id: "3", name: "mine", content: "b", enabledFor: "all", dir: "C:\\mine", source: "upload" },
    ] } }));
    await syncNativeSkills();
    expect(copies).toEqual([["C:\\mine", `${CLAUDE}\\mine`]]);
  });
});
