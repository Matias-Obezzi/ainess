import { describe, test, expect, afterEach } from "vitest";
import { nodeTransport } from "@/lib/transport-node";
import type { RunExitEvent, RunOutputEvent } from "@/types";

/**
 * A stand-in for an agent that speaks a bidirectional protocol: NDJSON in, NDJSON out, ending by
 * itself on EOF. Nothing installed here speaks ACP, and what is under test is the pipe and not the
 * protocol — so the fake one is enough, and running it through `process.execPath` keeps the test
 * from depending on any binary but the node already running it.
 */
const FAKE_AGENT = `
const rl = require("readline").createInterface({ input: process.stdin });
rl.on("line", (line) => {
  if (!line.trim()) return;
  const msg = JSON.parse(line);
  process.stdout.write(JSON.stringify({ id: msg.id, pong: msg.method }) + "\\n");
});
rl.on("close", () => process.exit(0));
`;

/** Resolves when `cond` holds, rejects after `ms`. No fixed sleep: a slow machine must not fail. */
function waitFor(cond: () => boolean, what: string, ms = 10_000): Promise<void> {
  return new Promise((resolve, reject) => {
    const deadline = Date.now() + ms;
    const tick = () => {
      if (cond()) return resolve();
      if (Date.now() > deadline) return reject(new Error(`timed out waiting for ${what}`));
      setTimeout(tick, 10);
    };
    tick();
  });
}

/** Collects what one run says and when it ends, and hands back the listener teardown. */
function watch(runId: string) {
  const lines: string[] = [];
  const exits: RunExitEvent[] = [];
  const onOut = (e: RunOutputEvent) => { if (e.runId === runId && e.stream === "stdout") lines.push(e.line); };
  const onExit = (e: RunExitEvent) => { if (e.runId === runId) exits.push(e); };
  const off: Array<() => void> = [];
  const ready = Promise.all([
    nodeTransport.onRunOutput(onOut).then((u) => off.push(u)),
    nodeTransport.onRunExit(onExit).then((u) => off.push(u)),
  ]);
  return { lines, exits, ready, stop: () => off.forEach((u) => u()) };
}

let cleanup: Array<() => void> = [];
afterEach(() => {
  cleanup.forEach((c) => c());
  cleanup = [];
});

describe("keepStdinOpen", () => {
  test("a run stays writable after the spawn and ends on closeStdin", async () => {
    const runId = "acp-live";
    const w = watch(runId);
    cleanup.push(w.stop);
    await w.ready;

    await nodeTransport.spawnRun({
      runId,
      program: process.execPath,
      args: ["-e", FAKE_AGENT],
      keepStdinOpen: true,
    });

    expect(await nodeTransport.writeStdin(runId, JSON.stringify({ id: 1, method: "initialize" }) + "\n")).toBe(true);
    await waitFor(() => w.lines.length >= 1, "the first answer");
    expect(JSON.parse(w.lines[0])).toEqual({ id: 1, pong: "initialize" });

    // The point of the whole change: the process is still there for a second message.
    expect(await nodeTransport.writeStdin(runId, JSON.stringify({ id: 2, method: "prompt" }) + "\n")).toBe(true);
    await waitFor(() => w.lines.length >= 2, "the second answer");
    expect(JSON.parse(w.lines[1])).toEqual({ id: 2, pong: "prompt" });

    // Still running: nothing closed its stdin for it.
    expect(w.exits).toHaveLength(0);

    expect(await nodeTransport.closeStdin(runId)).toBe(true);
    await waitFor(() => w.exits.length === 1, "the exit after EOF");
    expect(w.exits[0]).toMatchObject({ code: 0, killed: false });
  });

  test("the first message can travel as stdinText without closing the pipe", async () => {
    const runId = "acp-first";
    const w = watch(runId);
    cleanup.push(w.stop);
    await w.ready;

    await nodeTransport.spawnRun({
      runId,
      program: process.execPath,
      args: ["-e", FAKE_AGENT],
      stdinText: JSON.stringify({ id: 9, method: "initialize" }) + "\n",
      keepStdinOpen: true,
    });

    await waitFor(() => w.lines.length >= 1, "the answer to stdinText");
    expect(JSON.parse(w.lines[0])).toEqual({ id: 9, pong: "initialize" });
    expect(w.exits).toHaveLength(0);

    expect(await nodeTransport.closeStdin(runId)).toBe(true);
    await waitFor(() => w.exits.length === 1, "the exit after EOF");
  });

  test("writing to a run that is not there answers false instead of throwing", async () => {
    expect(await nodeTransport.writeStdin("never-existed", "{}\n")).toBe(false);
    expect(await nodeTransport.closeStdin("never-existed")).toBe(false);
  });

  test("the old path is untouched: stdinText alone is written and the pipe closed", async () => {
    const runId = "classic";
    const w = watch(runId);
    cleanup.push(w.stop);
    await w.ready;

    await nodeTransport.spawnRun({
      runId,
      program: process.execPath,
      args: ["-e", FAKE_AGENT],
      stdinText: JSON.stringify({ id: 7, method: "once" }) + "\n",
    });

    // Nobody sends EOF here, and the run ends anyway: that is the closing the CLI waits for.
    await waitFor(() => w.exits.length === 1, "the exit of a one-turn run");
    expect(JSON.parse(w.lines[0])).toEqual({ id: 7, pong: "once" });
    expect(w.exits[0]).toMatchObject({ code: 0, killed: false });
    // And once it is over there is nothing left to write to.
    expect(await nodeTransport.writeStdin(runId, "{}\n")).toBe(false);
  });
});
