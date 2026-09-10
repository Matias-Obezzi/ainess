// The chat's half of the queue. Same rule as the orchestrator's: what was written while the chat
// was mid-answer goes over as one message when the turn ends, not one message per turn.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/store";

const sent: string[] = [];
const stopped: string[] = [];

beforeEach(() => {
  sent.length = 0;
  stopped.length = 0;
  useAppStore.setState({
    chatQueues: { c1: [] },
    sendChatMessage: async (_chatId: string, text: string) => { sent.push(text); },
    stopChat: async (chatId: string) => { stopped.push(chatId); },
  } as never);
});

const queueAll = (texts: string[]) => {
  for (const text of texts) useAppStore.getState().queueChatMessage("c1", text);
};

describe("flushChatQueue", () => {
  it("sends everything waiting as one message", async () => {
    queueAll(["primero", "segundo", "tercero"]);
    await useAppStore.getState().flushChatQueue("c1");

    expect(sent).toEqual(["primero\n\nsegundo\n\ntercero"]);
    expect(useAppStore.getState().chatQueues.c1).toEqual([]);
  });

  it("sends nothing when nothing was written", async () => {
    await useAppStore.getState().flushChatQueue("c1");
    expect(sent).toEqual([]);
  });

  it("leaves alone what was written while it was sending", async () => {
    queueAll(["primero"]);
    const flush = useAppStore.getState().flushChatQueue("c1");
    // Typed into a chat whose turn has just ended: it belongs to the next one, not this send.
    queueAll(["llegó tarde"]);
    await flush;

    expect(sent).toEqual(["primero"]);
    expect(useAppStore.getState().chatQueues.c1).toEqual(["llegó tarde"]);
  });
});

describe("sendChatNow", () => {
  it("stops the turn and sends the lot, saying it interrupted", async () => {
    queueAll(["primero", "el urgente"]);
    await useAppStore.getState().sendChatNow("c1");

    expect(stopped).toEqual(["c1"]);
    expect(sent).toHaveLength(1);
    expect(sent[0]).toContain("primero\n\nel urgente");
    // The chat must not read its cut turn as one it finished.
    expect(sent[0].length).toBeGreaterThan("primero\n\nel urgente".length);
    expect(useAppStore.getState().chatQueues.c1).toEqual([]);
  });

  it("does not cut a turn short to deliver nothing", async () => {
    await useAppStore.getState().sendChatNow("c1");
    expect(stopped).toEqual([]);
    expect(sent).toEqual([]);
  });

  it("empties the queue before stopping, so the flush that follows does not send it twice", async () => {
    queueAll(["uno"]);
    useAppStore.setState({
      stopChat: async (chatId: string) => {
        stopped.push(chatId);
        // What `lib/chat` does at the end of every turn, cut short or not.
        await useAppStore.getState().flushChatQueue("c1");
      },
    } as never);

    await useAppStore.getState().sendChatNow("c1");
    expect(sent).toHaveLength(1);
  });
});

vi.mock("@/lib/hooks", () => ({ emitHookEvent: async () => {} }));
