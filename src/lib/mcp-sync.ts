import { McpServer } from "@/types";
import { getTransport } from "./transport";
import { useAppStore } from "@/store";

export async function syncMcpToAntigravity(servers: McpServer[]): Promise<{success: boolean, error?: string, added: number, removed: number}> {
  const store = useAppStore.getState();
  const agy = store.binaries["antigravity"];
  if (!agy || !agy.path) {
    return { success: false, error: "Antigravity CLI no detectado", added: 0, removed: 0 };
  }

  const transport = getTransport();
  
  // List current servers
  const listRes = await transport.exec(agy.path, ["mcp", "list"]);
  if (listRes.code !== 0) {
    return { success: false, error: "Error listando servidores: " + listRes.stderr, added: 0, removed: 0 };
  }

  const currentNames = new Set<string>();
  const lines = listRes.stdout.split('\n');
  let isData = false;
  for (const line of lines) {
    const t = line.trim();
    if (!t) continue;
    if (t === "No MCP servers configured.") break;
    if (t.startsWith("NAME")) {
      isData = true;
      continue;
    }
    if (isData) {
      const parts = t.split(/\s+/);
      if (parts.length > 0) currentNames.add(parts[0]);
    }
  }

  const desiredNames = new Set<string>();
  let added = 0;
  let removed = 0;

  for (const s of servers) {
    desiredNames.add(s.name);
    
    const args = ["mcp", "add"];
    // An environment belongs to a process, and only a stdio server has one. Pushing these for an
    // http server handed the CLI a credential it has nowhere to put.
    if (s.transport === "stdio" && s.env) {
      for (const [k, v] of Object.entries(s.env)) {
        args.push("--env", `${k}=${v}`);
      }
    }
    // `agy mcp add --header "Name: value"`, repeatable. One array entry per flag and one per value:
    // the header carries a credential and building a command line out of strings would put it
    // through a shell. Headers are an http thing; a stdio server never has any.
    if (s.transport === "http" && s.headers) {
      for (const [k, v] of Object.entries(s.headers)) {
        args.push("--header", `${k}: ${v}`);
      }
    }
    args.push("--type", s.transport);
    args.push(s.name);
    
    if (s.transport === "http") {
      args.push(s.url || "");
    } else {
      args.push("--");
      args.push(s.command || "");
      if (s.args) {
        args.push(...s.args);
      }
    }

    const addRes = await transport.exec(agy.path, args);
    if (addRes.code !== 0) {
      // The CLI echoes back what it was given, so its own output can carry the token. The name of
      // the server says which one failed; the value never leaves this function.
      const detail = redactSecrets(addRes.stderr || addRes.stdout, s);
      return { success: false, error: `Error agregando ${s.name}: ` + detail, added, removed };
    }
    added++;
  }

  for (const name of currentNames) {
    if (!desiredNames.has(name)) {
      const rmRes = await transport.exec(agy.path, ["mcp", "remove", name]);
      if (rmRes.code === 0) removed++;
    }
  }

  return { success: true, added, removed };
}

/**
 * Takes the credentials of one server out of a text that is about to be shown. Same idea as
 * `sanitizeBridgeError` in `src/lib/bridge/index.ts`: the secret is known here, so it is matched by
 * its literal value instead of guessed at with a pattern.
 *
 * Exported for its own test. This is the one place a token could reach the screen, and a redaction
 * that quietly stops matching is indistinguishable from one that works until the day it does not.
 */
export function redactSecrets(text: string, server: McpServer): string {
  let out = text;
  for (const value of [...Object.values(server.headers ?? {}), ...Object.values(server.env ?? {})]) {
    if (value && value.trim()) out = out.split(value).join("[REDACTED]");
  }
  return out;
}
