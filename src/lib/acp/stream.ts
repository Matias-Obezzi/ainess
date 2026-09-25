// The bridge between the ACP SDK's `Stream` and the run transport (src/lib/transport.ts).
//
// The SDK wants a pair of web streams of JSON-RPC messages. What the app has is a run: bytes go in
// with `writeStdin`, and lines come back out of `onRunOutput` already split by the platform (the
// Rust runner and the node transport both read with a line reader). `ndJsonStream` is the SDK's own
// adapter for stdio, but it is byte-to-byte — feeding it would mean joining the lines back together
// only for it to split them again, so the `Stream` is built here instead, on the lines we have.
import { getTransport } from "@/lib/transport";
import { log } from "@/lib/logger";
import type { AnyMessage, Stream } from "@agentclientprotocol/sdk";

export interface RunStream {
  /** What `client().connectWith(...)` is given. */
  stream: Stream;
  /** Detaches the transport listeners and closes the readable. Safe to call twice. */
  dispose(): void;
}

export interface RunStreamOptions {
  /**
   * Every line the run wrote to stderr. It never reaches the parser: an agent that prints a
   * deprecation warning or a node warning on stderr would otherwise break the session over a line
   * that was never meant to be protocol. Defaults to a debug log line.
   */
  onStderr?: (line: string) => void;
}

/**
 * Wraps a run that is already spawned (with `keepStdinOpen`) in an ACP stream.
 *
 * Must be awaited before anything is written to the run: the transport's subscription is async, and
 * a line that arrives before it lands is a line nobody hears. That is safe with ACP because the
 * agent does not speak first — it answers `initialize` — but it does mean the order matters.
 */
export async function createRunStream(runId: string, options: RunStreamOptions = {}): Promise<RunStream> {
  const transport = getTransport();
  const onStderr = options.onStderr ?? ((line: string) => log.debug("acp", `run ${runId} stderr: ${line}`));

  let controller!: ReadableStreamDefaultController<AnyMessage>;
  let closed = false;
  const offs: Array<() => void> = [];

  const detach = () => {
    while (offs.length > 0) offs.pop()?.();
  };

  /** Ends the readable once, whatever ends it: the run dying, `dispose`, the SDK cancelling. */
  const finish = (error?: Error) => {
    if (closed) return;
    closed = true;
    detach();
    try {
      if (error) controller.error(error);
      else controller.close();
    } catch {
      // Already errored or closed by the reader; there is nothing left to end.
    }
  };

  // `start` runs synchronously, so `controller` is set before any listener below can fire.
  const readable = new ReadableStream<AnyMessage>({
    start: (c) => { controller = c; },
    cancel: () => { finish(); },
  });

  const onOutput = (e: { runId: string; stream: "stdout" | "stderr"; line: string }) => {
    // More than one run is alive at a time and every handler hears all of them.
    if (e.runId !== runId || closed) return;
    if (e.stream === "stderr") {
      onStderr(e.line);
      return;
    }
    if (e.line.trim() === "") return;
    let message: AnyMessage;
    try {
      message = JSON.parse(e.line) as AnyMessage;
    } catch {
      // A banner, a progress bar, an npx notice: not every stdout line is protocol, and none of
      // them is worth killing a session that is otherwise working.
      log.debug("acp", `run ${runId} stdout is not JSON-RPC: ${e.line.substring(0, 200)}`);
      return;
    }
    try {
      controller.enqueue(message);
    } catch {
      finish();
    }
  };

  const onExit = (e: { runId: string; code: number | null; killed: boolean }) => {
    if (e.runId !== runId) return;
    // Ending the readable is what closes the connection and rejects every pending request, which is
    // the difference between a killed run and a promise nobody will ever settle.
    finish(new Error(`ACP run ${runId} ended (code ${e.code}${e.killed ? ", killed" : ""}) with the session still open`));
  };

  offs.push(await transport.onRunOutput(onOutput));
  offs.push(await transport.onRunExit(onExit));

  const writable = new WritableStream<AnyMessage>({
    write: async (message) => {
      const ok = await transport.writeStdin(runId, `${JSON.stringify(message)}\n`);
      // The framing is ours because only this side knows the protocol is newline-delimited.
      if (!ok) throw new Error(`ACP run ${runId} has no stdin open to write to`);
    },
    close: async () => { await transport.closeStdin(runId); },
    abort: async () => { await transport.closeStdin(runId); },
  });

  return {
    stream: { readable, writable },
    dispose: () => finish(),
  };
}
