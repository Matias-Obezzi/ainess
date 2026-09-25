// Claude Code's identity: who it is logged in as, and how to log it in from inside the app.
//
// Everything about the login lives here. The adapter (`@agentclientprotocol/claude-agent-acp`) only
// ever *reports* an identity — it pushes `_auth/status_update` and it answers `auth_required` — and
// ACP's own `authenticate` is not the way in: in this adapter that method serves legacy gateways,
// not a subscription. The login is the engine's own CLI, `claude auth login`, run in one of the
// app's integrated terminals because it is a browser flow the user has to finish by hand.
//
// The credentials land in `~/.claude`, which is shared with every other Claude Code on the machine:
// logging in here logs in everything else, and logging out anywhere logs out here.
//
// `ensureClaudeAuth()` is the gate, built like `ensureAcpRuntime()` (src/lib/acp-setup.ts), which is
// itself built like `confirm()` (src/lib/confirm.ts): whoever needs a login awaits one answer and a
// screen mounted near the root is the host that produces it. Nobody renders that screen to ask.
import { ensureAcpRuntime } from "@/lib/acp-setup";
import { log } from "@/lib/logger";
import { getTransport } from "@/lib/transport";
import { translateNow } from "@/i18n/useT";
import { useAppStore } from "@/store";
import type { ClaudeAuthStatus } from "@/types";

/** How long `claude auth status --json` gets before it is treated as "could not be determined". */
const PROBE_TIMEOUT_SECS = 10;

/** What the screen answers. */
export type ClaudeAuthDecision = "login" | "install" | "cancel";

export interface ClaudeAuthQuestion {
  resolve: (decision: ClaudeAuthDecision) => void;
}

interface Registry {
  /** Set while a host is mounted; the gate only reaches the screen through it. */
  ask: ((question: ClaudeAuthQuestion) => void) | null;
  /** Asked before a host registered. Held, never dropped: a question has to reach somebody. */
  waiting: ClaudeAuthQuestion[];
  /** The flow in progress, so two runs that fail at once ask once and are answered together. */
  inFlight: Promise<boolean> | null;
}

/**
 * On `globalThis`, not in this module's scope, for the same reason as the setup registry: a hot
 * reload gives the module a second copy and the mounted host would register in the other one.
 */
const registry: Registry = ((globalThis as unknown as { __aisClaudeAuth?: Registry }).__aisClaudeAuth ??= {
  ask: null,
  waiting: [],
  inFlight: null,
});

/** Mounted once by the dialog, on every render (see `AcpSetupDialog` for why every render). */
export function registerClaudeAuthHost(ask: (question: ClaudeAuthQuestion) => void): () => void {
  registry.ask = ask;
  const held = registry.waiting.shift();
  if (held) ask(held);
  return () => {
    // Only if it is still ours: a second host taking over must not be unregistered by the first.
    if (registry.ask === ask) registry.ask = null;
  };
}

/**
 * The binary `claude auth …` is run with, or null when this machine has none.
 *
 * In the order a user would expect to be obeyed:
 *   1. what they set by hand in Settings → Agents for `claude` — an explicit choice outranks
 *      anything found on its own, and it is the one the runs already use (`binaryPath` in
 *      `launchRun`, which reads `binaries.claude`, which `detectBinaries` fills from the override);
 *   2. `claude` on PATH, the ordinary installation;
 *   3. the engine that came with the managed runtime the app installed for itself, which is the
 *      only one a machine without node has.
 */
export async function resolveClaudeEngine(): Promise<string | null> {
  const override = useAppStore.getState().config.binaryOverrides?.claude?.trim();
  if (override) return override;

  const transport = getTransport();
  try {
    const onPath = await transport.whichProgram("claude");
    if (onPath) return onPath;
  } catch (e) {
    log.warn("claude-auth", `could not look for claude on PATH: ${errorText(e)}`);
  }

  try {
    const managed = await transport.acpManagedStatus();
    if (managed?.enginePath) return managed.enginePath;
  } catch (e) {
    log.warn("claude-auth", `could not read the managed runtime status: ${errorText(e)}`);
  }
  return null;
}

