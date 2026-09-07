// Installing an agent's CLI from the app: only what each one documents, and never a remote script
// piped into a shell. The command is written where the button is, so nothing runs unannounced.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { INSTALLERS, installCommand, installCommandText, installerFor, installProvider } from "@/lib/install-agents";
import { PROVIDERS } from "@/lib/providers";
import { nullTransport } from "@/lib/transport-null";
import { setTransport } from "@/lib/transport";
import type { ProviderId } from "@/types";

describe("INSTALLERS", () => {
  it("covers every provider but the custom one, which is a command the user writes", () => {
    const providers = (Object.keys(PROVIDERS) as ProviderId[]).filter(p => p !== "custom");
    for (const provider of providers) {
      expect(installerFor(provider), provider).toBeDefined();
    }
    expect(installerFor("custom")).toBeUndefined();
  });

  it("runs nothing for the ones that ship no command of their own", () => {
    // Antigravity's CLI comes with the app; aider is a Python package whose install depends on the
    // machine. Guessing a command for either is worse than opening their instructions.
    expect(INSTALLERS.antigravity.kind).toBe("manual");
    expect(INSTALLERS.aider.kind).toBe("manual");
    expect(installCommand(INSTALLERS.antigravity)).toBeUndefined();
  });

  it("installs globally with npm, reversibly", () => {
    expect(installCommandText(INSTALLERS.claude)).toBe("npm install -g @anthropic-ai/claude-code");
    expect(installCommandText(INSTALLERS.opencode)).toBe("npm install -g opencode-ai");
  });

  it("lets winget answer for itself, without a prompt nobody can see", () => {
    const command = installCommand(INSTALLERS.ollama)!;
    expect(command.program).toBe("winget");
    expect(command.args).toEqual(expect.arrayContaining(["install", "Ollama.Ollama", "--disable-interactivity"]));
  });
});

describe("installProvider", () => {
  const phases: string[] = [];
  beforeEach(() => { phases.length = 0; });

  function transport(over: Partial<typeof nullTransport>) {
    setTransport({ ...nullTransport, ...over });
  }

  it("runs the command and answers with the path it found", async () => {
    const ran: string[][] = [];
    transport({
      exec: async (program: string, args: string[]) => { ran.push([program, ...args]); return { code: 0, stdout: "added 1 package", stderr: "" }; },
      detectBinaries: async () => ({ gemini: { path: "C:/npm/gemini.cmd" } }),
    });
    await expect(installProvider("gemini", p => phases.push(p))).resolves.toBe("C:/npm/gemini.cmd");
    expect(ran).toEqual([["npm", "install", "-g", "@google/gemini-cli"]]);
    expect(phases).toEqual(["installing", "detecting"]);
  });

  it("takes «already installed» for an answer, not a failure", async () => {
    transport({
      // winget says so with a non-zero code.
      exec: async () => ({ code: 2316632107, stdout: "", stderr: "Ya está instalado" }),
      detectBinaries: async () => ({ ollama: { path: "C:/ollama.exe" } }),
    });
    await expect(installProvider("ollama", p => phases.push(p))).resolves.toBe("C:/ollama.exe");
  });

  it("says which program is missing instead of the raw error", async () => {
    transport({ exec: async () => { throw new Error("program not found: npm"); } });
    await expect(installProvider("claude", () => {})).rejects.toThrow(/No se encontró `npm`/);
  });

  it("keeps the last lines when the install itself failed", async () => {
    transport({ exec: async () => ({ code: 1, stdout: "", stderr: "npm ERR! code E404\nnpm ERR! 404 Not Found" }) });
    await expect(installProvider("codex", () => {})).rejects.toThrow(/404 Not Found/);
  });

  it("does not claim success when the CLI still does not show up", async () => {
    // A global npm install lands somewhere this process's PATH may not have yet.
    transport({
      exec: async () => ({ code: 0, stdout: "added 1 package", stderr: "" }),
      detectBinaries: async () => ({}),
    });
    await expect(installProvider("copilot", () => {})).rejects.toThrow(/Reiniciá la app/);
  });

  it("refuses to run anything for a provider with no command", async () => {
    await expect(installProvider("antigravity", () => {})).rejects.toThrow(/no se instala desde acá/);
    await expect(installProvider("custom", () => {})).rejects.toThrow(/no se instala desde acá/);
  });
});
