// One ACP prompt turn, from `initialize` to the `stopReason`.
//
// The run is spawned by the caller (with `keepStdinOpen`, see `Transport.writeStdin`); this only
// speaks to it. It never touches node: the module is imported from the renderer, and everything it
// needs goes through the transport.
import { createRunStream } from "@/lib/acp/stream";
import { eventsFromSessionUpdate, toolCallTracker } from "@/lib/acp/events";
import { AUTH_STATUS_METHOD, AcpAuthRequiredError, isAuthRequired, parseAuthStatus } from "@/lib/acp/auth";
import { rememberClaudeAuthStatus } from "@/lib/claude-auth";
import { log } from "@/lib/logger";
import type { ParsedEvent } from "@/types";
import type {
  ClientContext,
  ContentBlock,
  CreateElicitationRequest,
  CreateElicitationResponse,
  McpServer,
  PermissionOption,
  RequestPermissionRequest,
  RequestPermissionResponse,
  SessionModeState,
  SessionUpdate,
  StopReason,
} from "@agentclientprotocol/sdk";

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
  /**
   * Which tool calls the agent may make when it asks; everything else is refused. Absent: all of
   * them, which is what the CLI path does with the same agent.
   */
  permit?: (call: { kind?: string | null; rawInput?: unknown }) => boolean;
  /**
   * The mode the session should be in (`session/set_mode`), when the agent offers it: the agent's
   * own default otherwise — for Claude, whatever its settings file says, which is not what the
   * user set on the agent in this app.
   */
  mode?: string;
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
  /**
   * Who decides a tool call the agent asks about, once `permit` has let it through. Absent: it is
   * granted. The turn waits on the answer.
   */
  askPermission?: (request: RequestPermissionRequest) => Promise<RequestPermissionResponse["outcome"]>;
  /**
   * Who answers the agent's questions (`elicitation/create`, form mode). Present, the client says
   * it can, and Claude gets its AskUserQuestion tool back; absent, the agent is told nobody will.
   */
  elicit?: (request: CreateElicitationRequest) => Promise<CreateElicitationResponse>;
  /** Pictures sent with the prompt, when the agent takes images. Base64, without a data: prefix. */
  images?: { data: string; mimeType: string }[];
}

export interface AcpPromptResult {
  sessionId: string;
  stopReason: StopReason;
  /** Everything the agent said in this turn, which is also the text of the `result` event. */
  text: string;
  /** False when a session was asked for and could not be loaded, so this turn starts from zero. */
  resumed: boolean;
}

