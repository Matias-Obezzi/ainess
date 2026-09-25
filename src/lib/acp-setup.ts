// Installing the managed ACP runtime, awaited from outside React.
//
// Same shape as `confirm()` (see src/lib/confirm.ts and src/components/ui/confirm-dialog.tsx):
// whoever needs the runtime — the gate before a claude run, the button in Settings → Agents — calls
// `ensureAcpRuntime()` and awaits one answer, and the dialog mounted near the root is the host that
// produces it. Nobody renders the screen to ask for it.
//
// The loop is here rather than in the caller because an install can fail and be tried again: the
// caller stays parked until it worked or the user stopped asking for it, so a retry that succeeds
// still starts the run that was waiting for it.
import { getTransport } from "@/lib/transport";
import { translateNow } from "@/i18n/useT";
import { useAppStore } from "@/store";

/** What the screen answers when an attempt failed. */
export type AcpSetupDecision = "retry" | "cancel";

export interface AcpSetupQuestion {
  resolve: (decision: AcpSetupDecision) => void;
}

interface Registry {
  /** Set while a host is mounted; a failed attempt only reaches the screen through it. */
  ask: ((question: AcpSetupQuestion) => void) | null;
  /** Asked before a host registered. Held, never dropped: a question has to reach somebody. */
  waiting: AcpSetupQuestion[];
  /** The flow in progress, so two runs starting at once install once and answer together. */
  inFlight: Promise<boolean> | null;
  /** The user pressed cancel while something was installing: do not ask again, just give up. */
  aborted: boolean;
}

/**
 * On `globalThis`, not in this module's scope. A hot reload during development gives the module a
 * second copy, and the mounted host would be registered in one while the flow reads the other: the
 * question then reached nobody.
 */
const registry: Registry = ((globalThis as unknown as { __aisAcpSetup?: Registry }).__aisAcpSetup ??= {
  ask: null,
  waiting: [],
  inFlight: null,
  aborted: false,
});

/** Mounted once by the dialog, on every render (see `ConfirmDialogHost` for why every render). */
export function registerAcpSetupHost(ask: (question: AcpSetupQuestion) => void): () => void {
  registry.ask = ask;
  const held = registry.waiting.shift();
  if (held) ask(held);
  return () => {
    // Only if it is still ours: a second host taking over must not be unregistered by the first.
    if (registry.ask === ask) registry.ask = null;
  };
}

/**
 * Installs the runtime and the adapter, retrying as long as the screen asks for it.
 *
 * `true` once the adapter is there — the caller can spawn. `false` when the user gave up, either by
 * cancelling an install in flight or by answering cancel on the error face.
 */
export function ensureAcpRuntime(): Promise<boolean> {
  if (registry.inFlight) return registry.inFlight;
  const flow = runFlow().finally(() => {
    registry.inFlight = null;
  });
  registry.inFlight = flow;
  return flow;
}

/** The screen's cancel button while something is installing. */
export function abortAcpSetup(): void {
  registry.aborted = true;
  void getTransport().acpManagedCancel();
}

async function runFlow(): Promise<boolean> {
  registry.aborted = false;
  for (;;) {
    showProgress();
    const status = await getTransport().acpManagedEnsure();
    if (status?.runtimeReady && status.adapterReady) {
      close();
      return true;
    }
    if (registry.aborted) {
      close();
      return false;
    }
    // Rust puts the screen on its error face itself, with the reason in `message`. A failure it
    // never reported — a rejected command, a transport that answers nothing — would leave the
    // progress bar spinning with no way out, so the face is forced here when it is missing.
    if (useAppStore.getState().acpSetup.phase !== "error") {
      useAppStore.getState().setAcpSetup({ phase: "error", message: translateNow("run.acpSetupFailed") });
    }
    if ((await askScreen()) === "cancel") {
      close();
      return false;
    }
  }
}

function askScreen(): Promise<AcpSetupDecision> {
  return new Promise<AcpSetupDecision>(resolve => {
    const question: AcpSetupQuestion = { resolve };
    if (registry.ask) registry.ask(question);
    else registry.waiting.push(question);
  });
}

/** Opens the screen on a clean slate: a second attempt must not show the first one's error. */
function showProgress(): void {
  useAppStore.getState().setAcpSetup({
    open: true,
    phase: undefined,
    received: undefined,
    total: undefined,
    message: undefined,
  });
}

function close(): void {
  useAppStore.getState().setAcpSetup({ open: false });
}
