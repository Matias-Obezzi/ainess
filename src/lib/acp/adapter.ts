// Where the ACP adapter comes from.
//
// Claude Code does not speak ACP itself: the protocol is spoken by an adapter that Anthropic and
// Zed publish as an npm package (`@agentclientprotocol/claude-agent-acp`), which embeds the Agent
// SDK and drives Claude Code behind it. So a claude run spawns *that*, not `claude`.
//
// Three ways in, in this order:
//   1. an install already on the machine — `claude-agent-acp` on PATH (`npm i -g`, or whatever the
//      user's package manager put there). Nothing to download and nothing to resolve at run time;
//   2. `npx -y @agentclientprotocol/claude-agent-acp`, which fetches it into the npm cache the
//      first time and is instant from then on. This is the documented way to run it and the one
//      that works on a machine where nothing was installed on purpose;
//   3. the copy the app installed for itself, under its own config folder, with a bun it downloaded
//      (see src-tauri/src/acp_setup.rs). Last because it is the heaviest and because the first two
//      are the user's own install and win when they exist — but it is the only one left on a
//      machine with no node, where neither `claude-agent-acp` nor `npx` is anywhere to be found.
//
// The first two come out as a full path, because a bare name is not a program on Windows: npm's
// `npx` is a `.cmd` shim, and neither Rust's `Command::new` nor node's `spawn` finds it by name
// (see `resolveProgram` in src/lib/transport-node.ts and `unwrap_shim` in src-tauri/src/runner.rs,
// which both know what to do once they have the path). The third is a path by construction.
import { getTransport } from "@/lib/transport";
import { log } from "@/lib/logger";
import type { AcpManagedStatus } from "@/types";

/** The npm package that speaks ACP for Claude Code. */
export const ACP_ADAPTER_PACKAGE = "@agentclientprotocol/claude-agent-acp";
/** The command that package installs. */
export const ACP_ADAPTER_BIN = "claude-agent-acp";

export interface AcpAdapterCommand {
  program: string;
  args: string[];
  /** Which of the three ways in this is, for the log and for the tests. */
  via: "installed" | "npx" | "managed";
}

let cached: AcpAdapterCommand | null = null;

/**
 * The command that starts the adapter, resolved once per session.
 *
 * Cached because the answer costs two PATH lookups and cannot change while the app runs without
 * someone installing something mid-session; `forgetAcpAdapter()` is there for that case and for
 * the tests.
 *
 * When nothing at all is there it still answers the npx branch, with a warning. The spawn that
 * follows will fail, and that is on purpose: this function's job is to say what would be started,
 * not to decide that a run cannot happen. Whoever offers to install the managed runtime asks
 * `acpAdapterAvailability()` first.
 */
export async function resolveAcpAdapter(): Promise<AcpAdapterCommand> {
  if (cached) return cached;
  const transport = getTransport();

  const installed = await transport.whichProgram(ACP_ADAPTER_BIN);
  if (installed) {
    cached = { program: installed, args: [], via: "installed" };
  } else {
    // `-y` answers npx's "install it?" prompt: there is no terminal here to answer it in, and
    // without it the first run of a machine that never fetched the package hangs.
    const npx = await transport.whichProgram("npx");
    if (npx) {
      cached = { program: npx, args: ["-y", ACP_ADAPTER_PACKAGE], via: "npx" };
    } else {
      const managed = await managedIfReady();
      if (managed) {
        cached = managed;
      } else {
        cached = { program: "npx", args: ["-y", ACP_ADAPTER_PACKAGE], via: "npx" };
        // Worth saying out loud: the spawn is about to fail on Windows, and the reason is node.
        log.warn("acp", `neither ${ACP_ADAPTER_BIN} nor npx is on PATH; trying \`npx\` anyway`);
      }
    }
  }
  log.info("acp", `adapter: ${cached.program} ${cached.args.join(" ")} (${cached.via})`);
  return cached;
}

/** The managed install as a command, or null when it is not there — or not finished. */
async function managedIfReady(): Promise<AcpAdapterCommand | null> {
  const managed = await getTransport().acpManagedStatus();
  if (!managed?.runtimeReady || !managed.adapterReady || !managed.program) return null;
  return { program: managed.program, args: managed.args, via: "managed" };
}

/**
 * Whether a claude run can start at all, and by which of the three ways.
 *
 * What the screen that offers to install the managed runtime asks before it decides to show itself:
 * `ready: false` with `via: "none"` is the machine with no node and nothing installed yet, and the
 * only one where anything has to be offered. `managed` comes along whenever the platform can say
 * anything about it, installed or not, so the screen can show what is already on disk.
 */
export async function acpAdapterAvailability(): Promise<{
  ready: boolean;
  via: "installed" | "npx" | "managed" | "none";
  managed?: AcpManagedStatus;
}> {
  const transport = getTransport();
  const managed = (await transport.acpManagedStatus()) ?? undefined;

  if (await transport.whichProgram(ACP_ADAPTER_BIN)) return { ready: true, via: "installed", managed };
  if (await transport.whichProgram("npx")) return { ready: true, via: "npx", managed };
  if (managed?.runtimeReady && managed.adapterReady && managed.program) {
    return { ready: true, via: "managed", managed };
  }
  return { ready: false, via: "none", managed };
}

/** Drops the cached answer, so the next run looks again. */
export function forgetAcpAdapter(): void {
  cached = null;
}
