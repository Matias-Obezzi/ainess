// A chat whose history came back empty after sending a message.
//
// Loading is a file read, and a file read takes time. Everything below is about that window: a
// message sent inside it, a read that fails inside it, and a file written inside it. The thread
// went blank in each case and only came back by leaving the chat and returning, because the next
// visit retried the read.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { useAppStore } from "@/store";
import { setTransport, getTransport } from "@/lib/transport";
import { mergeLoaded } from "@/lib/chat-merge";
import { loadChatMessages } from "@/lib/chat";
import type { ChatMessage } from "@/types";

const msg = (id: string, text = id): ChatMessage => ({ id, chatId: "c1", ts: 1, from: "user", text });

describe("mergeLoaded", () => {
  it("keeps what arrived while the file was being read, after the file", () => {
    const merged = mergeLoaded([msg("viejo")], [msg("recien-mandado")]);
    expect(merged.map(m => m.id)).toEqual(["viejo", "recien-mandado"]);
  });

  it("never shows a message twice", () => {
    const merged = mergeLoaded([msg("a"), msg("b")], [msg("b"), msg("c")]);
    expect(merged.map(m => m.id)).toEqual(["a", "b", "c"]);
  });

  it("prefers the copy in memory, which is the live one", () => {
    const fromFile = [{ ...msg("a"), text: "en disco" }];
    const inMemory = [{ ...msg("a"), text: "ya contestado" }];
    expect(mergeLoaded(fromFile, inMemory)[0].text).toBe("ya contestado");
  });

  it("is the file alone when nothing happened meanwhile", () => {
    const fromFile = [msg("a")];
    expect(mergeLoaded(fromFile, [])).toBe(fromFile);
  });
});

describe("loadChatMessages", () => {
  beforeEach(() => {
    useAppStore.setState({ chatMessages: {}, chatSessions: {}, chatLoading: {} } as never);
  });

  const withRead = (read: () => Promise<string>) =>
    setTransport({ ...getTransport(), readTextFile: read } as never);

  it("brings the history in", async () => {
    withRead(async () => JSON.stringify({ messages: [msg("a"), msg("b")], sessions: {} }));
    await loadChatMessages("c1");
    expect(useAppStore.getState().chatMessages.c1.map(m => m.id)).toEqual(["a", "b"]);
  });

  it("does not swallow a message sent while it was reading", async () => {
    withRead(async () => {
      // What sending does: the message goes into memory before the read comes back.
      useAppStore.setState(state => ({ chatMessages: { ...state.chatMessages, c1: [msg("recien")] } }));
      return JSON.stringify({ messages: [msg("viejo")], sessions: {} });
    });

    await loadChatMessages("c1");
    expect(useAppStore.getState().chatMessages.c1.map(m => m.id)).toEqual(["viejo", "recien"]);
  });

  it("leaves the thread alone when the read fails", async () => {
    // A read can land on the moment the same file is being written. It used to throw out of here
    // and leave the chat with nothing until the next visit.
    useAppStore.setState({ chatMessages: { c1: [] } } as never);
    withRead(async () => { throw new Error("EBUSY"); });

    await expect(loadChatMessages("c1")).resolves.toBeUndefined();
    expect(useAppStore.getState().chatMessages.c1).toEqual([]);
    expect(useAppStore.getState().chatLoading.c1).toBe(false);
  });

  it("leaves the thread alone when the file is corrupt", async () => {
    withRead(async () => "{ not json");
    await expect(loadChatMessages("c1")).resolves.toBeUndefined();
    expect(useAppStore.getState().chatLoading.c1).toBe(false);
  });

  it("puts the loading flag down however it ends", async () => {
    withRead(async () => { throw new Error("nope"); });
    await loadChatMessages("c1");
    expect(useAppStore.getState().chatLoading.c1).toBe(false);
  });

  it("does not read again over a history it already has", async () => {
    let reads = 0;
    useAppStore.setState({ chatMessages: { c1: [msg("a")] } } as never);
    withRead(async () => { reads++; return ""; });

    await loadChatMessages("c1");
    expect(reads).toBe(0);
  });
});

vi.mock("@/lib/hooks", () => ({ emitHookEvent: async () => {} }));
