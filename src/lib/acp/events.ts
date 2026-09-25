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

/** An object with nothing in it: the shape a tool call has before its arguments are streamed. */
function hasArguments(input: unknown): boolean {
  if (input === undefined || input === null) return false;
  if (typeof input === "object" && !Array.isArray(input)) return Object.keys(input as object).length > 0;
  return true;
}

/**
 * What a session has already put on the timeline, so one tool call is one row.
 *
 * ACP sends a tool call twice over: `tool_call` when it starts, then `tool_call_update`s that fill
 * in the pieces as they arrive — the protocol says as much, "update the raw input". Claude's agent
 * opens with the arguments still empty, so a row drawn at the start says `Bash` and nothing else,
 * for every call, forever.
 *
 * So the row waits for the arguments instead, and this is what remembers which calls are still
 * waiting and which already have their row. One per session; a turn without one still works, it
 * just cannot wait for anything.
 */
export interface ToolCallTracker {
  /** Calls seen but not yet drawn, by id, with the best name they have offered so far. */
  pending: Map<string, string>;
  /** Calls already on the timeline. */
  drawn: Set<string>;
}

export function toolCallTracker(): ToolCallTracker {
  return { pending: new Map(), drawn: new Set() };
}

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
export function eventsFromSessionUpdate(update: SessionUpdate, tracker?: ToolCallTracker): ParsedEvent[] {
  switch (update.sessionUpdate) {
    case "agent_message_chunk":
      // Deltas, not whole blocks — so they are passed through as they come. `parseClaudeLine` adds
      // a blank line after each one because Claude Code prints one line per finished text block and
      // gluing two of them together broke the fences; here gluing is exactly what is wanted.
      return update.content.type === "text" && update.content.text !== ""
        ? [{ type: "text", text: update.content.text }]
        : [];

    case "tool_call": {
      // The call as it opens. Its arguments are often not there yet, and a row without them reads
      // as `Bash` with nothing after it, so the row is held back until they arrive (see
      // `ToolCallTracker`). Without a tracker there is nothing to hold it with: draw it now.
      const name = update.name || update.title || "tool";
      if (!tracker) return [{ type: "tool", name, detail: detailOf(update.rawInput), input: update.rawInput }];
      if (hasArguments(update.rawInput)) {
        tracker.drawn.add(update.toolCallId);
        return [{ type: "tool", name, detail: detailOf(update.rawInput), input: update.rawInput }];
      }
      tracker.pending.set(update.toolCallId, name);
      return [];
    }

    case "tool_call_update": {
      const failed = update.status === "failed";
      // The name gets better as the call goes on: a title arrives, then the tool's own name.
      const known = tracker?.pending.get(update.toolCallId);
      const name = update.name || update.title || known || update.toolCallId;

      // A failure is worth a row whether or not the call ever got one: it is the outcome, not the
      // call. Whatever was waiting stops waiting here.
      if (failed) {
        tracker?.pending.delete(update.toolCallId);
        tracker?.drawn.add(update.toolCallId);
        return [{ type: "tool", name, failed: true, error: textOfToolContent(update.content) }];
      }

      if (!tracker || tracker.drawn.has(update.toolCallId)) return [];
      if (update.name || update.title) tracker.pending.set(update.toolCallId, name);
      if (!tracker.pending.has(update.toolCallId)) return [];

      // Draw it as soon as the arguments are known. A call that ends without ever carrying any
      // (a tool that takes none) still gets its row when it finishes, named and alone.
      const done = update.status === "completed";
      if (!hasArguments(update.rawInput) && !done) return [];
      tracker.pending.delete(update.toolCallId);
      tracker.drawn.add(update.toolCallId);
      return [{ type: "tool", name, detail: detailOf(update.rawInput), input: update.rawInput }];
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
