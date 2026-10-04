// Connectors: remote MCP servers, some of which sign in with OAuth.
//
// The sign-in itself lives in Rust (src-tauri/src/oauth.rs) and its tokens in the OS keychain. This
// is the one place a token comes into the app: right before a run starts, as the server's
// `Authorization` header, refreshed on the way if it was about to expire.
import type { McpServer } from "@/types";
import { getTransport } from "@/lib/transport";

/**
 * `servers` with a fresh access token on every connector that signs in. One with no sign-in, or
 * whose sign-in could not be refreshed, goes as it is: the CLI behind the run may sign in by itself,
 * and if it cannot, the server says so to the agent.
 */
export async function withConnectorTokens(servers: McpServer[]): Promise<McpServer[]> {
  const transport = getTransport();
  return Promise.all(servers.map(async s => {
    if (!s.oauth || s.transport !== "http") return s;
    const token = await transport.oauthAccessToken(s.id).catch(() => null);
    return token ? { ...s, headers: { ...(s.headers ?? {}), Authorization: `Bearer ${token}` } } : s;
  }));
}
