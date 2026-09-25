// Everything the app can find out about Claude Code's identity, and with what.
//
// Two sources, one shape. The adapter pushes `_auth/status_update` over the live connection, and the
// engine answers `claude auth status --json` when asked. The three answers that matter are "logged
// in", "not logged in" and "could not be determined" — and the third one is the one that is easy to
// lose: a payload this build does not understand, a command that printed nothing, no engine at all.
// None of those may ever come back as "logged in".
import { describe, it, expect, beforeEach, vi } from "vitest";
import { parseAuthStatus, saysLoggedOut, isAuthRequired, AcpAuthRequiredError, AUTH_REQUIRED_CODE } from "@/lib/acp/auth";
import { parseCliAuthStatus, probeClaudeAuth, resolveClaudeEngine, claudeLogout } from "@/lib/claude-auth";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { useAppStore } from "@/store";
import type { AcpManagedStatus } from "@/types";

const MANAGED: AcpManagedStatus = {
  runtimeReady: true,
  adapterReady: true,
  bunVersion: "1.0",
  adapterVersion: "1.0",
  program: "bun",
  args: [],
  installDir: "/acp",
  enginePath: "/acp/node_modules/.bin/claude",
};

beforeEach(() => {
  useAppStore.setState(state => ({
    config: { ...state.config, binaryOverrides: {} },
    claudeAuth: { status: null, open: false, hasEngine: true, failed: false },
  }));
  setTransport(nullTransport);
});

describe("the _auth/status_update payload", () => {
  it("reads the identity the adapter pushed, English label and all", () => {
    expect(parseAuthStatus({
      authStatus: {
        kind: "account",
        label: "Claude Pro",
        detail: "matias@example.com",
        account: { email: "matias@example.com", organization: "ainess", plan: "pro" },
        vendor: { source: "cli" },
      },
    })).toEqual({
      kind: "account",
      label: "Claude Pro",
      detail: "matias@example.com",
      account: { email: "matias@example.com", organization: "ainess", plan: "pro" },
      vendor: { source: "cli" },
    });
  });

  it("reads `none` as what it is: nobody is logged in", () => {
    const status = parseAuthStatus({ authStatus: { kind: "none", label: "Not logged in" } });
    expect(status).toEqual({ kind: "none", label: "Not logged in" });
    expect(saysLoggedOut(status)).toBe(true);
  });

  it("drops a payload that is not one", () => {
    expect(parseAuthStatus(undefined)).toBeNull();
    expect(parseAuthStatus(null)).toBeNull();
    expect(parseAuthStatus({})).toBeNull();
    expect(parseAuthStatus("logged in")).toBeNull();
    expect(parseAuthStatus({ authStatus: "account" })).toBeNull();
  });

  it("drops a kind this build does not know instead of guessing at it", () => {
    expect(parseAuthStatus({ authStatus: { kind: "sso", label: "Single sign-on" } })).toBeNull();
    expect(parseAuthStatus({ authStatus: { label: "no kind at all" } })).toBeNull();
  });

  it("keeps only the account fields it understands, and survives without them", () => {
    expect(parseAuthStatus({ authStatus: { kind: "api_key", label: "API key", account: { email: 7, plan: "max" } } }))
      .toEqual({ kind: "api_key", label: "API key", account: { plan: "max" } });
    expect(parseAuthStatus({ authStatus: { kind: "gateway", label: "Bedrock", account: {} } }))
      .toEqual({ kind: "gateway", label: "Bedrock" });
  });

  it("nothing known at all is not the same as logged out", () => {
    expect(saysLoggedOut(null)).toBe(false);
    expect(saysLoggedOut(undefined)).toBe(false);
    expect(saysLoggedOut({ kind: "account", label: "Claude Pro" })).toBe(false);
  });
});

describe("recognising an auth_required failure", () => {
  it("knows the JSON-RPC code without reading the message", () => {
    expect(isAuthRequired(Object.assign(new Error("Authentication required"), { code: AUTH_REQUIRED_CODE }))).toBe(true);
    expect(isAuthRequired({ code: -32000 })).toBe(true);
  });

  it("does not take every other failure for a missing login", () => {
    expect(isAuthRequired(new Error("Authentication required"))).toBe(false);
    expect(isAuthRequired(Object.assign(new Error("boom"), { code: -32603 }))).toBe(false);
    expect(isAuthRequired(null)).toBe(false);
    expect(isAuthRequired("auth_required")).toBe(false);
  });

  it("recognises the error the session client re-throws", () => {
    expect(isAuthRequired(new AcpAuthRequiredError("Authentication required"))).toBe(true);
  });
});

describe("resolveClaudeEngine", () => {
  it("obeys the path the user set by hand before anything it found on its own", async () => {
    useAppStore.setState(state => ({ config: { ...state.config, binaryOverrides: { claude: "C:/mine/claude.exe" } } }));
    setTransport({
      ...nullTransport,
      whichProgram: async () => "C:/path/claude.exe",
      acpManagedStatus: async () => MANAGED,
    });
    expect(await resolveClaudeEngine()).toBe("C:/mine/claude.exe");
  });

  it("falls back to the one on PATH", async () => {
    setTransport({
      ...nullTransport,
      whichProgram: async () => "C:/path/claude.exe",
      acpManagedStatus: async () => MANAGED,
    });
    expect(await resolveClaudeEngine()).toBe("C:/path/claude.exe");
  });

  it("falls back to the engine the managed runtime brought", async () => {
    setTransport({ ...nullTransport, whichProgram: async () => null, acpManagedStatus: async () => MANAGED });
    expect(await resolveClaudeEngine()).toBe("/acp/node_modules/.bin/claude");
  });

  it("answers null when the machine has none of the three", async () => {
    setTransport({ ...nullTransport, whichProgram: async () => null, acpManagedStatus: async () => null });
    expect(await resolveClaudeEngine()).toBeNull();
  });

  it("ignores an override that is only whitespace", async () => {
    useAppStore.setState(state => ({ config: { ...state.config, binaryOverrides: { claude: "   " } } }));
    setTransport({ ...nullTransport, whichProgram: async () => "C:/path/claude.exe" });
    expect(await resolveClaudeEngine()).toBe("C:/path/claude.exe");
  });
});

