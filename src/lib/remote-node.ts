// LAN server for the CLI (`ais serve`): node:http + SSE, same protocol as src-tauri/src/remote.rs.
import * as http from "node:http";
import * as os from "node:os";
import type { Transport } from "./transport";
import { remoteUrl } from "./remote";
import remoteHtml from "@/remote/remote.html?raw";

type Handler = (cmd: { id: string; action: string; payload: Record<string, unknown> }) => Promise<Record<string, unknown>>;

let server: http.Server | null = null;
let token = "";
let url = "";
let ip = "";
let lastSnapshot: unknown = null;
let handler: Handler | null = null;
const clients = new Set<http.ServerResponse>();

/** First non-internal IPv4 address (what the phone can reach on the WiFi). */
export function localIp(): string {
  for (const list of Object.values(os.networkInterfaces())) {
    for (const i of list ?? []) {
      if (i.family === "IPv4" && !i.internal) return i.address;
    }
  }
  return "127.0.0.1";
}

function authorized(req: http.IncomingMessage, reqUrl: URL): boolean {
  const q = reqUrl.searchParams.get("token");
  const h = req.headers.authorization;
  const bearer = h && h.startsWith("Bearer ") ? h.slice(7) : undefined;
  return !!token && (q === token || bearer === token);
}

function json(res: http.ServerResponse, status: number, body: unknown): void {
  res.writeHead(status, { "Content-Type": "application/json; charset=utf-8", "Cache-Control": "no-store" });
  res.end(JSON.stringify(body));
}

function readBody(req: http.IncomingMessage): Promise<Record<string, unknown>> {
  return new Promise((resolve) => {
    let data = "";
    req.on("data", (c) => { data += c; if (data.length > 1_000_000) req.destroy(); });
    req.on("end", () => { try { resolve(data ? JSON.parse(data) : {}); } catch { resolve({}); } });
    req.on("error", () => resolve({}));
  });
}

const ACTIONS: Record<string, string> = {
  "/api/prompt": "prompt",
  "/api/instruct": "instruct",
  "/api/stop": "stop",
  "/api/approve": "approve",
  "/api/chat": "chat",
};

async function onRequest(req: http.IncomingMessage, res: http.ServerResponse): Promise<void> {
  const reqUrl = new URL(req.url || "/", "http://localhost");
  if (!authorized(req, reqUrl)) { json(res, 401, { error: "Token inválido" }); return; }
  const path = reqUrl.pathname;

  if (req.method === "GET" && path === "/") {
    res.writeHead(200, { "Content-Type": "text/html; charset=utf-8", "Cache-Control": "no-store" });
    res.end(remoteHtml);
    return;
  }
  if (req.method === "GET" && path === "/api/state") {
    const snap = handler ? await handler({ id: "state", action: "state", payload: {} }) : lastSnapshot;
    json(res, 200, snap ?? {});
    return;
  }
  if (req.method === "GET" && path === "/api/events") {
    res.writeHead(200, { "Content-Type": "text/event-stream", "Cache-Control": "no-store", "Connection": "keep-alive" });
    res.write(":ok\n\n");
    const snap = handler ? await handler({ id: "state", action: "state", payload: {} }) : lastSnapshot;
    if (snap) res.write(`event: state\ndata: ${JSON.stringify(snap)}\n\n`);
    clients.add(res);
    const ping = setInterval(() => { try { res.write("event: ping\ndata: {}\n\n"); } catch { /* closed */ } }, 20000);
    req.on("close", () => { clearInterval(ping); clients.delete(res); });
    return;
  }
  if (req.method === "POST" && ACTIONS[path]) {
    if (!handler) { json(res, 503, { error: "Servidor sin orquestador" }); return; }
    const payload = await readBody(req);
    const result = await handler({ id: crypto.randomUUID(), action: ACTIONS[path], payload });
    json(res, result.error ? 400 : 200, result);
    return;
  }
  json(res, 404, { error: "No encontrado" });
}

export const nodeRemote: Pick<Transport, "remoteStart" | "remoteStop" | "remoteStatus" | "remotePushState" | "onRemoteCommand"> = {
  remoteStart: (port, tok) => new Promise((resolve, reject) => {
    if (server) { resolve({ url, ip }); return; }
    token = tok;
    const s = http.createServer((req, res) => { void onRequest(req, res); });
    s.on("error", (err: NodeJS.ErrnoException) => {
      server = null;
      reject(new Error(err.code === "EADDRINUSE" ? `El puerto ${port} está ocupado` : err.message));
    });
    s.listen(port, "0.0.0.0", () => {
      server = s;
      ip = localIp();
      url = remoteUrl(ip, port, token);
      resolve({ url, ip });
    });
  }),
  remoteStop: async () => {
    for (const c of clients) { try { c.end(); } catch { /* ignore */ } }
    clients.clear();
    await new Promise<void>((resolve) => { if (!server) return resolve(); server.close(() => resolve()); server = null; });
  },
  remoteStatus: async () => ({ running: !!server, url: server ? url : undefined, ip: server ? ip : undefined, clients: clients.size }),
  remotePushState: async (snapshot) => {
    lastSnapshot = snapshot;
    const line = `event: state\ndata: ${JSON.stringify(snapshot)}\n\n`;
    for (const c of clients) { try { c.write(line); } catch { clients.delete(c); } }
  },
  onRemoteCommand: async (h) => { handler = h; return () => { if (handler === h) handler = null; }; },
};
