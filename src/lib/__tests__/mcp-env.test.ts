// The variables an agent's process is given because of its MCP servers.
//
// The thing worth pinning is the asymmetry. A stdio server's environment is handed to the process
// the MCP client starts for it, scoped to that one server; an http server has no process, so the
// only place its variables can live is the agent's own environment — which is where `${VAR}` inside
// a header gets expanded from, and which everything the agent runs can see.
//
// So copying a stdio server's variables here would widen them for nothing, and that is the case
// most likely to be broken by someone tidying this up later.
import { describe, it, expect } from "vitest";
import { httpMcpEnv } from "@/lib/mcp-env";
import type { McpServer } from "@/types";

const server = (over: Partial<McpServer> = {}): McpServer => ({
  id: "m1", name: "uno", transport: "http", url: "https://x/mcp", enabledFor: "all", ...over,
});

describe("httpMcpEnv", () => {
  it("gives an http server's variables to the agent, which is where a header expands them", () => {
    expect(httpMcpEnv([server({ env: { STITCH_API_KEY: "abc" } })]))
      .toEqual({ STITCH_API_KEY: "abc" });
  });

  it("leaves a stdio server's alone: they already reach it, scoped to its own process", () => {
    const stdio = server({ transport: "stdio", command: "npx", env: { TOKEN: "no-va-aca" } });
    expect(httpMcpEnv([stdio])).toEqual({});
  });

  it("takes only the http half of a mixed list", () => {
    const list = [
      server({ id: "a", transport: "stdio", env: { A: "1" } }),
      server({ id: "b", env: { B: "2" } }),
    ];
    expect(httpMcpEnv(list)).toEqual({ B: "2" });
  });

  it("is empty when nothing asked for anything", () => {
    expect(httpMcpEnv([])).toEqual({});
    expect(httpMcpEnv([server()])).toEqual({});
    expect(httpMcpEnv([server({ env: {} })])).toEqual({});
  });

  it("lets the last server win a name two of them claim", () => {
    // There is one process environment and no way to give each server its own. Documented rather
    // than prevented, because preventing it would mean refusing a configuration that still works.
    const list = [server({ id: "a", env: { KEY: "primero" } }), server({ id: "b", env: { KEY: "segundo" } })];
    expect(httpMcpEnv(list)).toEqual({ KEY: "segundo" });
  });

  it("skips a nameless variable rather than putting one in the environment", () => {
    expect(httpMcpEnv([server({ env: { "": "huerfana", OK: "1" } })])).toEqual({ OK: "1" });
  });
});
