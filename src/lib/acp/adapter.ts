// Where the ACP adapter comes from.
//
// Claude Code does not speak ACP itself: the protocol is spoken by an adapter that Anthropic and
// Zed publish as an npm package (`@agentclientprotocol/claude-agent-acp`), which embeds the Agent
// SDK and drives Claude Code behind it. So a claude run spawns *that*, not `claude`.
//
// Two ways in, in this order:
//   1. an install already on the machine — `claude-agent-acp` on PATH (`npm i -g`, or whatever the
//      user's package manager put there). Nothing to download and nothing to resolve at run time;
//   2. `npx -y @agentclientprotocol/claude-agent-acp`, which fetches it into the npm cache the
//      first time and is instant from then on. This is the documented way to run it and the one
//      that works on a machine where nothing was installed on purpose.
//
// Both come out as a full path, because a bare name is not a program on Windows: npm's `npx` is a
// `.cmd` shim, and neither Rust's `Command::new` nor node's `spawn` finds it by name (see
// `resolveProgram` in src/lib/transport-node.ts and `unwrap_shim` in src-tauri/src/runner.rs, which
// both know what to do once they have the path).
import { getTransport } from "@/lib/transport";
import { log } from "@/lib/logger";

/** The npm package that speaks ACP for Claude Code. */
export const ACP_ADAPTER_PACKAGE = "@agentclientprotocol/claude-agent-acp";
/** The command that package installs. */
export const ACP_ADAPTER_BIN = "claude-agent-acp";

export interface AcpAdapterCommand {
  program: string;
  args: string[];
  /** Which of the two ways in this is, for the log and for the tests. */
  via: "installed" | "npx";
}

let cached: AcpAdapterCommand | null = null;

/**
 * The command that starts the adapter, resolved once per session.
 *
 * Cached because the answer costs two PATH lookups and cannot change while the app runs without
 * someone installing something mid-session; `forgetAcpAdapter()` is there for that case and for
 * the tests.
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
    cached = { program: npx ?? "npx", args: ["-y", ACP_ADAPTER_PACKAGE], via: "npx" };
    if (!npx) {
      // Worth saying out loud: the spawn is about to fail on Windows, and the reason is node.
      log.warn("acp", `neither ${ACP_ADAPTER_BIN} nor npx is on PATH; trying \`npx\` anyway`);
    }
  }
  log.info("acp", `adapter: ${cached.program} ${cached.args.join(" ")} (${cached.via})`);
  return cached;
}

/** Drops the cached answer, so the next run looks again. */
export function forgetAcpAdapter(): void {
  cached = null;
}
