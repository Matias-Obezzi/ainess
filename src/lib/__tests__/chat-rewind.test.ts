// Cutting a conversation back to one of its messages.
//
// What this pins: the off-by-one between the two things the menu offers. "Revert to here" keeps the
// message you clicked — it is where the thread should end. "Edit" drops it, because the new text is
// taking its place. Getting that backwards either loses the message the user meant to keep, or
// leaves the old question sitting above its own replacement.
import { describe, it, expect } from "vitest";
import { rewound, rewindRemoves } from "@/lib/chat-rewind";
import type { ChatMessage } from "@/types";

const msg = (id: string, from: string): ChatMessage => ({
  id,
  chatId: "c1",
  ts: 0,
  from,
  text: id,
});

const THREAD = [msg("a", "user"), msg("b", "agent"), msg("c", "user"), msg("d", "agent")];

describe("rewound", () => {
  it("keeps the message itself when reverting to it", () => {
    expect(rewound(THREAD, "b", true).map(m => m.id)).toEqual(["a", "b"]);
  });

  it("drops it too when it is being replaced", () => {
    expect(rewound(THREAD, "c", false).map(m => m.id)).toEqual(["a", "b"]);
  });

  it("reverting to the last message changes nothing", () => {
    expect(rewound(THREAD, "d", true).map(m => m.id)).toEqual(["a", "b", "c", "d"]);
  });

  it("replacing the first message leaves an empty thread", () => {
    expect(rewound(THREAD, "a", false)).toEqual([]);
  });

  it("leaves the thread alone when the message is not in it", () => {
    // The list came from the same render that offered the menu. A miss means something else moved
    // it since, and emptying the conversation on that basis is the worst possible reading.
    expect(rewound(THREAD, "gone", true)).toBe(THREAD);
    expect(rewound(THREAD, "gone", false)).toBe(THREAD);
  });
});

describe("rewindRemoves", () => {
  it("counts what would go", () => {
    expect(rewindRemoves(THREAD, "a", true)).toBe(3);
    expect(rewindRemoves(THREAD, "c", true)).toBe(1);
    expect(rewindRemoves(THREAD, "a", false)).toBe(4);
  });

  it("is zero at the end of the thread, so the menu item can stay disabled", () => {
    expect(rewindRemoves(THREAD, "d", true)).toBe(0);
  });

  it("is zero for a message that is not there", () => {
    expect(rewindRemoves(THREAD, "gone", true)).toBe(0);
  });
});
