/**
 * Formatting a message as raw, legible text for inspecting or copying.
 * Pure module, free of React, store, and browser DOM dependencies.
 */

import type { CommMessage } from "@/types";

/** One message as text you can paste somewhere: what it is, who sent it, and everything it carries. */
export function messageRawText(message: CommMessage, names: { from: string; to?: string }): string {
  const lines: string[] = [];

  // ISO timestamp for an unambiguous, timezone-independent timestamp.
  lines.push(`Date: ${new Date(message.ts).toISOString()}`);

  // Only show the recipient arrow when both toAgentId and a resolved name exist.
  const hasRecipient = Boolean(message.toAgentId && names.to);
  lines.push(`From: ${names.from}${hasRecipient ? ` → ${names.to}` : ""}`);

  lines.push(`Kind: ${message.kind}`);

  if (message.runId) {
    lines.push(`Run: ${message.runId}`);
  }

  lines.push("");
  // Complete message text without any clipping or ellipsis.
  lines.push(message.text);

  // Meta is present on tool messages: tool name, summary, input payload, and error if failed.
  if (message.meta) {
    lines.push("");
    lines.push(`Tool: ${message.meta.tool}`);
    if (message.meta.summary) {
      lines.push(`Summary: ${message.meta.summary}`);
    }
    if (message.meta.input !== undefined) {
      lines.push("Input:");
      try {
        lines.push(JSON.stringify(message.meta.input, null, 2));
      } catch {
        lines.push("[Could not serialize input]");
      }
    }
    if (message.meta.failed) {
      lines.push(`Error: ${message.meta.error ?? "Failed"}`);
    }
  }

  return lines.join("\n");
}
