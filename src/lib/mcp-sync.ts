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
    if (s.env) {
      for (const [k, v] of Object.entries(s.env)) {
        args.push("--env", `${k}=${v}`);
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
      return { success: false, error: `Error agregando ${s.name}: ` + (addRes.stderr || addRes.stdout), added, removed };
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
