// Two things about writing a message. It was component state, so changing view threw it away; and
// while an agent was thinking the box was disabled, which is not how a conversation goes.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/store";

beforeEach(() => {
  useAppStore.setState({ drafts: {}, chatQueues: {} });
});

describe("drafts", () => {
  it("keeps what was typed, by conversation", () => {
    const { setDraft } = useAppStore.getState();
    setDraft("project:p1", "a medio escribir");
    setDraft("chat:c1", "otra cosa");

    expect(useAppStore.getState().drafts["project:p1"]).toBe("a medio escribir");
    expect(useAppStore.getState().drafts["chat:c1"]).toBe("otra cosa");
  });

  it("forgets one that was emptied instead of storing an empty string", () => {
    const { setDraft } = useAppStore.getState();
    setDraft("project:p1", "algo");
    setDraft("project:p1", "");
    expect("project:p1" in useAppStore.getState().drafts).toBe(false);
  });

  it("survives a restart: it is written where the next launch reads it", () => {
    // The test environment has a `localStorage` without methods, which is one of the shapes the
    // store already guards against; this is the one a browser gives it.
    const store = new Map<string, string>();
    vi.stubGlobal("localStorage", {
      getItem: (k: string) => store.get(k) ?? null,
      setItem: (k: string, v: string) => void store.set(k, v),
      removeItem: (k: string) => void store.delete(k),
    });

    useAppStore.getState().setDraft("project:p1", "sigue acá");
    expect(JSON.parse(store.get("ais.drafts") ?? "{}")["project:p1"]).toBe("sigue acá");
    vi.unstubAllGlobals();
  });

  it("does nothing without a conversation to attach it to", () => {
    useAppStore.getState().setDraft("", "huérfano");
    expect(Object.keys(useAppStore.getState().drafts)).toHaveLength(0);
  });
});

describe("messages written mid-turn", () => {
  it("waits in the chat's queue, in the order they came", () => {
    const { queueChatMessage } = useAppStore.getState();
    queueChatMessage("c1", "primero");
    queueChatMessage("c1", "segundo");
    expect(useAppStore.getState().chatQueues["c1"]).toEqual(["primero", "segundo"]);
  });

  it("goes out when the turn ends, oldest first", async () => {
    const sent: Array<[string, string]> = [];
    useAppStore.setState({
      chatQueues: { c1: ["lo que escribí mientras pensaba", "y esto también"] },
      sendChatMessage: async (chatId: string, text: string) => { sent.push([chatId, text]); },
    } as never);

    await useAppStore.getState().flushChatQueue("c1");

    expect(sent).toEqual([["c1", "lo que escribí mientras pensaba"]]);
    expect(useAppStore.getState().chatQueues["c1"]).toEqual(["y esto también"]);
  });

  it("does nothing when nothing was written", async () => {
    const sent: string[] = [];
    useAppStore.setState({ chatQueues: {}, sendChatMessage: async (_c: string, t: string) => { sent.push(t); } } as never);
    await useAppStore.getState().flushChatQueue("c1");
    expect(sent).toHaveLength(0);
  });
});
