// What gets typed into a terminal, per shell.
//
// The Claude Code login opened a PowerShell and typed `"C:\…\claude.exe" auth login` into it, which
// PowerShell parses as a string followed by two stray words: "ParserError … auth".
import { describe, it, expect } from "vitest";
import { isPowerShell, typedFor } from "@/lib/terminal-registry";
import { loginCommand } from "@/lib/claude-auth";

const PWSH = "C:\\Users\\matia\\AppData\\Local\\Microsoft\\WindowsApps\\pwsh.exe";
const ENGINE = "C:\\Users\\matia\\AppData\\Roaming\\com.ainess\\acp\\node_modules\\@anthropic-ai\\claude-agent-sdk-win32-x64\\claude.exe";

describe("isPowerShell", () => {
  it("knows both PowerShells, wherever they live", () => {
    expect(isPowerShell(PWSH)).toBe(true);
    expect(isPowerShell("C:\\Windows\\System32\\WindowsPowerShell\\v1.0\\powershell.exe")).toBe(true);
    expect(isPowerShell("/usr/bin/pwsh")).toBe(true);
  });

  it("is not fooled by the other shells", () => {
    expect(isPowerShell("C:\\Windows\\System32\\cmd.exe")).toBe(false);
    expect(isPowerShell("C:\\Program Files\\Git\\bin\\bash.exe")).toBe(false);
    expect(isPowerShell("/bin/zsh")).toBe(false);
  });
});

describe("typedFor", () => {
  it("calls a quoted program in PowerShell", () => {
    expect(typedFor(`"${ENGINE}" auth login`, PWSH)).toBe(`& "${ENGINE}" auth login`);
  });

  it("leaves everything else as it was", () => {
    expect(typedFor("npm run dev", PWSH)).toBe("npm run dev");
    expect(typedFor(`"${ENGINE}" auth login`, "C:\\Windows\\System32\\cmd.exe")).toBe(`"${ENGINE}" auth login`);
    expect(typedFor(`"${ENGINE}" auth login`, "/bin/bash")).toBe(`"${ENGINE}" auth login`);
  });
});

describe("loginCommand", () => {
  it("closes the terminal only once the login worked, in each shell's own words", () => {
    expect(loginCommand(ENGINE, PWSH)).toBe(`"${ENGINE}" auth login; if ($?) { exit }`);
    expect(loginCommand(ENGINE, "C:\\Windows\\System32\\cmd.exe")).toBe(`"${ENGINE}" auth login && exit`);
    expect(loginCommand("/usr/local/bin/claude", "/bin/bash")).toBe(`"/usr/local/bin/claude" auth login && exit`);
  });

  it("is what PowerShell then runs as a call", () => {
    expect(typedFor(loginCommand(ENGINE, PWSH), PWSH)).toBe(`& "${ENGINE}" auth login; if ($?) { exit }`);
  });
});
