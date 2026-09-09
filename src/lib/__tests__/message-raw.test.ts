import { describe, it, expect } from "vitest";
import type { CommMessage } from "@/types";
import { messageRawText } from "@/lib/message-raw";

describe("messageRawText", () => {
  it("formats a simple text message with sender, recipient, kind, and complete text", () => {
    const msg: CommMessage = {
      id: "m-simple",
      ts: 1725840000000,
      fromAgentId: "agent-1",
      toAgentId: "agent-2",
      kind: "text",
      text: "Hello from Agent 1 to Agent 2",
    };
    const raw = messageRawText(msg, { from: "Agent One", to: "Agent Two" });

    expect(raw).toContain("Agent One");
    expect(raw).toContain("Agent Two");
    expect(raw).toContain("Kind: text");
    expect(raw).toContain("Hello from Agent 1 to Agent 2");
    expect(raw).toContain(new Date(msg.ts).toISOString());
  });

  it("does not truncate a long message of several thousand characters", () => {
    const longText = "LOREM_IPSUM_START_" + "x".repeat(15000) + "_LOREM_IPSUM_END";
    const msg: CommMessage = {
      id: "m-long",
      ts: 1725840000000,
      fromAgentId: "agent-1",
      kind: "text",
      text: longText,
    };
    const raw = messageRawText(msg, { from: "Agent" });

    expect(raw).toContain(longText);
    expect(raw.length).toBeGreaterThanOrEqual(longText.length);
  });

  it("formats a tool message with meta: tool, summary, and formatted JSON input", () => {
    const msg: CommMessage = {
      id: "m-tool",
      ts: 1725840000000,
      fromAgentId: "agent-1",
      kind: "tool",
      text: "Executed tool command",
      meta: {
        tool: "read_file",
        summary: "Reading configuration file",
        input: { path: "package.json", lines: [1, 20] },
      },
    };
    const raw = messageRawText(msg, { from: "Agent" });

    expect(raw).toContain("Tool: read_file");
    expect(raw).toContain("Summary: Reading configuration file");
    expect(raw).toContain(JSON.stringify({ path: "package.json", lines: [1, 20] }, null, 2));
    expect(raw).toContain("Executed tool command");
  });

  it("includes error when meta has failed: true and error is present", () => {
    const msg: CommMessage = {
      id: "m-tool-fail",
      ts: 1725840000000,
      fromAgentId: "agent-1",
      kind: "tool",
      text: "Tool execution failed",
      meta: {
        tool: "execute_command",
        summary: "Running bash script",
        failed: true,
        error: "Command timed out after 30000ms",
      },
    };
    const raw = messageRawText(msg, { from: "Agent" });

    expect(raw).toContain("Tool: execute_command");
    expect(raw).toContain("Error: Command timed out after 30000ms");
  });

  it("does not invent a tool section when meta is not present", () => {
    const msg: CommMessage = {
      id: "m-no-meta",
      ts: 1725840000000,
      fromAgentId: "agent-1",
      kind: "text",
      text: "Message without tool meta",
    };
    const raw = messageRawText(msg, { from: "Agent" });

    expect(raw).not.toContain("Tool:");
    expect(raw).not.toContain("Summary:");
    expect(raw).not.toContain("Input:");
    expect(raw).not.toContain("Error:");
  });

  it("does not throw on circular meta.input and outputs the rest of the raw text", () => {
    const circularObj: Record<string, unknown> = { key: "value" };
    circularObj.self = circularObj;

    const msg: CommMessage = {
      id: "m-circular",
      ts: 1725840000000,
      fromAgentId: "agent-1",
      kind: "tool",
      text: "Running with circular data",
      meta: {
        tool: "circular_inspector",
        summary: "Testing circular robustness",
        input: circularObj,
      },
    };

    let raw = "";
    expect(() => {
      raw = messageRawText(msg, { from: "Agent" });
    }).not.toThrow();

    expect(raw).toContain("Running with circular data");
    expect(raw).toContain("Tool: circular_inspector");
    expect(raw).toContain("Summary: Testing circular robustness");
    expect(raw).toContain("[Could not serialize input]");
  });

  it("does not write an arrow to nowhere when toAgentId is missing", () => {
    const msg: CommMessage = {
      id: "m-no-to",
      ts: 1725840000000,
      fromAgentId: "agent-1",
      kind: "note",
      text: "A message with no recipient",
    };

    const rawWithoutTo = messageRawText(msg, { from: "Solo Agent" });
    expect(rawWithoutTo).toContain("From: Solo Agent");
    expect(rawWithoutTo).not.toContain("→");
    expect(rawWithoutTo).not.toContain("->");
    expect(rawWithoutTo).not.toContain("undefined");

    // Even if a 'to' string is passed in names, without toAgentId on message no arrow should appear
    const rawWithExtraTo = messageRawText(msg, { from: "Solo Agent", to: "Nobody" });
    expect(rawWithExtraTo).toContain("From: Solo Agent");
    expect(rawWithExtraTo).not.toContain("→");
    expect(rawWithExtraTo).not.toContain("->");
    expect(rawWithExtraTo).not.toContain("Nobody");
  });

  it("includes runId when provided", () => {
    const msg: CommMessage = {
      id: "m-run",
      ts: 1725840000000,
      fromAgentId: "agent-1",
      kind: "text",
      text: "Message from run",
      runId: "run-abc-987",
    };
    const raw = messageRawText(msg, { from: "Agent" });
    expect(raw).toContain("Run: run-abc-987");
  });

  it("works seamlessly with translated names without requiring mocks", async () => {
    const { translateNow } = await import("@/i18n/useT");
    const userName = translateNow("label.kind.user");
    const msg: CommMessage = {
      id: "m-user",
      ts: 1725840000000,
      fromAgentId: "user",
      toAgentId: "agent-1",
      kind: "text",
      text: "Instructions from user",
    };
    const raw = messageRawText(msg, { from: userName, to: "Worker" });
    expect(raw).toContain(userName);
    expect(raw).toContain("Worker");
    expect(raw).toContain(`From: ${userName} → Worker`);
  });
});
