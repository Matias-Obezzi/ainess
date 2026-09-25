// One ACP prompt turn, from `initialize` to the `stopReason`.
//
// The run is spawned by the caller (with `keepStdinOpen`, see `Transport.writeStdin`); this only
// speaks to it. It never touches node: the module is imported from the renderer, and everything it
// needs goes through the transport.
import { createRunStream } from "@/lib/acp/stream";
import { eventsFromSessionUpdate } from "@/lib/acp/events";
import { log } from "@/lib/logger";
import type { ParsedEvent } from "@/types";
import type { ClientContext, McpServer, PermissionOption, SessionUpdate, StopReason } from "@agentclientprotocol/sdk";

/**
 * Everything about the session that is not the prompt: what the agent is allowed to do, what it is
 * told on top of its own system prompt, which MCP servers it connects to.
 *
 * `mcpServers` is a field of `session/new`; `meta` is its `_meta`, which is where an agent's own
 * knobs live (for the Claude adapter: `systemPrompt` and `claudeCode.options`). Neither is
 * interpreted here — a provider builds them (see `buildAcpSession` in src/lib/providers.ts) and
 * this only carries them across.
 */
export interface AcpSessionSpec {
  mcpServers?: McpServer[];
  meta?: Record<string, unknown>;
}

export interface AcpPromptOptions {
  /** A run already started with `keepStdinOpen`, whose program speaks ACP over stdio. */
  runId: string;
  /** Absolute path the session works in. ACP wants absolute paths everywhere. */
  cwd: string;
  prompt: string;
  /** Called as each event is produced, in order, exactly like a provider's line parser. */
  onEvent: (event: ParsedEvent) => void;
  /** What the session is opened with. */
  session?: AcpSessionSpec;
  /**
   * A session from a previous run of this same agent, to carry the conversation on (`session/load`,
   * the ACP counterpart of `claude --resume`). Ignored, with a line in the log, by an agent that
   * does not declare `loadSession` or that no longer has it.
   */
  resumeSessionId?: string;
  /**
   * Cancels the turn: the agent is told (`session/cancel`) and answers with `cancelled` instead of
   * being cut off mid-sentence. Killing the run works too, and ends the session the hard way.
   */
  signal?: AbortSignal;
  /** Version reported to the agent as `clientInfo`. Omitted when the caller does not know it. */
  clientVersion?: string;
}

export interface AcpPromptResult {
  sessionId: string;
  stopReason: StopReason;
  /** Everything the agent said in this turn, which is also the text of the `result` event. */
  text: string;
  /** False when a session was asked for and could not be loaded, so this turn starts from zero. */
  resumed: boolean;
}

/**
 * Granting every permission, on purpose and for now.
 *
 * It is what the CLI path already does today (`--permission-mode acceptEdits`, and
 * `--dangerously-skip-permissions` for an agent with `autoApprove`), so ACP is not a way around a
 * decision the user already makes elsewhere. Wiring this to the app's approval panel is the next
 * batch of this issue, and mixing the two would put the protocol client and a piece of UI in the
 * same diff.
 */
function grantOption(options: PermissionOption[]): PermissionOption | undefined {
  return options.find((o) => o.kind === "allow_always") ?? options.find((o) => o.kind === "allow_once") ?? options[0];
}

/**
 * Runs `prompt` against the agent behind `runId` and resolves when the turn stops.
 *
 * The run outlives the turn: this closes the connection, not the process. Whoever spawned it ends
 * it, with `closeStdin` (EOF, the polite end of an ACP session) or `killRun` — which is what lets a
 * second prompt reuse the same agent instead of paying its startup again.
 *
 * The SDK is loaded here and nowhere else, dynamically: `npm run build:remote` is the page served
 * to the phone, and the phone spawns no processes and speaks no ACP. A static import would put the
 * SDK and its zod validators in that single-file bundle for nothing (see vite.remote.config.ts,
 * where a single-file build needs one more line to keep it out).
 */
