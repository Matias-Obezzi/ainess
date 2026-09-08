import { translateNow } from "@/i18n/useT";
// Installing an agent's CLI from the app.
//
// Every provider here is a program someone else ships, and the app can only find what is already
// on the machine: until now a provider that was missing said so and left you to it. What each one
// documents as its install is written down here, and nothing else is attempted — a command is
// never guessed for a CLI that has none, which is what the `manual` method is for: it opens the
// page and lets the user decide.
//
// One of them, Antigravity, documents an installer that is fetched and run (`irm … | iex`). That
// is a different kind of trust than `npm install`, so it is its own method rather than hidden
// among the rest, and the whole command — domain included — is shown next to the button that runs
// it. Nothing here reaches for a script that its vendor does not publish as the way in.
import { getTransport } from "@/lib/transport";
import { PROVIDERS } from "@/lib/providers";
import type { ProviderId } from "@/types";

/** How a CLI gets installed. `manual` means there is nothing safe to run: open its instructions. */
export type InstallMethod =
  | { kind: "npm"; package: string }
  | { kind: "winget"; id: string }
  /** An installer the vendor publishes and documents as the way in. */
  | { kind: "script"; url: string }
  | { kind: "manual"; url: string };

/**
 * What each provider documents. The npm ones are global installs, reversible with `npm rm -g`.
 *
 * Antigravity's CLI comes with the app itself, and aider is a Python package whose install depends
 * on what the machine has (pip, pipx, uv): both point at their own instructions instead.
 */
export const INSTALLERS: Record<Exclude<ProviderId, "custom">, InstallMethod> = {
  claude: { kind: "npm", package: "@anthropic-ai/claude-code" },
  copilot: { kind: "npm", package: "@github/copilot" },
  gemini: { kind: "npm", package: "@google/gemini-cli" },
  codex: { kind: "npm", package: "@openai/codex" },
  opencode: { kind: "npm", package: "opencode-ai" },
  ollama: { kind: "winget", id: "Ollama.Ollama" },
  // What antigravity.google documents. It is a script fetched and run, which nothing else here
  // does: the command is shown in full next to the button, domain included, so the one place it
  // happens is a place the user read first.
  antigravity: { kind: "script", url: "https://antigravity.google/cli/install.ps1" },
  aider: { kind: "manual", url: "https://aider.chat/docs/install.html" },
};

export function installerFor(provider: ProviderId): InstallMethod | undefined {
  return provider === "custom" ? undefined : INSTALLERS[provider];
}

/** The command a button is about to run, so the UI can show it before running it. */
export function installCommand(method: InstallMethod): { program: string; args: string[] } | undefined {
  if (method.kind === "npm") return { program: "npm", args: ["install", "-g", method.package] };
  if (method.kind === "script") {
    return {
      program: "powershell",
      // `-NoProfile` so nothing of the user's own runs first; the rest is the documented line.
      args: ["-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", `irm ${method.url} | iex`],
    };
  }
  if (method.kind === "winget") {
    return {
      program: "winget",
      args: ["install", method.id, "--accept-package-agreements", "--accept-source-agreements", "--disable-interactivity"],
    };
  }
  return undefined;
}

/** As one line, for the label and the log: `npm install -g @google/gemini-cli`. */
export function installCommandText(method: InstallMethod): string | undefined {
  const command = installCommand(method);
  return command && [command.program, ...command.args].join(" ");
}

export type InstallPhase = "installing" | "detecting";

/** A package manager that is not there is the likeliest failure, and it reads badly unqualified. */
const MISSING_RE = /not found|no such file|not recognized|cannot find|no se pudo ejecutar|executable file/i;

/**
 * Runs that command and waits for the provider to show up.
 *
 * Resolves with the path it found. Throws with something worth reading: the last lines of the
 * output, or a plain "install it yourself" when the package manager is missing.
 */
export async function installProvider(
  provider: ProviderId,
  onPhase: (phase: InstallPhase) => void,
): Promise<string> {
  const method = installerFor(provider);
  const command = method && installCommand(method);
  if (!method || !command) {
    throw new Error(`${PROVIDERS[provider]?.label ?? provider} no se instala desde acá: seguí sus instrucciones.`);
  }

  const transport = getTransport();
  onPhase("installing");
  let res;
  try {
    // A cold winget source, or a big npm package, take their time.
    res = await transport.exec(command.program, command.args, undefined, 600);
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    throw new Error(
      MISSING_RE.test(message)
        ? `No se encontró \`${command.program}\` en esta máquina.`
        : `No se pudo ejecutar \`${command.program}\`: ${message}`,
    );
  }

  const output = `${res.stdout}\n${res.stderr}`;
  // winget answers "already installed" with a non-zero code, which is not a failure here.
  if (res.code !== 0 && !/already installed|ya está instalado/i.test(output)) {
    const detail = output.trim().split(/\r?\n/).filter(Boolean).slice(-2).join(" ");
    throw new Error(detail || `\`${command.program}\` terminó con código ${res.code}`);
  }

  onPhase("detecting");
  const binaries = await transport.detectBinaries();
  const found = binaries[provider]?.path;
  if (!found) {
    // A global npm install lands in a folder this process may not have in its PATH yet.
    throw new Error(translateNow("install.notDetected"));
  }
  return found;
}
