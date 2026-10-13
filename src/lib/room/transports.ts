// How a room's messages travel: Supabase Realtime Broadcast (a websocket, no tables) or a Firebase
// Realtime Database node (streamed over SSE, written with REST). Channel and path are ai-connector's
// so both apps meet in the same room. Both reconnect on their own; `stop` ends that.
import type { RoomConfig } from "@/types";

export type RoomStatus = "connecting" | "connected" | "error";

export interface RoomTransport {
  send(message: unknown): Promise<void>;
  stop(): void;
}

type Handlers = { onMessage: (message: unknown) => void; onStatus: (status: RoomStatus, detail?: string) => void };

const RETRY_MS = 5_000;

function supabase(cfg: RoomConfig, { onMessage, onStatus }: Handlers): RoomTransport {
  const base = (cfg.supabaseUrl ?? "").trim().replace(/\/+$/, "").replace(/^http/, "ws");
  const key = (cfg.supabaseKey ?? "").trim();
  const topic = `realtime:ai-connector-${cfg.room}`;
  let socket: WebSocket | null = null;
  let ref = 0;
  let stopped = false;
  let beat: ReturnType<typeof setInterval> | undefined;

  const push = (t: string, event: string, payload: unknown, joinRef: string | null = "1") =>
    socket?.readyState === WebSocket.OPEN &&
    socket.send(JSON.stringify({ topic: t, event, payload, ref: String(++ref), join_ref: joinRef }));

  const open = () => {
    if (stopped) return;
    onStatus("connecting");
    socket = new WebSocket(`${base}/realtime/v1/websocket?apikey=${encodeURIComponent(key)}&vsn=1.0.0`);
    socket.onopen = () => {
      push(topic, "phx_join", {
        config: { broadcast: { self: false, ack: false }, presence: { key: "" }, private: false },
        access_token: key,
      });
      beat = setInterval(() => push("phoenix", "heartbeat", {}, null), 25_000);
    };
    socket.onmessage = e => {
      const d = JSON.parse(String(e.data));
      if (d.event === "broadcast") onMessage(d.payload?.payload);
      else if (d.event === "phx_reply" && d.topic === topic) {
        if (d.payload?.status === "ok") onStatus("connected");
        else onStatus("error", JSON.stringify(d.payload?.response ?? d.payload));
      }
    };
    socket.onclose = () => {
      clearInterval(beat);
      if (!stopped) setTimeout(open, RETRY_MS);
    };
    socket.onerror = () => onStatus("error");
  };
  open();

  return {
    async send(message) {
      if (!push(topic, "broadcast", { type: "broadcast", event: "msg", payload: message })) throw new Error("not connected");
    },
    stop() {
      stopped = true;
      clearInterval(beat);
      socket?.close();
    },
  };
}

function firebase(cfg: RoomConfig, { onMessage, onStatus }: Handlers): RoomTransport {
  const base = (cfg.firebaseUrl ?? "").trim().replace(/\/+$/, "");
  const token = (cfg.firebaseToken ?? "").trim();
  const url = `${base}/ai-connector/${encodeURIComponent(cfg.room)}.json${token ? `?auth=${encodeURIComponent(token)}` : ""}`;
  let source: EventSource | null = null;
  let stopped = false;

  const open = () => {
    if (stopped) return;
    onStatus("connecting");
    source = new EventSource(url);
    const handle = (event: MessageEvent, kind: "put" | "patch") => {
      const d = JSON.parse(event.data) as { path: string; data: unknown };
      // shortcut: the first `put` at "/" is the whole history, downloaded and skipped; clear the node now and then.
      if (d.path === "/" && kind === "put") {
        onStatus("connected");
        return;
      }
      const items = d.path === "/" && d.data && typeof d.data === "object" ? Object.values(d.data) : [d.data];
      for (const item of items) onMessage(item);
    };
    source.addEventListener("put", e => handle(e as MessageEvent, "put"));
    source.addEventListener("patch", e => handle(e as MessageEvent, "patch"));
    source.addEventListener("cancel", () => onStatus("error", "cancel"));
    source.addEventListener("auth_revoked", () => onStatus("error", "auth_revoked"));
    source.onerror = () => {
      source?.close();
      onStatus("error");
      if (!stopped) setTimeout(open, RETRY_MS);
    };
  };
  open();

  return {
    async send(message) {
      const res = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(message) });
      if (!res.ok) throw new Error(`Firebase ${res.status}`);
    },
    stop() {
      stopped = true;
      source?.close();
    },
  };
}

export function openRoomTransport(cfg: RoomConfig, handlers: Handlers): RoomTransport {
  return cfg.backend === "firebase" ? firebase(cfg, handlers) : supabase(cfg, handlers);
}