export async function runAcpPrompt(options: AcpPromptOptions): Promise<AcpPromptResult> {
  const { runId, cwd, prompt, onEvent, signal, resumeSessionId } = options;
  const mcpServers = options.session?.mcpServers ?? [];
  const meta = options.session?.meta;
  const { client, PROTOCOL_VERSION } = await import("@agentclientprotocol/sdk");

  const run = await createRunStream(runId);
  let answer = "";

  /** The events one update is worth, and the answer growing with them. */
  const consume = (update: SessionUpdate) => {
    for (const event of eventsFromSessionUpdate(update)) {
      if (event.type === "text") answer += event.text;
      onEvent(event);
    }
  };

  // A loaded session replays its whole history as `session/update` notifications before
  // `session/load` answers. That history is what the user already read in the app, so it is
  // listened to and thrown away: only what comes after the load is this turn.
  let replaying = false;
  // Set only on the resume path, where there is no `ActiveSession` routing updates for us.
  let loadedSessionId: string | null = null;

  const app = client({ name: "ainess" })
    .onRequest("session/request_permission", ({ params }) => {
      const option = grantOption(params.options);
      log.debug("acp", `run ${runId}: granting ${params.toolCall.title ?? params.toolCall.toolCallId} as ${option?.optionId ?? "(no option offered)"}`);
      if (!option) return { outcome: { outcome: "cancelled" } };
      return { outcome: { outcome: "selected", optionId: option.optionId } };
    })
    .onNotification("session/update", ({ params }) => {
      if (loadedSessionId === null || params.sessionId !== loadedSessionId || replaying) return;
      consume(params.update);
    });

  try {
    return await app.connectWith(run.stream, async (ctx) => {
      const init = await ctx.request("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        // Declined on purpose. ACP was written for editors, and an editor lends the agent its own
        // file system and its own terminals so that what the agent touches is what the user sees on
        // screen. This app is not an editor: it wants the event stream, and the agent already has a
        // file system and a shell of its own and uses them when the client offers none.
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        ...(options.clientVersion ? { clientInfo: { name: "ainess", version: options.clientVersion } } : {}),
      });

      if (resumeSessionId) {
        if (init.agentCapabilities?.loadSession) {
          try {
            replaying = true;
            await ctx.request("session/load", { sessionId: resumeSessionId, cwd, mcpServers, ...(meta ? { _meta: meta } : {}) });
            loadedSessionId = resumeSessionId;
          } catch (e) {
            // A session that is gone (expired, from another machine, from an agent that was
            // reinstalled) must not brick the agent: the turn goes on from zero, which is what the
            // user sees as "it forgot", and not as a run that failed.
            log.warn("acp", `run ${runId}: session ${resumeSessionId} could not be loaded (${e instanceof Error ? e.message : String(e)}); starting a new one`);
          } finally {
            replaying = false;
          }
        } else {
          log.info("acp", `run ${runId}: the agent does not support session/load; starting a new session`);
        }
      }

      if (loadedSessionId !== null) {
        const sessionId = loadedSessionId;
        onEvent({ type: "session", sessionId });
        const stopReason = await promptTurn(ctx, sessionId, prompt, signal);
        onEvent({ type: "result", text: answer, sessionId });
        return { sessionId, stopReason, text: answer, resumed: true };
      }

      const request = { cwd, mcpServers, ...(meta ? { _meta: meta } : {}) };
      return await ctx.buildSession(request).withSession(async (session) => {
        onEvent({ type: "session", sessionId: session.sessionId });

        const onAbort = () => { void ctx.notify("session/cancel", { sessionId: session.sessionId }); };
        if (signal?.aborted) onAbort();
        else signal?.addEventListener("abort", onAbort, { once: true });

        // The turn's answer arrives through `nextUpdate()` below, and so does its failure: a
        // rejected `session/prompt` is re-thrown by the queue. This handle exists only so that a
        // rejection here is never an unhandled one.
        const turn = session.prompt(prompt);
        turn.catch(() => {});

        try {
          for (;;) {
            const message = await session.nextUpdate();
            if (message.kind === "stop") {
              onEvent({ type: "result", text: answer, sessionId: session.sessionId });
              return { sessionId: session.sessionId, stopReason: message.stopReason, text: answer, resumed: false };
            }
            consume(message.update);
          }
        } finally {
          signal?.removeEventListener("abort", onAbort);
        }
      });
    });
  } catch (e) {
    // Whatever went wrong — the agent answered an error, the run died, the pipe closed — it reaches
    // the timeline the same way a CLI failure does, and the caller still gets to see it thrown.
    const text = e instanceof Error ? e.message : String(e);
    onEvent({ type: "error", text });
    throw e;
  } finally {
    run.dispose();
  }
}

/**
 * One turn on a session that was loaded rather than created.
 *
 * `buildSession(...)` is the SDK's way in and it only knows how to create, so a loaded session has
 * no `ActiveSession` to read updates from — they arrive at the notification handler above instead,
 * in the order the agent sent them, and this waits for the answer to `session/prompt`.
 */
async function promptTurn(
  ctx: ClientContext,
  sessionId: string,
  prompt: string,
  signal: AbortSignal | undefined,
): Promise<StopReason> {
  const onAbort = () => { void ctx.notify("session/cancel", { sessionId }); };
  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await ctx.request("session/prompt", { sessionId, prompt: [{ type: "text", text: prompt }] });
    return response.stopReason;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}
