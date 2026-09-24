// Tests for safe in-place editing of queued messages and synchronizing instruction history.
import { describe, it, expect } from "vitest";
import { replaceQueuedLine, replaceInstructionHistory } from "@/lib/queued-edit";
import type { CommMessage } from "@/types";

describe("replaceQueuedLine", () => {
  it("replaces the line at index when text matches previous", () => {
    const queue = ["first", "second", "third"];
    const result = replaceQueuedLine(queue, 1, "second", "edited second");
    expect(result).toEqual(["first", "edited second", "third"]);
    // Original queue is untouched
    expect(queue).toEqual(["first", "second", "third"]);
  });

  it("returns null if the line at index does not match previous (stale edit)", () => {
    const queue = ["first", "second", "third"];
    const result = replaceQueuedLine(queue, 1, "stale", "edited second");
    expect(result).toBeNull();
  });

  it("returns null if index is out of bounds", () => {
    const queue = ["first"];
    expect(replaceQueuedLine(queue, -1, "first", "new")).toBeNull();
    expect(replaceQueuedLine(queue, 1, "first", "new")).toBeNull();
    expect(replaceQueuedLine([], 0, "first", "new")).toBeNull();
    expect(replaceQueuedLine(undefined, 0, "first", "new")).toBeNull();
  });

  it("removes the line if next is empty (unqueue semantics)", () => {
    const queue = ["first", "second", "third"];
    const result = replaceQueuedLine(queue, 1, "second", "");
    expect(result).toEqual(["first", "third"]);
  });

  it("removes the line if next is whitespace-only", () => {
    const queue = ["first", "second", "third"];
    const result = replaceQueuedLine(queue, 1, "second", "   \n  \t ");
    expect(result).toEqual(["first", "third"]);
  });
});

describe("replaceInstructionHistory", () => {
  const baseMsg = (id: string, over: Partial<CommMessage> = {}): CommMessage => ({
    id,
    ts: 1000,
    projectId: "proj-1",
    fromAgentId: "user",
    toAgentId: "agent-1",
    kind: "instruction",
    text: "original",
    ...over,
  });

  it("updates the matching instruction message from the end", () => {
    const messages: CommMessage[] = [
      baseMsg("m1", { text: "older" }),
      baseMsg("m2", { text: "fix typo" }),
      baseMsg("m3", { kind: "system", text: "run started" }),
    ];
    const result = replaceInstructionHistory(messages, "proj-1", "agent-1", "fix typo", "fix typos properly");
    expect(result[1].text).toBe("fix typos properly");
    expect(result[0].text).toBe("older");
    expect(result).toHaveLength(3);
  });

  it("updates the latest matching instruction when there are multiple with same text", () => {
    const messages: CommMessage[] = [
      baseMsg("m1", { text: "repeat" }),
      baseMsg("m2", { text: "something else" }),
      baseMsg("m3", { text: "repeat" }),
    ];
    const result = replaceInstructionHistory(messages, "proj-1", "agent-1", "repeat", "updated repeat");
    expect(result[0].text).toBe("repeat");
    expect(result[2].text).toBe("updated repeat");
  });

  it("ignores messages from different projects or agents", () => {
    const messages: CommMessage[] = [
      baseMsg("m1", { projectId: "proj-2", text: "target" }),
      baseMsg("m2", { toAgentId: "agent-2", text: "target" }),
      baseMsg("m3", { kind: "text", text: "target" }),
    ];
    const result = replaceInstructionHistory(messages, "proj-1", "agent-1", "target", "new target");
    expect(result).toBe(messages);
  });

  it("leaves history unchanged if next is empty or whitespace-only", () => {
    const messages: CommMessage[] = [baseMsg("m1", { text: "target" })];
    expect(replaceInstructionHistory(messages, "proj-1", "agent-1", "target", "")).toBe(messages);
    expect(replaceInstructionHistory(messages, "proj-1", "agent-1", "target", "   \t\n")).toBe(messages);
  });

  it("leaves history unchanged if no matching message exists", () => {
    const messages: CommMessage[] = [baseMsg("m1", { text: "different" })];
    expect(replaceInstructionHistory(messages, "proj-1", "agent-1", "target", "next")).toBe(messages);
  });
});
