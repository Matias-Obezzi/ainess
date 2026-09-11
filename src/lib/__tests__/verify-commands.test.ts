import { describe, it, expect, beforeEach, vi } from "vitest";
import {
  splitCommandLine,
  verdictOf,
  briefOutput,
  runVerifyCommand,
  runVerification,
  VERIFY_TIMEOUT_SECS,
} from "@/lib/verify-commands";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import type { VerifyCommand } from "@/types";

const command = (over: Partial<VerifyCommand> = {}): VerifyCommand => ({
  id: "v1",
  label: "test",
  program: "npm",
  args: ["test"],
  ...over,
});

describe("splitCommandLine", () => {
  it("splits a plain command into program and arguments", () => {
    expect(splitCommandLine("npm test")).toEqual({ tokens: ["npm", "test"] });
  });

  it("does not mind extra spaces", () => {
    expect(splitCommandLine("  npx   tsc   --noEmit ")).toEqual({ tokens: ["npx", "tsc", "--noEmit"] });
  });

  // Someone typing a path with a space in it reaches for double quotes; the quotes group and go.
  it("groups what is inside double quotes", () => {
    expect(splitCommandLine('cargo test --manifest-path "my crate/Cargo.toml"')).toEqual({
      tokens: ["cargo", "test", "--manifest-path", "my crate/Cargo.toml"],
    });
  });

  it("keeps an empty quoted argument, which is not the same as no argument", () => {
    expect(splitCommandLine('thing --name ""')).toEqual({ tokens: ["thing", "--name", ""] });
  });

  it("says when a quote was left open", () => {
    expect(splitCommandLine('npm test "half').problem).toBe("unbalanced-quote");
  });

  it("says when there is nothing there", () => {
    expect(splitCommandLine("   ").problem).toBe("empty");
  });

  // The whole security story of this module: what only a shell understands is refused, not escaped.
  it.each(["&&", "||", "|", ">", ">>", "<", ";", "&"])("refuses %s", op => {
    const result = splitCommandLine(`npm test ${op} rm -rf /`);
    expect(result.problem).toBe("shell-operator");
    expect(result.operator).toBe(op);
  });

  it("does not refuse an operator that is part of a word", () => {
    expect(splitCommandLine("npm run build&&test").problem).toBeUndefined();
  });

  // A single quote is an ordinary character on Windows, and a path is likelier than an intention.
  it("leaves single quotes alone", () => {
    expect(splitCommandLine("npm test --dir it's")).toEqual({ tokens: ["npm", "test", "--dir", "it's"] });
  });
});

describe("verdictOf", () => {
  it("passes when every command came back zero", () => {
    expect(verdictOf([{ label: "a", code: 0, output: "" }, { label: "b", code: 0, output: "" }])).toEqual({ ok: true });
  });

  it("names the one that failed", () => {
    const verdict = verdictOf([
      { label: "typecheck", code: 0, output: "" },
      { label: "test", code: 1, output: "2 failing" },
    ]);
    expect(verdict.ok).toBe(false);
    expect(verdict.failed?.label).toBe("test");
  });

  // A command that could not be started is a failure, not a pass by omission.
  it("counts a command that never ran as a failure", () => {
    expect(verdictOf([{ label: "x", code: null, output: "" }]).ok).toBe(false);
  });

  it("passes when there was nothing to run", () => {
    expect(verdictOf([])).toEqual({ ok: true });
  });
});

describe("briefOutput", () => {
  it("leaves short output alone", () => {
    expect(briefOutput("  two failing  ")).toBe("two failing");
  });

  // The end, because that is where a test runner puts the summary.
  it("keeps the end when it is long", () => {
    const text = "a".repeat(500) + "THE FAILURE";
    const brief = briefOutput(text, 50);
    expect(brief.endsWith("THE FAILURE")).toBe(true);
    expect(brief.length).toBe(51);
  });
});

