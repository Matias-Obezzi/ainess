// A project's room: who gets in, what reaches the orchestrator, what goes out and when it stops.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { translateNow } from "@/i18n/useT";
import { isValidMessage, makeMessage, QUIET_MS } from "@/lib/room/protocol";
import { isRoomSpeaker, roomSay, startRooms } from "@/lib/room";

const sent: unknown[] = [];
let sendFails = false;
let deliver: (raw: unknown) => void = () => {};
vi.mock("@/lib/room/transports", () => ({
  openRoomTransport: (_cfg: unknown, h: { onMessage: (m: unknown) => void; onStatus: (s: string) => void }) => {
    deliver = h.onMessage;
    return {
      send: async (m: unknown) => {
        if (sendFails) throw new Error("down");
        sent.push(m);
      },
      stop: () => {},
    };
  },
}));
const appended: Array<{ chatId: string; from: string; text: string }> = [];
vi.mock("@/lib/chat", () => ({
  appendChatMessage: async (chatId: string, m: { from: string; text: string }) => {
    appended.push({ chatId, from: m.from, text: m.text });
    useAppStore.setState(s => ({ chatMessages: { ...s.chatMessages, [chatId]: [...(s.chatMessages[chatId] ?? []), m as never] } }));
  },
}));
const { instructAgent } = vi.hoisted(() => ({ instructAgent: vi.fn(async () => {}) }));
vi.mock("@/lib/orchestrator", async original => ({
  ...(await original<typeof import("@/lib/orchestrator")>()),
  instructAgent,
}));

const KEY = "clave";
const other = { machine: "pc2", machineName: "PC-2" };

function setProjects(maxTurns?: number) {
  useAppStore.setState(s => ({
    chatMessages: {},
    messages: [],
    config: {
      ...s.config,
      machine: { id: "me", name: "Mi PC" },
      chats: [{ id: "c1", projectId: "p1", name: "Sala", mode: "shared", participants: [{ agentId: "a0", role: "planner" }], createdAt: 1 }],
      projects: [{
        id: "p1", name: "P", workspaceDir: "C:/p", createdAt: 1,
        agents: [
          { id: "a0", name: "Planner", provider: "claude", role: "planner", parentId: null },
          { id: "a1", name: "Impl", provider: "claude", role: "implementer", parentId: "a0" },
        ],
        room: { enabled: true, backend: "supabase", room: "sala", secret: KEY, supabaseUrl: "https://x.supabase.co", supabaseKey: "k", chatId: "c1", allowed: { pc2: "PC-2" }, maxTurns },
      }] as never,
    },
  }));
  startRooms()();
}

/** What arrives goes through the signature check on its own time. */
const settle = () => new Promise(r => setTimeout(r, 30));
const say = async (sender: string, text: string) => deliver(await makeMessage(KEY, other, sender, text, "agent"));
const delivered = () => instructAgent.mock.calls.map(c => (c as unknown as [string, string, string, { from: string }]));

describe("room", () => {
  beforeEach(() => {
    // Hubs and undelivered lines are module state: a config with no rooms drops both.
    useAppStore.setState(s => ({ config: { ...s.config, projects: [] } }));
    startRooms()();
    sent.length = 0; appended.length = 0; sendFails = false;
    instructAgent.mockClear();
    setProjects();
  });

  it("logs a message from an allowed machine and hands it to the orchestrator once", async () => {
    await say("Arquitecto", "¿Arrancamos con la API?");
    await vi.waitFor(() => expect(delivered()).toHaveLength(1));
    await settle();

    expect(appended).toEqual([{ chatId: "c1", from: "Arquitecto @ PC-2", text: "¿Arrancamos con la API?" }]);
    const [agentId, prompt, projectId, opts] = delivered()[0];
    expect(agentId).toBe("a0");
    expect(projectId).toBe("p1");
    expect(opts).toEqual({ from: "system" });
    expect(prompt).toBe(`${translateNow("prompt.room.incoming")}\n\n[Arquitecto @ PC-2] ¿Arrancamos con la API?`);
    expect(delivered()).toHaveLength(1);
  });

  it("neither logs nor delivers an unknown machine, a false signature or a person", async () => {
    deliver(await makeMessage(KEY, { machine: "pc3", machineName: "PC-3" }, "Intruso", "hola", "agent"));
    deliver(await makeMessage("otra-clave", other, "Arquitecto", "falso", "agent"));
    deliver(await makeMessage(KEY, other, "Juan", "soy una persona", "human"));
    await settle();

    expect(appended).toEqual([]);
    expect(delivered()).toEqual([]);
  });

  it("holds a message meant for someone else and hands it over with the next one", async () => {
    await say("Arquitecto", "Propongo un esquema.");
    await vi.waitFor(() => expect(delivered()).toHaveLength(1));

    await say("Otro", "@Arquitecto fijate el esquema");
    await vi.waitFor(() => expect(appended).toHaveLength(2));
    await settle();
    expect(delivered()).toHaveLength(1);

    await say("Otro", "¿seguimos?");
    await vi.waitFor(() => expect(delivered()).toHaveLength(2));
    expect(delivered()[1][1]).toContain("[Otro @ PC-2] @Arquitecto fijate el esquema\n\n[Otro @ PC-2] ¿seguimos?");
  });

  it("stops at the turn limit and picks up once the room has been quiet", async () => {
    setProjects(2);
    await say("Arquitecto", "uno");
    await vi.waitFor(() => expect(delivered()).toHaveLength(1));
    await say("Arquitecto", "dos");
    await vi.waitFor(() => expect(appended).toHaveLength(2));
    await settle();
    expect(delivered()).toHaveLength(1);

    const later = Date.now() + QUIET_MS + 1;
    const clock = vi.spyOn(Date, "now").mockReturnValue(later);
    try {
      await say("Arquitecto", "tres");
      await vi.waitFor(() => expect(delivered()).toHaveLength(2));
    } finally {
      clock.mockRestore();
    }
    expect(delivered()[1][1]).toContain("[Arquitecto @ PC-2] dos\n\n[Arquitecto @ PC-2] tres");
  });

  it("publishes what the orchestrator says, signed, and logs it", async () => {
    await roomSay("p1", "Planner", "Sí, arranco por el modelo.");

    const out = sent.find(m => (m as { text?: string }).text === "Sí, arranco por el modelo.");
    expect(await isValidMessage(out, KEY)).toBe(true);
    expect(out).toMatchObject({ kind: "agent", sender: "Planner", machine: "me" });
    expect(appended).toEqual([{ chatId: "c1", from: "Planner @ Mi PC", text: "Sí, arranco por el modelo." }]);
  });

  it("says so when a message could not go out, and does not log it as sent", async () => {
    sendFails = true;
    await roomSay("p1", "Planner", "esto se pierde", "r1");

    expect(appended).toEqual([]);
    const notices = useAppStore.getState().messages.filter(m => m.kind === "system");
    expect(notices.map(m => m.text)).toEqual([translateNow("room.notSent", { text: "esto se pierde" })]);
    expect(notices[0].runId).toBe("r1");
  });

  it("lets only the orchestrator of a room that is on speak", () => {
    expect(isRoomSpeaker("p1", "a0")).toBe(true);
    expect(isRoomSpeaker("p1", "a1")).toBe(false);
    useAppStore.setState(s => ({
      config: { ...s.config, projects: s.config.projects.map(p => ({ ...p, room: { ...p.room!, enabled: false } })) },
    }));
    expect(isRoomSpeaker("p1", "a0")).toBe(false);
  });
});
