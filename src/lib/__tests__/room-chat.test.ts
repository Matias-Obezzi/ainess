// A room's chat is a record: nobody writes in it, and what was already in it is not lost.
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { translateNow } from "@/i18n/useT";
import { appendChatMessage, editChatMessage, sendChatMessage } from "@/lib/chat";
import type { ChatMessage } from "@/types";

const logged: ChatMessage = { id: "m1", chatId: "c1", ts: 1, from: "Arquitecto @ PC-2", text: "hola", room: { machine: "pc2", kind: "agent" } };
let onDisk: string | null = null;
const written: string[] = [];

describe("a room's chat", () => {
  beforeEach(() => {
    onDisk = null;
    written.length = 0;
    setTransport({
      ...nullTransport,
      readTextFile: async () => onDisk,
      writeTextFile: async (_path: string, text: string) => { written.push(text); },
    } as never);
    useAppStore.setState(s => ({
      chatMessages: { c1: [logged] },
      chatQueues: {},
      config: {
        ...s.config,
        chats: [{ id: "c1", projectId: "p1", name: "Sala", mode: "shared", participants: [{ agentId: "a0", role: "planner" }], createdAt: 1 }],
        projects: [{
          id: "p1", name: "P", workspaceDir: "C:/p", createdAt: 1,
          agents: [{ id: "a0", name: "Jefe", provider: "claude", role: "planner", parentId: null }],
          room: { enabled: true, backend: "supabase", room: "sala", secret: "k", supabaseUrl: "https://x.supabase.co", supabaseKey: "k", chatId: "c1", allowed: {} },
        }] as never,
      },
    }));
  });

  it("refuses a message", async () => {
    await expect(sendChatMessage("c1", "hola")).rejects.toThrow(translateNow("room.readOnly"));
    expect(useAppStore.getState().chatMessages.c1).toEqual([logged]);
  });

  it("refuses an edit without cutting the history", async () => {
    await expect(editChatMessage("c1", "m1", "otra cosa")).rejects.toThrow(translateNow("room.readOnly"));
    expect(useAppStore.getState().chatMessages.c1).toEqual([logged]);
  });

  it("empties a queue left from before without refusing", async () => {
    useAppStore.setState({ chatQueues: { c1: ["de antes"] } });
    await expect(useAppStore.getState().flushChatQueue("c1")).resolves.toBeUndefined();
    expect(useAppStore.getState().chatQueues.c1).toEqual([]);
    expect(useAppStore.getState().chatMessages.c1).toEqual([logged]);
  });

  it("keeps the history on disk when something arrives before the chat was opened", async () => {
    onDisk = JSON.stringify({ messages: [logged], sessions: {} });
    useAppStore.setState({ chatMessages: {} });
    const arrived = { ...logged, id: "m2", ts: 2, text: "sigo" };

    await appendChatMessage("c1", arrived);

    expect(useAppStore.getState().chatMessages.c1.map(m => m.id)).toEqual(["m1", "m2"]);
    expect(JSON.parse(written[written.length - 1]).messages.map((m: ChatMessage) => m.id)).toEqual(["m1", "m2"]);
  });
});
