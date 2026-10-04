// Reading the MCP servers each tool already has, in each tool's own spelling.
//
// The fixtures are the shapes found on a real machine (values replaced): Claude Code's user and
// project scopes, Antigravity's `serverUrl`, a Claude Desktop extension that runs with `uv`.
import { describe, it, expect, beforeEach } from "vitest";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import {
  alreadyKnown, detectMcpServers, fromClaudeExtensions, fromCodexToml, fromMcpServers, fromOpencode,
  fromServerEntry, mergeFinds, stripJsonComments,
} from "@/lib/mcp-import";
import type { McpServer } from "@/types";

describe("fromServerEntry", () => {
  it("reads a local server", () => {
    expect(fromServerEntry("codegraph", { type: "stdio", command: "codegraph", args: ["serve", "--mcp"] }))
      .toEqual({ name: "codegraph", transport: "stdio", command: "codegraph", args: ["serve", "--mcp"] });
  });

  it("reads a remote one under each tool's name for its address", () => {
    expect(fromServerEntry("a", { type: "http", url: "https://a.dev/mcp", headers: { Authorization: "Bearer x" } }))
      .toEqual({ name: "a", transport: "http", url: "https://a.dev/mcp", headers: { Authorization: "Bearer x" } });
    expect(fromServerEntry("g", { httpUrl: "https://g.dev/mcp" })?.url).toBe("https://g.dev/mcp");
    expect(fromServerEntry("Stitch", { disabled: false, serverUrl: "https://stitch.googleapis.com/mcp", headers: { "X-Goog-Api-Key": "k" } }))
      .toEqual({ name: "Stitch", transport: "http", url: "https://stitch.googleapis.com/mcp", headers: { "X-Goog-Api-Key": "k" } });
  });

  it("leaves out what was switched off, and what is not a server", () => {
    expect(fromServerEntry("off", { command: "x", disabled: true })).toBeNull();
    expect(fromServerEntry("off", { command: "x", enabled: false })).toBeNull();
    expect(fromServerEntry("nothing", { type: "stdio" })).toBeNull();
    expect(fromServerEntry("nothing", "npx thing")).toBeNull();
  });

  it("does not carry empty fields, so the same server compares equal wherever it came from", () => {
    expect(fromServerEntry("a", { command: "a", args: [], env: {} })).toEqual({ name: "a", transport: "stdio", command: "a" });
  });
});

describe("fromMcpServers", () => {
  it("reads every server of the map, and nothing without one", () => {
    expect(fromMcpServers({ mcpServers: { a: { command: "a" }, b: { url: "https://b" } } }).map(s => s.name)).toEqual(["a", "b"]);
    expect(fromMcpServers({ preferences: {} })).toEqual([]);
    expect(fromMcpServers(null)).toEqual([]);
  });
});

describe("fromOpencode", () => {
  it("splits the command list into the program and its arguments", () => {
    expect(fromOpencode({
      $schema: "https://opencode.ai/config.json",
      mcp: {
        fs: { type: "local", command: ["npx", "-y", "@modelcontextprotocol/server-filesystem"], environment: { ROOT: "C:/" } },
        docs: { type: "remote", url: "https://docs.dev/mcp", headers: { "X-Key": "k" } },
        off: { type: "local", command: ["x"], enabled: false },
      },
    })).toEqual([
      { name: "fs", transport: "stdio", command: "npx", args: ["-y", "@modelcontextprotocol/server-filesystem"], env: { ROOT: "C:/" } },
      { name: "docs", transport: "http", url: "https://docs.dev/mcp", headers: { "X-Key": "k" } },
    ]);
  });
});

describe("stripJsonComments", () => {
  it("removes comments and trailing commas, not the slashes of a URL", () => {
    const jsonc = `{
      // the schema
      "$schema": "https://opencode.ai/config.json", /* inline */
      "mcp": { "a": { "type": "remote", "url": "https://a.dev//mcp", }, },
    }`;
    expect(JSON.parse(stripJsonComments(jsonc))).toEqual({
      $schema: "https://opencode.ai/config.json",
      mcp: { a: { type: "remote", url: "https://a.dev//mcp" } },
    });
  });
});

describe("fromCodexToml", () => {
  it("reads the server tables, their env and a remote one", () => {
    const toml = `
model = "gpt-5"

[mcp_servers.docs]
command = "npx"
args = ["-y", "mcp-server-docs", 'C:\\docs']
env = { "API_KEY" = "x", MODE = 'ro' }

[mcp_servers."with space"]
command = "uvx"
args = [
  "thing",   # a comment
  "--flag",
]

[mcp_servers."with space".env]
TOKEN = "t"

[mcp_servers.remote]
url = "https://r.dev/mcp"
http_headers = { Authorization = "Bearer x" }

[profiles.other]
command = "not a server"
`;
    expect(fromCodexToml(toml)).toEqual([
      { name: "docs", transport: "stdio", command: "npx", args: ["-y", "mcp-server-docs", "C:\\docs"], env: { API_KEY: "x", MODE: "ro" } },
      { name: "with space", transport: "stdio", command: "uvx", args: ["thing", "--flag"], env: { TOKEN: "t" } },
      { name: "remote", transport: "http", url: "https://r.dev/mcp", headers: { Authorization: "Bearer x" } },
    ]);
  });

  it("finds nothing in a file without servers", () => {
    expect(fromCodexToml('model = "gpt-5"\n')).toEqual([]);
  });
});

