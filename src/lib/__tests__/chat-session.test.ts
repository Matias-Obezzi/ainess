// Two chats with the same agent are two conversations.
//
// The agent has one slot for a provider session and it holds whichever conversation spoke last.
// Reading that slot on behalf of a chat is how a message sent in one came back answered with the
// other's context — so a chat hands over its own session, and never borrows that slot.
import { describe, it, expect } from "vitest";
import { resumeSessionId } from "@/lib/orchestrator";

const AGENT_SLOT = "session-of-whoever-spoke-last";

describe("resumeSessionId", () => {
  it("continues the session the caller owns, whatever the agent's slot says", () => {
    expect(resumeSessionId({ chatId: "chat-a", sessionId: "session-a" }, AGENT_SLOT)).toBe("session-a");
    expect(resumeSessionId({ chatId: "chat-b", sessionId: "session-b" }, AGENT_SLOT)).toBe("session-b");
  });

  it("starts a chat fresh rather than picking up another chat's session", () => {
    // The exact case: a second chat opened with an agent that is already talking somewhere else.
    expect(resumeSessionId({ chatId: "chat-new", resume: true }, AGENT_SLOT)).toBeUndefined();
    expect(resumeSessionId({ chatId: "chat-new" }, AGENT_SLOT)).toBeUndefined();
  });

  it("still resumes an agent's own line of work from its slot", () => {
    expect(resumeSessionId({ resume: true }, AGENT_SLOT)).toBe(AGENT_SLOT);
  });

  it("starts fresh when nothing asked to resume", () => {
    expect(resumeSessionId({}, AGENT_SLOT)).toBeUndefined();
    expect(resumeSessionId({ resume: false }, AGENT_SLOT)).toBeUndefined();
  });

  it("has nothing to resume on a machine where the agent never ran", () => {
    expect(resumeSessionId({ resume: true }, undefined)).toBeUndefined();
    expect(resumeSessionId({ chatId: "chat-a", sessionId: "session-a" }, undefined)).toBe("session-a");
  });
});