describe("probeClaudeAuth", () => {
  function engineAnswering(out: { code: number | null; stdout: string; stderr?: string }) {
    const calls: Array<{ program: string; args: string[] }> = [];
    setTransport({
      ...nullTransport,
      whichProgram: async () => "claude",
      exec: async (program: string, args: string[]) => {
        calls.push({ program, args });
        return { code: out.code, stdout: out.stdout, stderr: out.stderr ?? "" };
      },
    });
    return calls;
  }

  it("reads the JSON even though the command exited 1 — that is what logged out looks like", async () => {
    const calls = engineAnswering({ code: 1, stdout: JSON.stringify({ loggedIn: false }) });
    expect(await probeClaudeAuth()).toEqual({ kind: "none", label: "Not logged in" });
    expect(calls).toEqual([{ program: "claude", args: ["auth", "status", "--json"] }]);
  });

  it("reads who is logged in when there is somebody", async () => {
    engineAnswering({ code: 0, stdout: JSON.stringify({ loggedIn: true, email: "matias@example.com", plan: "pro" }) });
    expect(await probeClaudeAuth()).toEqual({
      kind: "account",
      label: "Logged in",
      account: { email: "matias@example.com", plan: "pro" },
    });
    // Kept for Settings, so nothing pays for this probe twice.
    expect(useAppStore.getState().claudeAuth.status?.kind).toBe("account");
  });

  it("answers null — could not be determined — when the JSON is broken", async () => {
    engineAnswering({ code: 0, stdout: "Usage: claude auth status" });
    expect(await probeClaudeAuth()).toBeNull();
    expect(useAppStore.getState().claudeAuth.status).toBeNull();
  });

  it("answers null when the JSON is valid but says nothing about a login", async () => {
    engineAnswering({ code: 0, stdout: JSON.stringify({ version: "2.0.1" }) });
    expect(await probeClaudeAuth()).toBeNull();
  });

  it("answers null when there is no engine to ask", async () => {
    let execCalls = 0;
    setTransport({
      ...nullTransport,
      whichProgram: async () => null,
      acpManagedStatus: async () => null,
      exec: async () => { execCalls++; return { code: 0, stdout: "", stderr: "" }; },
    });
    expect(await probeClaudeAuth()).toBeNull();
    expect(execCalls).toBe(0);
  });

  it("answers null when the command blew up or timed out", async () => {
    setTransport({
      ...nullTransport,
      whichProgram: async () => "claude",
      exec: async () => { throw new Error("timed out"); },
    });
    expect(await probeClaudeAuth()).toBeNull();
  });

  it("gives the engine a ceiling of its own, in seconds", async () => {
    const seen: Array<number | undefined> = [];
    setTransport({
      ...nullTransport,
      whichProgram: async () => "claude",
      exec: async (_p: string, _a: string[], _cwd?: string, timeoutSecs?: number) => {
        seen.push(timeoutSecs);
        return { code: 1, stdout: JSON.stringify({ loggedIn: false }), stderr: "" };
      },
    });
    await probeClaudeAuth();
    expect(seen).toEqual([10]);
  });
});

describe("parseCliAuthStatus", () => {
  it("never invents a session out of a shape it does not recognise", () => {
    expect(parseCliAuthStatus("")).toBeNull();
    expect(parseCliAuthStatus("null")).toBeNull();
    expect(parseCliAuthStatus("[]")).toBeNull();
    expect(parseCliAuthStatus('{"loggedIn":"yes"}')).toBeNull();
  });

  it("calls an API key what it is", () => {
    expect(parseCliAuthStatus('{"loggedIn":true,"authMethod":"apiKey"}')).toEqual({ kind: "api_key", label: "Logged in" });
  });
});

describe("claudeLogout", () => {
  it("runs the engine's logout and forgets what it knew", async () => {
    const calls: string[][] = [];
    useAppStore.setState({ claudeAuth: { status: { kind: "account", label: "Claude Pro" }, open: false, hasEngine: true, failed: false } });
    setTransport({
      ...nullTransport,
      whichProgram: async () => "claude",
      exec: async (_p: string, args: string[]) => { calls.push(args); return { code: 0, stdout: "", stderr: "" }; },
    });

    await claudeLogout();
    expect(calls).toEqual([["auth", "logout"]]);
    expect(useAppStore.getState().claudeAuth.status).toBeNull();
  });

  it("does nothing at all with no engine", async () => {
    const exec = vi.fn();
    setTransport({ ...nullTransport, whichProgram: async () => null, acpManagedStatus: async () => null, exec });
    await claudeLogout();
    expect(exec).not.toHaveBeenCalled();
  });
});