describe("fromClaudeExtensions", () => {
  const dir = "C:\\Users\\u\\AppData\\Roaming\\Claude\\Claude Extensions";
  const home = "C:\\Users\\u";
  const registry = {
    extensions: {
      "ant.dir.gh.blender.blender-mcp": {
        id: "ant.dir.gh.blender.blender-mcp",
        manifest: { name: "Blender", server: { type: "uv", entry_point: "blmcp/__init__.py", mcp_config: { command: "uv", args: ["run", "blender-mcp"] } } },
      },
      "files": {
        id: "files",
        manifest: {
          name: "files",
          display_name: "Files",
          server: { type: "node", mcp_config: { command: "node", args: ["${__dirname}/server/index.js", "${user_config.root}"], env: { DOCS: "${DOCUMENTS}" } } },
          user_config: { root: { default: "C:/work" } },
        },
      },
      "needs-key": {
        id: "needs-key",
        manifest: { name: "needs-key", server: { type: "node", mcp_config: { command: "node", args: ["x.js"], env: { KEY: "${user_config.api_key}" } } } },
      },
      "switched-off": {
        id: "switched-off",
        manifest: { name: "off", server: { type: "node", mcp_config: { command: "node", args: [] } } },
      },
    },
  };
  const settings = { "switched-off": { isEnabled: false }, "files": { isEnabled: true, userConfig: { root: "D:/projects" } } };

  it("runs a uv extension inside its own folder", () => {
    const [blender] = fromClaudeExtensions(registry, settings, dir, home);
    expect(blender).toEqual({
      name: "Blender",
      transport: "stdio",
      command: "uv",
      args: ["--directory", `${dir}\\ant.dir.gh.blender.blender-mcp`, "run", "blender-mcp"],
      // Claude's folder, not ainess's: ainess runs it and never deletes it.
      extension: { id: "Blender", dir: `${dir}\\ant.dir.gh.blender.blender-mcp`, external: true },
    });
  });

  it("fills in the folder, what the user set and the system folders", () => {
    const files = fromClaudeExtensions(registry, settings, dir, home).find(s => s.name === "Files");
    expect(files?.args).toEqual([`${dir}\\files/server/index.js`, "D:/projects"]);
    expect(files?.env).toEqual({ DOCS: "C:\\Users\\u\\Documents" });
  });

  it("leaves out one that is off in Claude, and one still missing a value", () => {
    const names = fromClaudeExtensions(registry, settings, dir, home).map(s => s.name);
    expect(names).not.toContain("off");
    expect(names).not.toContain("needs-key");
  });
});

describe("mergeFinds", () => {
  it("folds one server found in two tools into one entry that names both", () => {
    const server = { name: "docs", transport: "stdio" as const, command: "npx", args: ["docs"] };
    const merged = mergeFinds([
      { server, source: "claude-code" },
      { server: { ...server, name: "Docs" }, source: "copilot" },
      { server: { ...server, args: ["other"] }, source: "gemini" },
    ]);
    expect(merged).toHaveLength(2);
    expect(merged[0].sources).toEqual(["claude-code", "copilot"]);
  });
});

describe("alreadyKnown", () => {
  const mine: McpServer[] = [{ id: "1", name: "Docs", transport: "stdio", command: "npx", args: ["docs"], enabledFor: "all" }];
  it("by name, or by what it runs", () => {
    expect(alreadyKnown(mine, { name: "docs", transport: "stdio", command: "x" })).toBe(true);
    expect(alreadyKnown(mine, { name: "other", transport: "stdio", command: "npx", args: ["docs"] })).toBe(true);
    expect(alreadyKnown(mine, { name: "new", transport: "http", url: "https://n" })).toBe(false);
  });
});

describe("detectMcpServers", () => {
  const files: Record<string, string> = {};
  beforeEach(() => {
    for (const k of Object.keys(files)) delete files[k];
    setTransport({
      ...nullTransport,
      readHomeFile: async (path: string) => files[path] ?? null,
      homeDir: async () => "C:\\Users\\u",
    } as never);
  });

  it("looks in every tool and says where each server came from", async () => {
    files[".claude.json"] = JSON.stringify({
      mcpServers: { codegraph: { type: "stdio", command: "codegraph", args: ["serve", "--mcp"] } },
      projects: { "C:/work/app": { mcpServers: { db: { command: "db-mcp" } } } },
    });
    files[".gemini/config/mcp_config.json"] = JSON.stringify({ mcpServers: { Stitch: { serverUrl: "https://stitch/mcp" } } });
    files[".copilot/mcp-config.json"] = JSON.stringify({ mcpServers: { codegraph: { type: "local", command: "codegraph", args: ["serve", "--mcp"] } } });
    files[".codex/config.toml"] = '[mcp_servers.docs]\ncommand = "docs"\n';
    files["AppData/Roaming/Claude/claude_desktop_config.json"] = JSON.stringify({ preferences: {} });

    const found = await detectMcpServers();
    const byName = Object.fromEntries(found.map(d => [d.server.name, d]));
    expect(byName.codegraph.sources).toEqual(["claude-code", "copilot"]);
    expect(byName.db.project).toBe("C:/work/app");
    expect(byName.Stitch.sources).toEqual(["antigravity"]);
    expect(byName.docs.sources).toEqual(["codex"]);
  });

  it("finds nothing, and does not throw, where nothing is set up", async () => {
    files[".claude.json"] = "{ not json";
    await expect(detectMcpServers()).resolves.toEqual([]);
  });
});
