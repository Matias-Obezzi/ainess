// One ACP prompt turn, from `initialize` to the `stopReason`.
//
// The run is spawned by the caller (with `keepStdinOpen`, see `Transport.writeStdin`); this only
// speaks to it. It never touches node: the module is imported from the renderer, and everything it
// needs goes through the transport.
import { createRunStream } from "@/lib/acp/stream";
import { eventsFromSessionUpdate } from "@/lib/acp/events";
import { log } from "@/lib/logger";
import type { ParsedEvent } from "@/types";
import type { PermissionOption, StopReason } from "@agentclientprotocol/sdk";

export interface AcpPromptOptions {
  /** A run already started with `keepStdinOpen`, whose program speaks ACP over stdio. */
  runId: string;
  /** Absolute path the session works in. ACP wants absolute paths everywhere. */
  cwd: string;
  prompt: string;
  /** Called as each event is produced, in order, exactly like a provider's line parser. */
  onEvent: (event: ParsedEvent) => void;
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
  const { runId, cwd, prompt, onEvent, signal } = options;
  const { client, PROTOCOL_VERSION } = await import("@agentclientprotocol/sdk");

  const run = await createRunStream(runId);
  let answer = "";

  const app = client({ name: "ainess" }).onRequest("session/request_permission", ({ params }) => {
    const option = grantOption(params.options);
    log.debug("acp", `run ${runId}: granting ${params.toolCall.title ?? params.toolCall.toolCallId} as ${option?.optionId ?? "(no option offered)"}`);
    if (!option) return { outcome: { outcome: "cancelled" } };
    return { outcome: { outcome: "selected", optionId: option.optionId } };
  });

  try {
    return await app.connectWith(run.stream, async (ctx) => {
      await ctx.request("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        // Declined on purpose. ACP was written for editors, and an editor lends the agent its own
        // file system and its own terminals so that what the agent touches is what the user sees on
        // screen. This app is not an editor: it wants the event stream, and the agent already has a
        // file system and a shell of its own and uses them when the client offers none.
        clientCapabilities: { fs: { readTextFile: false, writeTextFile: false }, terminal: false },
        ...(options.clientVersion ? { clientInfo: { name: "ainess", version: options.clientVersion } } : {}),
      });

      return await ctx.buildSession(cwd).withSession(async (session) => {
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
              return { sessionId: session.sessionId, stopReason: message.stopReason, text: answer };
            }
            for (const event of eventsFromSessionUpdate(message.update)) {
              if (event.type === "text") answer += event.text;
              onEvent(event);
            }
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
