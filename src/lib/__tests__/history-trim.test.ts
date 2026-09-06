import { describe, it, expect } from "vitest";
import { trimMessagesInMemory } from "@/lib/history";
import type { CommMessage } from "@/types";

const msg = (id: string, projectId: string, ts: number): CommMessage => ({
  id,
  ts,
  projectId,
  fromAgentId: "a1",
  kind: "text",
  text: id,
});

/** The feed used to grow for as long as the app stayed open; it is now capped per project. */
describe("trimMessagesInMemory", () => {
  it("leaves a feed that fits untouched, and the same array", () => {
    const messages = [msg("1", "p1", 1), msg("2", "p2", 2)];
    expect(trimMessagesInMemory(messages)).toBe(messages);
  });

  it("keeps the newest per project and counts each project on its own", () => {
    const many: CommMessage[] = [];
    for (let i = 0; i < 3200; i++) many.push(msg(`p1-${i}`, "p1", i));
    // A quiet project must not lose anything because a noisy one filled up.
    many.push(msg("p2-only", "p2", 9999));

    const trimmed = trimMessagesInMemory(many);
    const p1 = trimmed.filter(m => m.projectId === "p1");
    const p2 = trimmed.filter(m => m.projectId === "p2");

    expect(p1).toHaveLength(3000);
    expect(p1[0].id).toBe("p1-200");
    expect(p1[p1.length - 1].id).toBe("p1-3199");
    expect(p2).toHaveLength(1);
  });

  it("keeps the original order", () => {
    const many: CommMessage[] = [];
    for (let i = 0; i < 3100; i++) many.push(msg(`m-${i}`, "p1", i));
    const trimmed = trimMessagesInMemory(many);
    const timestamps = trimmed.map(m => m.ts);
    expect([...timestamps].sort((a, b) => a - b)).toEqual(timestamps);
  });
});
