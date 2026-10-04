// Writing ainess's shared MCP servers into each CLI's own config — and nothing of the user's.
//
// The rule everything here pins: only what ainess wrote is ever changed or removed. A server the
// user already had under the same name stays theirs, a file with comments is not rewritten, and a
// sync with nothing new writes nothing at all.
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { editJsonFile, planSync, sharedServers, syncNativeMcp, withCodexBlock } from "@/lib/mcp-native";
import { fromCodexToml } from "@/lib/mcp-import";
import type { McpServer } from "@/types";

const docs = { name: "docs", transport: "stdio" as const, command: "npx", args: ["docs-mcp"] };
const api = { name: "api", transport: "http" as const, url: "https://api.dev/mcp", headers: { Authorization: "Bearer SECRET-TOKEN" } };

describe("planSync", () => {
  it("adds what is missing and owns it", () => {
    expect(planSync([docs], [], [])).toMatchObject({ add: [docs], update: [], remove: [], skipped: [], owned: ["docs"] });
  });

  it("leaves alone a server of the user's that has the same name", () => {
    expect(planSync([docs], [{ ...docs, args: ["theirs"] }], [])).toMatchObject({ add: [], update: [], skipped: ["docs"], owned: [] });
  });

  it("updates its own only when it changed", () => {
    expect(planSync([docs], [docs], ["docs"])).toMatchObject({ update: [], owned: ["docs"] });
    expect(planSync([{ ...docs, args: ["new"] }], [docs], ["docs"]).update).toHaveLength(1);
  });

  it("removes only what it wrote", () => {
    const plan = planSync([], [docs, { ...api, name: "mine" }], ["docs"]);
    expect(plan.remove).toEqual(["docs"]);
    expect(plan.owned).toEqual([]);
  });
});

describe("sharedServers", () => {
  it("is only the servers meant for every agent", () => {
    const servers: McpServer[] = [
      { id: "1", ...docs, enabledFor: "all" },
      { id: "2", ...api, enabledFor: ["a1"] },
    ];
    expect(sharedServers(servers)).toEqual([docs]);
  });
});

describe("editJsonFile", () => {
  it("changes one key and keeps every other", () => {
    const out = editJsonFile('{"theme":"dark","mcpServers":{"mine":{"command":"x"}}}', c => {
      (c.mcpServers as Record<string, unknown>).docs = { command: "npx" };
    });
    expect(JSON.parse(out!)).toEqual({ theme: "dark", mcpServers: { mine: { command: "x" }, docs: { command: "npx" } } });
  });

  it("starts a file that does not exist yet", () => {
    expect(JSON.parse(editJsonFile(null, c => { c.mcp = {}; })!)).toEqual({ mcp: {} });
  });

  it("refuses to rewrite a file whose comments it would lose, or one it cannot read", () => {
    expect(editJsonFile('{\n  // my servers\n  "mcp": {}\n}', () => {})).toBeNull();
    expect(editJsonFile("{ not json", () => {})).toBeNull();
  });

  it("is not put off by a trailing comma", () => {
    expect(editJsonFile('{"mcp": {},}', () => {})).not.toBeNull();
  });
});

describe("withCodexBlock", () => {
  const user = 'model = "gpt-5"\n\n[mcp_servers.mine]\ncommand = "mine"\n';

  it("adds a block of its own after what the user wrote, readable as Codex config", () => {
    const { text, owned } = withCodexBlock(user, [docs, api]);
    expect(text.startsWith(user.trimEnd())).toBe(true);
    expect(owned).toEqual(["docs", "api"]);
    expect(fromCodexToml(text).map(s => s.name)).toEqual(["mine", "docs", "api"]);
    expect(fromCodexToml(text).find(s => s.name === "api")?.headers).toEqual({ Authorization: "Bearer SECRET-TOKEN" });
  });

  it("replaces its block instead of adding another, and is stable", () => {
    const first = withCodexBlock(user, [docs]).text;
    const second = withCodexBlock(first, [docs]).text;
    expect(second).toBe(first);
    const changed = withCodexBlock(first, [{ ...docs, args: ["v2"] }]).text;
    expect(changed.match(/>>> ainess/g)).toHaveLength(1);
    expect(fromCodexToml(changed).find(s => s.name === "docs")?.args).toEqual(["v2"]);
  });

  it("does not take over a name the user defined, and goes away when it has nothing", () => {
    const { skipped, owned } = withCodexBlock(user, [{ ...docs, name: "mine" }]);
    expect(skipped).toEqual(["mine"]);
    expect(owned).toEqual([]);
    const withBlock = withCodexBlock(user, [docs]).text;
    expect(withCodexBlock(withBlock, []).text).toBe(user);
  });
});

