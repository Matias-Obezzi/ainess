// Tests for store actions editQueuedInstruction and editQueuedChatMessage.
import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { changedProjectsFromMessages } from "@/lib/history";
import type { CommMessage } from "@/types";

describe("store queued edit actions", () => {
  beforeEach(() => {
    useAppStore.setState({
      chatQueues: {},
      messages: [],
      runtime: {},
    });
  });

  describe("editQueuedChatMessage", () => {
    it("edits the queued chat message in place when previous matches", () => {
      useAppStore.setState({
        chatQueues: { "chat-1": ["first", "second", "third"] },
      });

      useAppStore.getState().editQueuedChatMessage("chat-1", 1, "second", "second edited");
      expect(useAppStore.getState().chatQueues["chat-1"]).toEqual(["first", "second edited", "third"]);
    });

    it("is a no-op when previous does not match (stale edit)", () => {
      useAppStore.setState({
        chatQueues: { "chat-1": ["first", "second", "third"] },
      });

      useAppStore.getState().editQueuedChatMessage("chat-1", 1, "stale", "second edited");
      expect(useAppStore.getState().chatQueues["chat-1"]).toEqual(["first", "second", "third"]);
    });

    it("removes the queued chat message when next is trimmed empty", () => {
      useAppStore.setState({
        chatQueues: { "chat-1": ["first", "second", "third"] },
      });

      useAppStore.getState().editQueuedChatMessage("chat-1", 1, "second", "   ");
      expect(useAppStore.getState().chatQueues["chat-1"]).toEqual(["first", "third"]);
    });

    it("touches no history", () => {
      const initialMessages: CommMessage[] = [{
        id: "msg-1",
        ts: 100,
        projectId: "p1",
        fromAgentId: "user",
        toAgentId: "a1",
        kind: "instruction",
        text: "second",
      }];
      useAppStore.setState({
        chatQueues: { "chat-1": ["first", "second"] },
        messages: initialMessages,
      });

      useAppStore.getState().editQueuedChatMessage("chat-1", 1, "second", "second edited");
      expect(useAppStore.getState().messages).toBe(initialMessages);
    });
  });

  describe("editQueuedInstruction", () => {
    const setupInstruction = (queue: string[], messages: CommMessage[]) => {
      useAppStore.setState({
        runtime: {
          p1: {
            a1: {
              agentId: "a1",
              status: "working",
              queuedInstructions: queue,
            } as never,
          },
        },
        messages,
      });
    };

    it("edits the queued instruction in place and updates matching history message", () => {
      const msg: CommMessage = {
        id: "m1",
        ts: 100,
        projectId: "p1",
        fromAgentId: "user",
        toAgentId: "a1",
        kind: "instruction",
        text: "original instruction",
      };
      setupInstruction(["original instruction"], [msg]);

      useAppStore.getState().editQueuedInstruction("p1", "a1", 0, "original instruction", "edited instruction");

      expect(useAppStore.getState().runtime.p1.a1.queuedInstructions).toEqual(["edited instruction"]);
      expect(useAppStore.getState().messages[0].text).toBe("edited instruction");
      expect(useAppStore.getState().messages[0].id).toBe("m1");
    });

    it("produces a messages array that changedProjectsFromMessages marks as changed", () => {
      const msg: CommMessage = {
        id: "m1",
        ts: 100,
        projectId: "p1",
        fromAgentId: "user",
        toAgentId: "a1",
        kind: "instruction",
        text: "original instruction",
      };
      setupInstruction(["original instruction"], [msg]);
      const prevMessages = useAppStore.getState().messages;

      useAppStore.getState().editQueuedInstruction("p1", "a1", 0, "original instruction", "edited instruction");

      const nextMessages = useAppStore.getState().messages;
      expect(changedProjectsFromMessages(nextMessages, prevMessages)).toEqual(["p1"]);
    });

    it("is a no-op when previous does not match (stale edit)", () => {
      const msg: CommMessage = {
        id: "m1",
        ts: 100,
        projectId: "p1",
        fromAgentId: "user",
        toAgentId: "a1",
        kind: "instruction",
        text: "original instruction",
      };
      setupInstruction(["original instruction"], [msg]);

      useAppStore.getState().editQueuedInstruction("p1", "a1", 0, "stale text", "edited instruction");

      expect(useAppStore.getState().runtime.p1.a1.queuedInstructions).toEqual(["original instruction"]);
      expect(useAppStore.getState().messages[0].text).toBe("original instruction");
    });

    it("removes the queued instruction when next is trimmed empty but leaves history untouched", () => {
      const msg: CommMessage = {
        id: "m1",
        ts: 100,
        projectId: "p1",
        fromAgentId: "user",
        toAgentId: "a1",
        kind: "instruction",
        text: "original instruction",
      };
      setupInstruction(["first", "original instruction"], [msg]);

      useAppStore.getState().editQueuedInstruction("p1", "a1", 1, "original instruction", "");

      expect(useAppStore.getState().runtime.p1.a1.queuedInstructions).toEqual(["first"]);
      // History remains unchanged
      expect(useAppStore.getState().messages[0].text).toBe("original instruction");
    });
  });
});
