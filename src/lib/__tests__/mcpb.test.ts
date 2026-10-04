// Turning a desktop extension's manifest and the user's values into an MCP server ainess can run.
import { describe, it, expect } from "vitest";
import { extensionRecord, missingValues, parseManifest, platformOf, runsHere, serverFromManifest } from "@/lib/mcpb";

const HOME = "C:\\Users\\u";
const DIR = "C:\\Users\\u\\AppData\\Roaming\\com.ainess\\extensions\\files";

const manifest = parseManifest({
  manifest_version: "0.3",
  name: "files",
  display_name: "Files",
  version: "1.2.0",
  description: "Reads your folders",
  author: { name: "Someone" },
  icon: "icon.png",
  server: {
    type: "node",
    entry_point: "server/index.js",
    mcp_config: {
      command: "node",
      args: ["${__dirname}/server/index.js", "--dirs", "${user_config.dirs}", "--limit=${user_config.limit}"],
      env: { API_KEY: "${user_config.api_key}", READ_ONLY: "${user_config.read_only}", OUT: "${DOWNLOADS}" },
      platform_overrides: { win32: { command: "node.exe" } },
    },
  },
  user_config: {
    dirs: { type: "directory", title: "Folders", multiple: true, required: true },
    api_key: { type: "string", title: "API key", sensitive: true, required: true },
    limit: { type: "number", title: "Limit", default: 10, min: 1, max: 100 },
    read_only: { type: "boolean", title: "Read only", default: true },
  },
  compatibility: { platforms: ["win32", "darwin"] },
})!;

describe("parseManifest", () => {
  it("keeps what ainess uses", () => {
    expect(manifest).toMatchObject({
      name: "files", displayName: "Files", version: "1.2.0", author: "Someone", icon: "icon.png",
      serverType: "node", platforms: ["win32", "darwin"],
    });
    expect(manifest.fields.map(f => f.key)).toEqual(["dirs", "api_key", "limit", "read_only"]);
    expect(manifest.fields.find(f => f.key === "api_key")).toMatchObject({ sensitive: true, required: true, type: "string" });
    expect(manifest.fields.find(f => f.key === "limit")).toMatchObject({ type: "number", default: 10, min: 1, max: 100 });
  });

  it("reads one from its text too, and rejects what has no server to start", () => {
    expect(parseManifest(JSON.stringify({ name: "x", server: { mcp_config: { command: "x" } } }))?.name).toBe("x");
    expect(parseManifest({ name: "x", server: {} })).toBeNull();
    expect(parseManifest({ server: { mcp_config: { command: "x" } } })).toBeNull();
    expect(parseManifest("{ not json")).toBeNull();
  });
});

describe("missingValues", () => {
  it("is the required ones with neither a value nor a default", () => {
    expect(missingValues(manifest, {}).map(f => f.key)).toEqual(["dirs", "api_key"]);
    expect(missingValues(manifest, { dirs: ["C:/a"], api_key: "k" })).toEqual([]);
    expect(missingValues(manifest, { dirs: [], api_key: "" }).map(f => f.key)).toEqual(["dirs", "api_key"]);
  });
});

describe("serverFromManifest", () => {
  it("fills in the folder, the system folders, the user's values and this system's command", () => {
    const server = serverFromManifest({ manifest, dir: DIR, home: HOME, values: { dirs: ["C:/a", "D:/b"], api_key: "k" } });
    expect(server).toEqual({
      name: "Files",
      transport: "stdio",
      command: "node.exe",
      // A list standing as a whole argument is one argument per item.
      args: [`${DIR}/server/index.js`, "--dirs", "C:/a", "D:/b", "--limit=10"],
      env: { API_KEY: "k", READ_ONLY: "true", OUT: "C:\\Users\\u\\Downloads" },
    });
  });

  it("is nothing while a value it needs is missing", () => {
    expect(serverFromManifest({ manifest, dir: DIR, home: HOME, values: { dirs: ["C:/a"] } })).toBeNull();
  });

  it("runs a uv extension inside its own folder", () => {
    const uv = parseManifest({ name: "py", server: { type: "uv", mcp_config: { command: "uv", args: ["run", "py-mcp"] } } })!;
    expect(serverFromManifest({ manifest: uv, dir: DIR, home: HOME, values: {} })?.args).toEqual(["--directory", DIR, "run", "py-mcp"]);
  });
});

describe("platforms", () => {
  it("is guessed from the home folder", () => {
    expect(platformOf("C:\\Users\\u")).toBe("win32");
    expect(platformOf("/Users/u")).toBe("darwin");
    expect(platformOf("/home/u")).toBe("linux");
  });

  it("says whether the extension runs here", () => {
    expect(runsHere(manifest, "C:\\Users\\u")).toBe(true);
    expect(runsHere(manifest, "/home/u")).toBe(false);
    expect(runsHere({ ...manifest, platforms: [] }, "/home/u")).toBe(true);
  });
});

describe("extensionRecord", () => {
  it("keeps where it lives and what was given, marking another app's", () => {
    expect(extensionRecord(manifest, DIR, { api_key: "k" })).toEqual({ id: "files", dir: DIR, version: "1.2.0", config: { api_key: "k" } });
    expect(extensionRecord(manifest, DIR, {}, true)).toEqual({ id: "files", dir: DIR, version: "1.2.0", external: true });
  });
});
