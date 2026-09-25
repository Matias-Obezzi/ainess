// Turns ACP `session/update` notifications into the `ParsedEvent`s the rest of the app already
// speaks (src/types.ts). Nothing here is ACP-specific downstream: an ACP session ends up looking
// exactly like a CLI run to the orchestrator, the chat and the activity view.
//
// The criteria are `parseClaudeLine`'s in src/lib/providers.ts, on purpose — two providers that
// disagree on what counts as a tool call produce two timelines that cannot be read side by side.
//
// The SDK is imported for types only: `import type` is erased at build time, so this module costs
// the phone bundle nothing (see src/lib/acp/session.ts for the runtime side of that).
import type { SessionUpdate, ToolCallContent } from "@agentclientprotocol/sdk";
import type { ParsedEvent } from "@/types";

/** Same cap `parseClaudeLine` puts on a tool's arguments before they reach the timeline. */
const DETAIL_MAX = 200;

function detailOf(input: unknown): string | undefined {
  if (input === undefined || input === null) return undefined;
  try {
    return JSON.stringify(input).substring(0, DETAIL_MAX);
  } catch {
    return undefined;
  }
}

/** The text a failed tool call carries, if it carries any: only `content` blocks hold prose. */
function textOfToolContent(content: ToolCallContent[] | null | undefined): string {
  if (!content) return "";
  const parts: string[] = [];
  for (const item of content) {
    if (item.type === "content" && item.content.type === "text") parts.push(item.content.text);
  }
  return parts.join("\n");
}

/**
 * The events one `session/update` is worth. Pure and stateless: the turn-level bookkeeping (the
 * answer being accumulated, the stop reason) lives in the session loop.
 */
export function eventsFromSessionUpdate(update: SessionUpdate): ParsedEvent[] {
  switch (update.sessionUpdate) {
    case "agent_message_chunk":
      // Deltas, not whole blocks — so they are passed through as they come. `parseClaudeLine` adds
      // a blank line after each one because Claude Code prints one line per finished text block and
      // gluing two of them together broke the fences; here gluing is exactly what is wanted.
      return update.content.type === "text" && update.content.text !== ""
        ? [{ type: "text", text: update.content.text }]
        : [];

    case "tool_call": {
      // Once, when it starts. The `tool_call_update`s that follow are status changes of this same
      // call, and logging each of them would show one tool three times.
      const name = update.name || update.title || "tool";
      return [{ type: "tool", name, detail: detailOf(update.rawInput), input: update.rawInput }];
    }

    case "tool_call_update": {
      // The only update worth an event is the one that says it went wrong, which is what the
      // Antigravity parser does with its `ERROR` state.
      if (update.status !== "failed") return [];
      const name = update.name || update.title || update.toolCallId;
      return [{ type: "tool", name, failed: true, error: textOfToolContent(update.content) }];
    }

    case "usage_update": {
      // `used` is the conversation size right now, which is what `contextTokens` means everywhere
      // else in the app (`parseClaudeLine` adds the three Claude token counters to get the same
      // number). The cumulative cost only travels when the agent reports it in dollars.
      const costUsd = update.cost && update.cost.currency === "USD" ? update.cost.amount : undefined;
      return [{ type: "usage", usage: { contextTokens: update.used, ...(costUsd !== undefined ? { costUsd } : {}) } }];
    }

    case "notice":
      // An advisory from the agent, in its own words. Only the ones it marks as errors become
      // errors; info and warning are chatter and would read as failures in the timeline.
      return update.severity === "error"
        ? [{ type: "error", text: update.description ? `${update.title}: ${update.description}` : update.title }]
        : [];

    default:
      // `user_message_chunk` is our own prompt coming back, `agent_thought_chunk` is thinking
      // (which `parseClaudeLine` drops too), and plans, modes and commands are IDE furniture.
      return [];
  }
}