/**
 * Asks the engine who it is logged in as. Null means "could not be determined".
 *
 * Null is a real answer and not a failure to report: no engine, no JSON, a command that hung. It is
 * never "logged in" by default — the app would then send the user into a run that cannot start and
 * call it a crash. Only an actual `loggedIn: false` comes back as `kind: "none"`.
 *
 * Exit code 1 with valid JSON on stdout is exactly what being logged out looks like, so the code is
 * not what decides: the JSON is.
 *
 * Seconds, not milliseconds — the engine starts a whole runtime to answer. That is why nothing polls
 * this before a run: the gate is opened by a run that already failed, not by a check on every one.
 */
export async function probeClaudeAuth(): Promise<ClaudeAuthStatus | null> {
  const engine = await resolveClaudeEngine();
  if (!engine) return null;

  let out: { code: number | null; stdout: string; stderr: string };
  try {
    out = await getTransport().exec(engine, ["auth", "status", "--json"], undefined, PROBE_TIMEOUT_SECS);
  } catch (e) {
    log.warn("claude-auth", `claude auth status failed: ${errorText(e)}`);
    return null;
  }

  const status = parseCliAuthStatus(out.stdout);
  if (!status) {
    log.warn("claude-auth", `claude auth status said nothing readable (code ${out.code ?? "none"})`);
    return null;
  }
  remember(status);
  return status;
}

/**
 * Turns what `claude auth status --json` printed into the same shape the adapter pushes.
 *
 * `loggedIn` is the one field the CLI is contracted to print, and it is the only one anything here
 * decides on; the rest is taken when it happens to be there so Settings has something to show.
 * Exported for the tests, which are the only other caller.
 */
export function parseCliAuthStatus(stdout: string): ClaudeAuthStatus | null {
  const text = stdout.trim();
  if (!text) return null;
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch {
    return null;
  }
  if (!parsed || typeof parsed !== "object") return null;
  const raw = parsed as Record<string, unknown>;
  if (typeof raw.loggedIn !== "boolean") return null;

  // English, like everything the adapter sends in these fields: `label` is data the app displays as
  // it arrives, and a probe has to speak the same language as the notification it stands in for.
  if (!raw.loggedIn) return { kind: "none", label: "Not logged in" };

  const authMethod = typeof raw.authMethod === "string" ? raw.authMethod : "";
  const apiProvider = typeof raw.apiProvider === "string" ? raw.apiProvider : "";
  // The real binary prints `"claude.ai"` for a subscription login. The exact string for a
  // Console/API key login is unconfirmed, so this side is matched loosely.
  const isApiKey = /api/i.test(authMethod) || authMethod === "console" || (apiProvider !== "" && apiProvider !== "firstParty");

  const email = typeof raw.email === "string" ? raw.email : undefined;
  const organization = typeof raw.orgName === "string" ? raw.orgName : typeof raw.organization === "string" ? raw.organization : undefined;
  const plan = typeof raw.subscriptionType === "string" ? raw.subscriptionType : typeof raw.plan === "string" ? raw.plan : undefined;

  const status: ClaudeAuthStatus = {
    kind: isApiKey ? "api_key" : "account",
    label: typeof raw.label === "string" ? raw.label : defaultLabel(email, plan),
  };
  const account: NonNullable<ClaudeAuthStatus["account"]> = {};
  if (email) account.email = email;
  if (organization) account.organization = organization;
  if (plan) account.plan = plan;
  if (Object.keys(account).length > 0) status.account = account;
  return status;
}

/** What to show when the CLI does not send a `label` of its own — the real binary never does. */
function defaultLabel(email: string | undefined, plan: string | undefined): string {
  if (!email) return "Logged in";
  return plan ? `${email} (${plan})` : email;
}

/**
 * Opens `claude auth login` in an integrated terminal and answers once it is over.
 *
 * True only when a probe afterwards says there is a session now. The terminal's exit code is not
 * that proof: the user can close the browser tab, quit the flow or type something else entirely,
 * and the shell would still exit 0.
 *
 * The command is built here out of a path the app resolved, quoted because of `C:\Program Files`.
 * It is never free text a user typed.
 */
