// A project's room: who gets in, what lands in the chat, what goes out and when the agents answer.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { isValidMessage, makeMessage } from "@/lib/room/protocol";

const sent: unknown[] = [];
let deliver: (raw: unknown) => void = () => {};
vi.mock("@/lib/room/transports", () => ({
  openRoomTransport: (_cfg: unknown, h: { onMessage: (m: unknown) => void; onStatus: (s: string) => void }) => {
    deliver = h.onMessage;
    return { send: async (m: unknown) => { sent.push(m); }, stop: () => {} };
  },
}));
const appended: Array<{ chatId: string; from: string; text: string }> = [];
const turns: Array<{ chatId: string; prompt: string }> = [];
vi.mock("@/lib/chat", () => ({
  appendChatMessage: async (chatId: string, m: { from: string; text: string }) => {
    appended.push({ chatId, from: m.from, text: m.text });
    useAppStore.setState(s => ({ chatMessages: { ...s.chatMessages, [chatId]: [...(s.chatMessages[chatId] ?? []), m as never] } }));
  },
  isChatActive: () => false,
  startRoomTurn: async (chatId: string, prompt: string) => { turns.push({ chatId, prompt }); },
}));

const KEY = "clave";
const other = { machine: "pc2", machineName: "PC-2" };

describe("room", () => {
  beforeEach(() => {
    sent.length = 0; appended.length = 0; turns.length = 0;
    useAppStore.setState(s => ({
      chatMessages: {},
      config: {
        ...s.config,
        machine: { id: "me", name: "Mi PC" },
        chats: [{ id: "c1", projectId: "p1", name: "Sala", mode: "shared", participants: [{ agentId: "a1", role: "planner" }], createdAt: 1 }],
        projects: [{
          id: "p1", name: "P", workspaceDir: "C:/p", createdAt: 1,
          agents: [{ id: "a1", name: "Planner", provider: "claude", role: "planner", parentId: null }],
          room: { enabled: true, backend: "supabase", room: "sala", secret: KEY, supabaseUrl: "https://x.supabase.co", supabaseKey: "k", chatId: "c1", allowed: { pc2: "PC-2" } },
        }] as never,
      },
    }));
  });

  it("lets an allowed machine in, keeps the rest out, and answers", async () => {
    const { startRooms } = await import("@/lib/room");
    const stop = startRooms();

    deliver(await makeMessage(KEY, other, "Arquitecto", "¿Arrancamos con la API?", "agent"));
    deliver(await makeMessage(KEY, { machine: "pc3", machineName: "PC-3" }, "Intruso", "hola", "human"));
    deliver(await makeMessage("otra-clave", other, "Arquitecto", "falso", "agent"));
    await vi.waitFor(() => expect(turns).toHaveLength(1));

    expect(appended).toEqual([{ chatId: "c1", from: "Arquitecto @ PC-2", text: "¿Arrancamos con la API?" }]);
    expect(turns[0].prompt).toBe("[Arquitecto @ PC-2] ¿Arrancamos con la API?");

    const { roomPublish } = await import("@/lib/room");
    roomPublish("c1", "Planner", "Sí, arranco por el modelo.", "agent");
    await vi.waitFor(() => expect(sent.some(m => (m as { text?: string }).text === "Sí, arranco por el modelo.")).toBe(true));
    const out = sent.find(m => (m as { text?: string }).text === "Sí, arranco por el modelo.");
    expect(await isValidMessage(out, KEY)).toBe(true);
    stop();
  });

  it("stays quiet when the message is for someone else", async () => {
    const { startRooms } = await import("@/lib/room");
    const stop = startRooms();
    // Arquitecto has spoken before, so its name is known; then someone talks to it alone.
    deliver(await makeMessage(KEY, other, "Arquitecto", "Propongo un esquema.", "agent"));
    await vi.waitFor(() => expect(turns).toHaveLength(1));
    deliver(await makeMessage(KEY, other, "", "@Arquitecto fijate el esquema", "human"));
    await vi.waitFor(() => expect(appended).toHaveLength(2));
    expect(turns).toHaveLength(1);
    stop();
  });
});