describe("runVerifyCommand", () => {
  let calls: Array<{ program: string; args: string[]; cwd?: string; timeout?: number }>;

  beforeEach(() => {
    calls = [];
  });

  const withExec = (exec: (program: string, args: string[]) => { code: number | null; stdout: string; stderr: string }) => {
    setTransport({
      ...nullTransport,
      exec: async (program, args, cwd, timeoutSecs) => {
        calls.push({ program, args, cwd, timeout: timeoutSecs });
        return exec(program, args);
      },
    });
  };

  it("runs the program with its arguments apart, in the folder it was given", async () => {
    withExec(() => ({ code: 0, stdout: "ok", stderr: "" }));
    const result = await runVerifyCommand(command(), "C:/work/thing");
    expect(result).toEqual({ label: "test", code: 0, output: "ok" });
    expect(calls).toEqual([
      { program: "npm", args: ["test"], cwd: "C:/work/thing", timeout: VERIFY_TIMEOUT_SECS },
    ]);
  });

  // On Windows `npm` is a `.cmd` shim that CreateProcess will not resolve from a bare name, so the
  // most obvious command anyone would write fails before it runs. The retry keeps the args apart.
  it("retries through the command interpreter when the program cannot be started", async () => {
    withExec(program => program === "npm"
      ? { code: null, stdout: "", stderr: "" }
      : { code: 0, stdout: "ran", stderr: "" });

    const result = await runVerifyCommand(command(), "C:/work");
    expect(result.code).toBe(0);
    expect(calls[1]).toMatchObject({ program: "cmd.exe", args: ["/d", "/s", "/c", "npm", "test"] });
  });

  it("comes back as a failure when neither attempt could start it", async () => {
    withExec(() => ({ code: null, stdout: "", stderr: "" }));
    const result = await runVerifyCommand(command({ program: "nope" }), "C:/work");
    expect(result.code).toBeNull();
    expect(result.output).toContain("nope");
  });

  it("does not let a transport that throws escape", async () => {
    setTransport({ ...nullTransport, exec: async () => { throw new Error("boom"); } });
    const result = await runVerifyCommand(command(), "C:/work");
    expect(result.code).toBeNull();
  });

  it("keeps what the command printed on both streams", async () => {
    withExec(() => ({ code: 1, stdout: "out", stderr: "err" }));
    const result = await runVerifyCommand(command(), "C:/work");
    expect(result.output).toBe("out\nerr");
  });
});

describe("runVerification", () => {
  const ran: string[] = [];

  beforeEach(() => {
    ran.length = 0;
  });

  it("stops at the first failure: there is no point testing what will not build", async () => {
    setTransport({
      ...nullTransport,
      exec: async (_program, args) => {
        ran.push(args.join(" "));
        return { code: args[0] === "typecheck" ? 1 : 0, stdout: "", stderr: "nope" };
      },
    });

    const verdict = await runVerification(
      [command({ id: "a", label: "types", args: ["typecheck"] }), command({ id: "b", label: "tests", args: ["test"] })],
      "C:/work",
    );

    expect(verdict.ok).toBe(false);
    expect(verdict.failed?.label).toBe("types");
    expect(ran).toEqual(["typecheck"]);
  });

  it("runs them all when they pass, in the order they were given", async () => {
    setTransport({
      ...nullTransport,
      exec: async (_program, args) => {
        ran.push(args.join(" "));
        return { code: 0, stdout: "", stderr: "" };
      },
    });

    const verdict = await runVerification(
      [command({ id: "a", args: ["lint"] }), command({ id: "b", args: ["test"] })],
      "C:/work",
    );

    expect(verdict.ok).toBe(true);
    expect(ran).toEqual(["lint", "test"]);
  });

  it("passes when the project declared nothing", async () => {
    const exec = vi.fn();
    setTransport({ ...nullTransport, exec });
    expect(await runVerification([], "C:/work")).toEqual({ ok: true });
    expect(exec).not.toHaveBeenCalled();
  });
});
