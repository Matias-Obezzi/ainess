// The environment an agent's process is given on account of its MCP servers.
//
// A stdio server gets its own environment from the MCP client, scoped to the process that client
// starts for it. An http server has no process — it is a URL the client calls — so the only place
// its variables can live is the environment of the agent itself, which is where the client looks
// when it expands `${VAR}` inside a header.
//
// That difference is also the cost, and it is worth saying out loud: a variable set here is not
// scoped to one server. It belongs to the agent's process, so every MCP server that expands
// variables sees it, and so does anything the agent runs. It buys the convenience of keeping the
// key in the app instead of in the machine's environment; it does not buy secrecy, because the
// value is written into the config either way.
import type { McpServer } from "@/types";

/**
 * The variables the agent's process needs for its http servers to authenticate.
 *
 * Only http: a stdio server's environment already reaches it, scoped, and copying it here would
 * widen it for nothing.
 *
 * On a name two servers both define, the last one wins. There is one process environment and no way
 * to give each server its own — which is the honest reason to name variables after the service.
 */
export function httpMcpEnv(servers: McpServer[]): Record<string, string> {
  const env: Record<string, string> = {};
  for (const server of servers) {
    if (server.transport !== "http" || !server.env) continue;
    for (const [name, value] of Object.entries(server.env)) {
      if (!name.trim()) continue;
      env[name] = value;
    }
  }
  return env;
}