describe("syncNativeMcp", () => {
  const HOME = "C:\\Users\\u";
  let files: Record<string, string>;
  let writes: string[];
  let execs: Array<{ program: string; args: string[] }>;
  let execFails: string | null;

  const rel = (abs: string) => abs.slice(HOME.length + 1).replace(/\\/g, "/");

  beforeEach(() => {
    files = {};
    writes = [];
    execs = [];
    execFails = null;
    setTransport({
      ...nullTransport,
      homeDir: async () => HOME,
      readHomeFile: async (path: string) => files[path] ?? null,
      writeFileAbs: async (path: string, content: string) => { files[rel(path)] = content; writes.push(rel(path)); },
      exec: async (program: string, args: string[]) => {
        execs.push({ program, args });
        return execFails ? { code: 1, stdout: "", stderr: execFails } : { code: 0, stdout: "", stderr: "" };
      },
      whichProgram: async () => null,
      acpManagedStatus: async () => null,
    } as never);
    useAppStore.setState(state => ({
      binaries: { copilot: { path: "copilot", version: "1" }, antigravity: { path: "agy", version: "1" } },
      config: {
        ...state.config,
        binaryOverrides: { claude: "C:/claude.exe" },
        mcpOwned: {},
        mcpNativeSync: undefined,
        mcpServers: [
          { id: "1", ...docs, enabledFor: "all" },
          { id: "2", ...api, enabledFor: "all" },
          { id: "3", name: "codegraph", transport: "stdio", command: "codegraph", args: ["serve"], enabledFor: "all" },
          { id: "4", name: "solo", transport: "stdio", command: "solo", enabledFor: ["a1"] },
        ],
      },
    }) as never);
    files[".claude.json"] = JSON.stringify({ mcpServers: { codegraph: { type: "stdio", command: "codegraph", args: ["serve"] } }, other: 1 });
    files[".copilot/mcp-config.json"] = JSON.stringify({ mcpServers: { mine: { type: "local", command: "mine", tools: ["*"] } }, keep: true });
  });

  it("writes the shared servers into each installed CLI, and only those", async () => {
    const results = await syncNativeMcp();

    // Copilot: its file, with the user's own server and every other key still there.
    const copilot = JSON.parse(files[".copilot/mcp-config.json"]);
    expect(Object.keys(copilot.mcpServers).sort()).toEqual(["api", "codegraph", "docs", "mine"]);
    expect(copilot.keep).toBe(true);
    expect(copilot.mcpServers.mine).toEqual({ type: "local", command: "mine", tools: ["*"] });
    expect(copilot.mcpServers.solo).toBeUndefined();

    // Claude Code: through its own commands, at user scope; its codegraph is the user's.
    const claude = execs.filter(e => e.program === "C:/claude.exe").map(e => e.args.slice(0, 5).join(" "));
    expect(claude).toEqual(["mcp add-json --scope user docs", "mcp add-json --scope user api"]);
    expect(results["claude-code"]?.skipped).toEqual(["codegraph"]);
    expect(files[".claude.json"]).toContain('"other":1');

    // Antigravity through `agy mcp add`, flags before the name.
    expect(execs.filter(e => e.program === "agy").map(e => e.args.slice(0, 2).join(" "))).toEqual(["mcp add", "mcp add", "mcp add"]);

    // Not installed: nothing created for them.
    expect(results.gemini?.status).toBe("not-installed");
    expect(files[".gemini/settings.json"]).toBeUndefined();
    expect(files[".codex/config.toml"]).toBeUndefined();

    expect(useAppStore.getState().config.mcpOwned?.copilot?.sort()).toEqual(["api", "codegraph", "docs"]);
    expect(useAppStore.getState().config.mcpOwned?.["claude-code"]).toEqual(["docs", "api"]);
  });

  it("writes nothing on a second sync with nothing new", async () => {
    await syncNativeMcp();
    // What the CLIs now hold, as their own commands would have left it.
    const claude = JSON.parse(files[".claude.json"]);
    claude.mcpServers.docs = { type: "stdio", command: "npx", args: ["docs-mcp"] };
    claude.mcpServers.api = { type: "http", url: api.url, headers: api.headers };
    files[".claude.json"] = JSON.stringify(claude);
    files[".gemini/config/mcp_config.json"] = JSON.stringify({ mcpServers: {
      docs: { command: "npx", args: ["docs-mcp"] }, api: { serverUrl: api.url, headers: api.headers }, codegraph: { command: "codegraph", args: ["serve"] },
    } });
    writes = [];
    execs = [];

    await syncNativeMcp();
    expect(writes).toEqual([]);
    expect(execs).toEqual([]);
  });

  it("takes out of each CLI what was taken out of ainess, and nothing of the user's", async () => {
    await syncNativeMcp();
    files[".claude.json"] = JSON.stringify({ mcpServers: { codegraph: {}, docs: { command: "npx", args: ["docs-mcp"] }, api: { url: api.url } } });
    useAppStore.setState(state => ({ config: { ...state.config, mcpServers: state.config.mcpServers.filter(s => s.name !== "docs") } }));
    execs = [];

    await syncNativeMcp();
    expect(Object.keys(JSON.parse(files[".copilot/mcp-config.json"]).mcpServers).sort()).toEqual(["api", "codegraph", "mine"]);
    expect(execs.filter(e => e.program === "C:/claude.exe").map(e => e.args.join(" "))).toContain("mcp remove --scope user docs");
    expect(execs.some(e => e.args.includes("codegraph") && e.args.includes("remove"))).toBe(false);
  });

  it("never lets a secret out in what it reports", async () => {
    execFails = "could not add api with header Authorization: Bearer SECRET-TOKEN";
    const results = await syncNativeMcp();
    expect(results["claude-code"]?.status).toBe("error");
    expect(JSON.stringify(results)).not.toContain("SECRET-TOKEN");
  });

  it("does nothing when the user turned it off", async () => {
    useAppStore.setState(state => ({ config: { ...state.config, mcpNativeSync: false } }));
    await syncNativeMcp();
    expect(writes).toEqual([]);
    expect(execs).toEqual([]);
  });
});
