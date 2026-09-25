import { describe, it, expect, afterEach } from "vitest";
import { nullTransport } from "@/lib/transport-null";
import { setTransport } from "@/lib/transport";
import { acpAdapterAvailability, forgetAcpAdapter, resolveAcpAdapter } from "@/lib/acp/adapter";
import type { AcpManagedStatus } from "@/types";

/**
 * The third way into the adapter: the bun and the copy the app installed for itself (see
 * src-tauri/src/acp_setup.rs), which is all there is on a machine without node.
 *
 * The first two ways are covered next door in providers.test.ts, where they were written; what is
 * new here is the order between the three and the availability the install screen asks about. The
 * transport is faked the same way it is there — nothing is spawned and nothing is installed, the
 * Rust side of it is exercised for real by `installs_bun_and_the_adapter_for_real`.
 */
const READY: AcpManagedStatus = {
  runtimeReady: true,
  adapterReady: true,
  bunVersion: "1.4.2",
  adapterVersion: "0.81.2",
  program: "C:/ainess/runtime/bun/bun.exe",
  args: ["run", "C:/ainess/acp/node_modules/@agentclientprotocol/claude-agent-acp/dist/index.js"],
  installDir: "C:/ainess/acp",
  enginePath: "C:/ainess/acp/node_modules/@anthropic-ai/claude-agent-sdk-win32-x64/claude.exe",
};

/** A machine where bun came down but `bun install` never finished. */
const HALF_DONE: AcpManagedStatus = {
  ...READY,
  adapterReady: false,
  adapterVersion: null,
  program: null,
  args: [],
  enginePath: null,
};

/** No node: nothing is ever found on PATH. */
const noNode = (managed: AcpManagedStatus | null) =>
  ({ ...nullTransport, whichProgram: async () => null, acpManagedStatus: async () => managed }) as never;

afterEach(() => forgetAcpAdapter());

describe("the ACP adapter, when the app installed it itself", () => {
  it("starts the managed copy when there is no node to start anything else with", async () => {
    setTransport(noNode(READY));
    expect(await resolveAcpAdapter()).toEqual({
      program: READY.program,
      args: READY.args,
      via: "managed",
    });
  });

  it("is never asked about while npx is there: the user's own install wins", async () => {
    let asked = 0;
    setTransport({
      ...nullTransport,
      whichProgram: async (name: string) => (name === "npx" ? "C:/nodejs/npx.cmd" : null),
      acpManagedStatus: async () => { asked++; return READY; },
    } as never);
    expect((await resolveAcpAdapter()).via).toBe("npx");
    expect(asked).toBe(0);
  });

  it("does not start half an install", async () => {
    setTransport(noNode(HALF_DONE));
    // Same as before this existed: the npx branch, and the warning that it is about to fail.
    expect(await resolveAcpAdapter()).toEqual({
      program: "npx",
      args: ["-y", "@agentclientprotocol/claude-agent-acp"],
      via: "npx",
    });
  });

  it("falls back the way it always did where the platform knows nothing about it", async () => {
    // The browser preview and the CLI both answer null, and neither must break because of it.
    setTransport(noNode(null));
    expect((await resolveAcpAdapter()).via).toBe("npx");
  });
});

describe("whether a claude run can start at all", () => {
  it("says the machine is fine when the adapter is already installed on it", async () => {
    setTransport({
      ...nullTransport,
      whichProgram: async (name: string) => (name === "claude-agent-acp" ? "C:/bin/claude-agent-acp.cmd" : null),
      acpManagedStatus: async () => null,
    } as never);
    expect(await acpAdapterAvailability()).toEqual({ ready: true, via: "installed", managed: undefined });
  });

  it("says the machine is fine when there is only node", async () => {
    setTransport({
      ...nullTransport,
      whichProgram: async (name: string) => (name === "npx" ? "C:/nodejs/npx.cmd" : null),
      acpManagedStatus: async () => null,
    } as never);
    expect((await acpAdapterAvailability()).via).toBe("npx");
  });

  it("says the machine is fine when only the managed install is", async () => {
    setTransport(noNode(READY));
    expect(await acpAdapterAvailability()).toEqual({ ready: true, via: "managed", managed: READY });
  });

  it("is the only case that has to be offered anything: no node, nothing installed", async () => {
    setTransport(noNode(HALF_DONE));
    const availability = await acpAdapterAvailability();
    expect(availability.ready).toBe(false);
    expect(availability.via).toBe("none");
    // And it hands over what is on disk, so the screen can say bun is already down.
    expect(availability.managed?.runtimeReady).toBe(true);
  });

  it("hands over the status even where it is fine, so the screen can show what is installed", async () => {
    setTransport({
      ...nullTransport,
      whichProgram: async (name: string) => (name === "npx" ? "C:/nodejs/npx.cmd" : null),
      acpManagedStatus: async () => READY,
    } as never);
    expect((await acpAdapterAvailability()).managed).toEqual(READY);
  });
});
