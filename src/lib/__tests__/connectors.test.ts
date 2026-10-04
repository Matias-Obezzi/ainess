// A connector's token reaches a run, and only a run.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/store";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { withConnectorTokens } from "@/lib/connectors";
import { sharedServers } from "@/lib/mcp-native";
import { startRun } from "@/lib/orchestrator";
import type { McpServer } from "@/types";

vi.mock("@/lib/hooks", () => ({ emitHookEvent: async () => {} }));

const linear: McpServer = { id: "lin", name: "Linear", transport: "http", url: "https://mcp.linear.app/mcp", oauth: true, enabledFor: "all" };
const keyed: McpServer = { id: "k", name: "Stitch", transport: "http", url: "https://stitch/mcp", headers: { "X-Key": "${KEY}" }, enabledFor: "all" };
const local: McpServer = { id: "l", name: "docs", transport: "stdio", command: "npx", enabledFor: "all" };

describe("withConnectorTokens", () => {
  it("puts a fresh token on the connectors that sign in, and leaves the rest alone", async () => {
    setTransport({ ...nullTransport, oauthAccessToken: async (id: string) => (id === "lin" ? "tok-1" : null) } as never);
    const out = await withConnectorTokens([linear, keyed, local]);
    expect(out[0].headers).toEqual({ Authorization: "Bearer tok-1" });
    expect(out[1]).toBe(keyed);
    expect(out[2]).toBe(local);
    // The configured server is never written to: the token lives in this run's copy only.
    expect(linear.headers).toBeUndefined();
  });

  it("sends one without a sign-in, or whose refresh failed, as it is", async () => {
    setTransport({ ...nullTransport, oauthAccessToken: async () => { throw new Error("expired"); } } as never);
    expect((await withConnectorTokens([linear]))[0]).toBe(linear);
  });

  it("is written into the CLIs without any token: each signs in by itself", () => {
    expect(sharedServers([linear])).toEqual([{ name: "Linear", transport: "http", url: "https://mcp.linear.app/mcp" }]);
  });
});

describe("a run with a connector", () => {
  let written: Record<string, string>;
  beforeEach(() => {
    written = {};
    setTransport({
      ...nullTransport,
      spawnRun: async () => ({ pid: 1, image: "copilot" }),
      writeFileAbs: async () => {},
      writeTextFile: async (path: string, content: string) => { written[path] = content; return `C:/app/${path}`; },
      oauthAccessToken: async () => "fresh-token",
    } as never);
    useAppStore.setState(state => ({
      runs: {},
      messages: [],
      binaries: { copilot: { path: "copilot", version: "1" } },
      runtime: { p1: { c1: { agentId: "c1", status: "idle", queuedInstructions: [] } } },
      config: {
        ...state.config,
        mcpServers: [linear],
        projects: [{ id: "p1", name: "P", workspaceDir: "C:/p", createdAt: 1, agents: [{ id: "c1", name: "Copi", provider: "copilot", role: "implementer", parentId: null, autoApprove: true }] }],
      },
    }) as never);
  });

  it("gets the token as the server's Authorization header", async () => {
    startRun({ agentId: "c1", projectId: "p1", prompt: "hola", parentRunId: null, round: 0 });
    await vi.waitFor(() => expect(written["mcp/c1.json"]).toBeDefined());
    const config = JSON.parse(written["mcp/c1.json"]);
    expect(config.mcpServers.Linear).toEqual({ type: "http", url: "https://mcp.linear.app/mcp", headers: { Authorization: "Bearer fresh-token" } });
    expect(useAppStore.getState().config.mcpServers[0].headers).toBeUndefined();
  });
});