/** What a tool call gets when nobody was named to decide it: the widest grant the agent offers. */
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

  // One per connection: a tool call is drawn when its arguments arrive, which is a later
  // notification than the one that opened it.
  const tools = toolCallTracker();

  /** The events one update is worth, and the answer growing with them. */
  // Text that resumes after a tool call is a new message, not more of the last one. Glued on as it
  // arrives, "Let me check." and "Done" read as "Let me check.Done", and a fence closed right before
  // the call came out as "```Done" — a block that no longer closes.
  let afterTool = false;
  const consume = (update: SessionUpdate) => {
    // Whether or not its row is drawn yet (see `ToolCallTracker`), a call is a break in the text.
    if (update.sessionUpdate === "tool_call" || update.sessionUpdate === "tool_call_update") afterTool = true;
    for (const event of eventsFromSessionUpdate(update, tools)) {
      if (event.type === "text") {
        if (afterTool && answer && !answer.endsWith("\n\n")) {
          const gap = answer.endsWith("\n") ? "\n" : "\n\n";
          answer += gap;
          onEvent({ type: "text", text: gap });
        }
        afterTool = false;
        answer += event.text;
      }
      onEvent(event);
    }
  };

  // A loaded session replays its whole history as `session/update` notifications before
  // `session/load` answers. That history is what the user already read in the app, so it is
  // listened to and thrown away: only what comes after the load is this turn.
  let replaying = false;
  // Set only on the resume path, where there is no `ActiveSession` routing updates for us.
  let loadedSessionId: string | null = null;
  let loadedModes: SessionModeState | null | undefined;

  /**
   * Set when the adapter has told us, during this very connection, that nobody is logged in.
   *
   * `_auth/status_update` is push only and scoped to the connection, so this is the one chance to
   * hear it. A turn that then fails is a turn that failed for want of a session even when the error
   * it came back with says something vaguer — the adapter does not always translate the engine's
   * complaint into `auth_required`.
   */
  let loggedOut = false;

  const app = client({ name: "ainess" })
    .onNotification(AUTH_STATUS_METHOD, (params: unknown) => params, ({ params }) => {
      const status = parseAuthStatus(params);
      if (!status) return;
      loggedOut = status.kind === "none";
      log.debug("acp", `run ${runId}: auth status is ${status.kind} (${status.label})`);
      rememberClaudeAuthStatus(status);
    })
    .onRequest("session/request_permission", ({ params }) => {
      const permit = options.session?.permit;
      if (permit && !permit(params.toolCall)) {
        const reject = params.options.find((o) => o.kind === "reject_once") ?? params.options.find((o) => o.kind === "reject_always");
        log.debug("acp", `run ${runId}: refusing ${params.toolCall.title ?? params.toolCall.toolCallId}`);
        return { outcome: reject ? { outcome: "selected", optionId: reject.optionId } : { outcome: "cancelled" } };
      }
      if (options.askPermission) {
        return options.askPermission(params).then(outcome => ({ outcome }));
      }
      const option = grantOption(params.options);
      log.debug("acp", `run ${runId}: granting ${params.toolCall.title ?? params.toolCall.toolCallId} as ${option?.optionId ?? "(no option offered)"}`);
      if (!option) return { outcome: { outcome: "cancelled" } };
      return { outcome: { outcome: "selected", optionId: option.optionId } };
    })
    .onNotification("session/update", ({ params }) => {
      if (loadedSessionId === null || params.sessionId !== loadedSessionId || replaying) return;
      consume(params.update);
    })
    // Last on purpose: with SDK 1.5, a handler chained after this one was never called — the
    // session/update one above went silent and resumed sessions came back empty.
    .onRequest("elicitation/create", ({ params }) => {
      // Only forms are drawn: a URL elicitation would send the user to a page this app cannot see
      // back from. One the client never advertised is declined rather than left hanging.
      if (!options.elicit || params.mode !== "form") return { action: "decline" } as CreateElicitationResponse;
      return options.elicit(params);
    });

  try {
    return await app.connectWith(run.stream, async (ctx) => {
      const init = await ctx.request("initialize", {
        protocolVersion: PROTOCOL_VERSION,
        // Declined on purpose. ACP was written for editors, and an editor lends the agent its own
        // file system and its own terminals so that what the agent touches is what the user sees on
        // screen. This app is not an editor: it wants the event stream, and the agent already has a
        // file system and a shell of its own and uses them when the client offers none.
        clientCapabilities: {
          fs: { readTextFile: false, writeTextFile: false },
          terminal: false,
          // Forms only, and only when someone is there to fill them in.
          ...(options.elicit ? { elicitation: { form: {} } } : {}),
        },
        ...(options.clientVersion ? { clientInfo: { name: "ainess", version: options.clientVersion } } : {}),
      });

      if (resumeSessionId) {
        if (init.agentCapabilities?.loadSession) {
          try {
            replaying = true;
            const loaded = await ctx.request("session/load", { sessionId: resumeSessionId, cwd, mcpServers, ...(meta ? { _meta: meta } : {}) });
            loadedSessionId = resumeSessionId;
            loadedModes = loaded?.modes;
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

      // Text first, then the pictures, when the agent says it reads them.
      const content: ContentBlock[] = [{ type: "text", text: prompt }];
      if (init.agentCapabilities?.promptCapabilities?.image) {
        for (const image of options.images ?? []) content.push({ type: "image", data: image.data, mimeType: image.mimeType });
      } else if (options.images?.length) {
        log.info("acp", `run ${runId}: the agent takes no images; ${options.images.length} attached left as paths in the prompt`);
      }

      if (loadedSessionId !== null) {
        const sessionId = loadedSessionId;
        onEvent({ type: "session", sessionId });
        await setMode(ctx, sessionId, loadedModes, options.session?.mode, runId);
        const stopReason = await promptTurn(ctx, sessionId, content, signal);
        onEvent({ type: "result", text: answer, sessionId });
        return { sessionId, stopReason, text: answer, resumed: true };
      }

      const request = { cwd, mcpServers, ...(meta ? { _meta: meta } : {}) };
      return await ctx.buildSession(request).withSession(async (session) => {
        onEvent({ type: "session", sessionId: session.sessionId });
        await setMode(ctx, session.sessionId, session.modes, options.session?.mode, runId);

        const onAbort = () => { void ctx.notify("session/cancel", { sessionId: session.sessionId }); };
        if (signal?.aborted) onAbort();
        else signal?.addEventListener("abort", onAbort, { once: true });

        // The turn's answer arrives through `nextUpdate()` below, and so does its failure: a
        // rejected `session/prompt` is re-thrown by the queue. This handle exists only so that a
        // rejection here is never an unhandled one.
        const turn = session.prompt(content);
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
    // One failure the caller must be able to recognise without reading the message: the session
    // could not be opened, or the prompt could not be sent, because Claude Code has no login. It
    // arrives as the `auth_required` error (-32000) or, when the adapter only pushed the status,
    // as whatever the engine said next. Everything else is thrown exactly as it came.
    if (isAuthRequired(e) || loggedOut) throw new AcpAuthRequiredError(text, e);
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
  prompt: ContentBlock[],
  signal: AbortSignal | undefined,
): Promise<StopReason> {
  const onAbort = () => { void ctx.notify("session/cancel", { sessionId }); };
  if (signal?.aborted) onAbort();
  else signal?.addEventListener("abort", onAbort, { once: true });
  try {
    const response = await ctx.request("session/prompt", { sessionId, prompt });
    return response.stopReason;
  } finally {
    signal?.removeEventListener("abort", onAbort);
  }
}

/**
 * Puts the session in `wanted`, when the agent has that mode and is not already in it. A mode the
 * agent does not offer is left alone with a line in the log: the agent then decides on its own
 * defaults, which is what happened before this was asked at all.
 */
async function setMode(
  ctx: ClientContext,
  sessionId: string,
  modes: SessionModeState | null | undefined,
  wanted: string | undefined,
  runId: string,
): Promise<void> {
  if (!wanted || !modes || modes.currentModeId === wanted) return;
  if (!modes.availableModes.some(m => m.id === wanted)) {
    log.info("acp", `run ${runId}: the agent has no "${wanted}" mode (it offers ${modes.availableModes.map(m => m.id).join(", ")})`);
    return;
  }
  try {
    await ctx.request("session/set_mode", { sessionId, modeId: wanted });
  } catch (e) {
    log.warn("acp", `run ${runId}: could not switch to mode "${wanted}" (${e instanceof Error ? e.message : String(e)})`);
  }
}