export async function loginWithClaude(): Promise<boolean> {
  const engine = await resolveClaudeEngine();
  if (!engine) {
    log.warn("claude-auth", "no claude engine to log in with");
    return false;
  }

  const before = new Set(useAppStore.getState().terminals.map(t => t.id));
  useAppStore.getState().openTerminal({
    command: `"${engine}" auth login`,
    title: translateNow("claudeAuth.terminalTitle"),
  });
  const tab = useAppStore.getState().terminals.find(t => !before.has(t.id));
  if (!tab) {
    // No shell on this machine, or every terminal slot taken. Either way there is nowhere to run it.
    log.warn("claude-auth", "no terminal could be opened for the login");
    return false;
  }

  await terminalEnded(tab.id);
  const status = await probeClaudeAuth();
  return status !== null && status.kind !== "none";
}

/** Logs the engine out. Logs out every other Claude Code on this machine with it. */
export async function claudeLogout(): Promise<void> {
  const engine = await resolveClaudeEngine();
  if (!engine) return;
  try {
    await getTransport().exec(engine, ["auth", "logout"], undefined, PROBE_TIMEOUT_SECS);
  } catch (e) {
    log.warn("claude-auth", `claude auth logout failed: ${errorText(e)}`);
  }
  // Forgotten either way: what we knew was about a session that was just asked to end, and a stale
  // "logged in" is the one answer that sends a run into a wall.
  useAppStore.getState().setClaudeAuth({ status: null });
}

/** Writes down what the adapter pushed, replacing whatever was known before. */
export function rememberClaudeAuthStatus(status: ClaudeAuthStatus): void {
  remember(status);
}

/**
 * Logs Claude Code in, asking the user as many times as they are willing to try.
 *
 * True once there is a session — the caller can start the run again. False when the user gave up.
 * Awaited once: two runs that fail for the same reason at the same time share one screen and one
 * answer.
 */
export function ensureClaudeAuth(): Promise<boolean> {
  if (registry.inFlight) return registry.inFlight;
  const flow = runFlow().finally(() => {
    registry.inFlight = null;
  });
  registry.inFlight = flow;
  return flow;
}

async function runFlow(): Promise<boolean> {
  let failed = false;
  for (;;) {
    const engine = await resolveClaudeEngine();
    useAppStore.getState().setClaudeAuth({ open: true, hasEngine: engine !== null, failed });

    const decision = await askScreen();
    if (decision === "cancel") {
      close();
      return false;
    }

    if (decision === "install") {
      // The screen goes away first: the install has a screen of its own, and two modals on top of
      // each other is one the user cannot answer. Whatever the runtime brings, the loop starts over
      // and looks for the engine again — the managed install is what puts one there.
      close();
      if (!(await ensureAcpRuntime())) return false;
      failed = false;
      continue;
    }

    // Also away, and for a harder reason: the login runs in a terminal inside this same window, and
    // a modal dialog is exactly what would stop the user from typing into it.
    close();
    if (await loginWithClaude()) return true;
    failed = true;
  }
}

function askScreen(): Promise<ClaudeAuthDecision> {
  return new Promise<ClaudeAuthDecision>(resolve => {
    const question: ClaudeAuthQuestion = { resolve };
    if (registry.ask) registry.ask(question);
    else registry.waiting.push(question);
  });
}

/** Resolves when the terminal tab `id` has died, however it died. */
function terminalEnded(id: string): Promise<void> {
  const settled = (state: ReturnType<typeof useAppStore.getState>) => {
    const tab = state.terminals.find(t => t.id === id);
    // Gone from the list counts: closing the tab kills the shell, and nobody will mark it exited.
    return !tab || (tab.exited !== null && tab.exited !== undefined);
  };
  if (settled(useAppStore.getState())) return Promise.resolve();
  return new Promise<void>(resolve => {
    const unsubscribe = useAppStore.subscribe(state => {
      if (!settled(state)) return;
      unsubscribe();
      resolve();
    });
  });
}

function remember(status: ClaudeAuthStatus): void {
  useAppStore.getState().setClaudeAuth({ status });
}

function close(): void {
  useAppStore.getState().setClaudeAuth({ open: false });
}

function errorText(e: unknown): string {
  return e instanceof Error ? e.message : String(e);
}
