// Reading a CLI's error. Every string here is one this app has actually shown, taken from the
// history on disk or from a run watched today — nothing invented, because a pattern that matches
// an imaginary message is a pattern that matches nothing.
import { describe, it, expect } from "vitest";
import { explainError, firstLine } from "@/lib/errors";

describe("explainError", () => {
  it("reads Antigravity running out, and how long the wait is", () => {
    const e = explainError("Individual quota reached. Please upgrade your subscription to increase your limits. Resets in 130h23m56s.");
    expect(e.kind).toBe("quota");
    expect(e.values?.wait).toBe("130 h 23 min");
  });

  it("reads Copilot's monthly quota and a 429 from the Gemini API", () => {
    expect(explainError("You have exceeded your monthly quota (Request ID: E043:968F)").kind).toBe("quota");
    expect(explainError("You exceeded your current quota, please check your plan and billing details. (HTTP 429)").kind).toBe("quota");
  });

  it("names the model a provider refused", () => {
    const e = explainError('Error: Model "claude-opus-5" from --model flag is not available.');
    expect(e.kind).toBe("model");
    expect(e.values?.model).toBe("claude-opus-5");
  });

  it("reads a run that was cut short for taking too long", () => {
    const e = explainError("Background tasks still running after 600s; terminating. Set CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 to wait indefinitely.");
    expect(e.kind).toBe("timeout");
    expect(e.hintKey).toBeTruthy();
  });

  it("reads a CLI that is not on the machine, whichever way it was said", () => {
    for (const text of [
      "No se pudo ejecutar C:\\ngrok.exe: The system cannot find the file specified. (os error 2)",
      "'copilot' is not recognized as an internal or external command",
      "No se encontró el CLI de Claude Code. Instalalo o configurá un comando custom.",
    ]) {
      expect(explainError(text).kind, text).toBe("missing-cli");
    }
  });

  it("reads a session that expired and a key that does not work", () => {
    expect(explainError("HTTP 401: Unauthorized").kind).toBe("auth");
    expect(explainError("authentication failed: invalid api key").kind).toBe("auth");
  });

  it("names the tool that failed", () => {
    const e = explainError("Falló la herramienta replace_file_content");
    expect(e.kind).toBe("tool");
    expect(e.values?.tool).toBe("replace_file_content");
  });

  it("knows the user pulling the plug is not a failure to explain", () => {
    expect(explainError("[detenido por el usuario]").kind).toBe("stopped");
  });

  it("hands back what it cannot place, rather than guessing", () => {
    const raw = "panic: runtime error: index out of range [3] with length 2";
    const e = explainError(raw);
    expect(e.kind).toBe("unknown");
    expect(e.raw).toBe(raw);
  });

  it("keeps the original whole, whatever it decided", () => {
    const raw = "  Individual quota reached.\nSecond line.  ";
    expect(explainError(raw).raw).toBe(raw.trim());
  });
});

describe("firstLine", () => {
  it("takes the first line with something in it", () => {
    expect(firstLine("\n\n  primero  \nsegundo")).toBe("primero");
  });

  it("cuts a line that would not fit", () => {
    expect(firstLine("x".repeat(200), 20)).toHaveLength(20);
  });
});

describe("what a CLI left running", () => {
  it("reads Claude Code's ceiling as what it is", () => {
    const e = explainError("Background tasks still running after 600s; terminating. Set CLAUDE_CODE_PRINT_BG_WAIT_CEILING_MS=0 to wait indefinitely.");
    expect(e.kind).toBe("timeout");
    expect(e.titleKey).toBe("error.bgTasks.title");
    expect(e.hintKey).toBe("error.bgTasks.hint");
  });

  it("leaves the other timeouts as they were", () => {
    expect(explainError("deadline exceeded").titleKey).toBe("error.timeout.title");
  });
});
