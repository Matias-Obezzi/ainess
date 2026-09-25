// The two halves of "Claude Code is not logged in", as they arrive over ACP.
//
// Both live here and not in src/lib/acp/session.ts because that module pulls the whole SDK in, and
// it is loaded dynamically so the phone build never sees it (see `runAcpPrompt`). The orchestrator
// has to be able to ask "was this failure a missing login?" with a static import, which is what
// `AcpAuthRequiredError` is for, and the payload parser is worth testing without a process.
import { log } from "@/lib/logger";
import type { ClaudeAuthKind, ClaudeAuthStatus } from "@/types";

/**
 * JSON-RPC code of the `auth_required` error (`RequestError.authRequired()` in the SDK).
 *
 * It is what `session/new` and `session/prompt` answer when the agent behind the adapter has no
 * session of its own, and the only thing about that failure that is not prose.
 */
export const AUTH_REQUIRED_CODE = -32000;

/** The extension notification the adapter pushes whenever the identity it sees changes. */
export const AUTH_STATUS_METHOD = "_auth/status_update";

/** Every `kind` the adapter is allowed to send. Anything else is a payload we do not understand. */
const KINDS: readonly ClaudeAuthKind[] = ["account", "api_key", "gateway", "external", "none"];

/**
 * A turn that could not start or could not run because nobody is logged in.
 *
 * Thrown in place of the raw `RequestError` so the caller can tell this apart from "the agent died"
 * without reading the message — the message is English prose from the adapter and is not a contract.
 */
export class AcpAuthRequiredError extends Error {
  /** The error the agent actually answered, kept for the log and the run's detail. */
  readonly cause: unknown;

  constructor(message: string, cause?: unknown) {
    super(message);
    this.name = "AcpAuthRequiredError";
    this.cause = cause;
  }
}

/** Whether a rejected ACP request was rejected for want of a login. */
export function isAuthRequired(e: unknown): boolean {
  if (e instanceof AcpAuthRequiredError) return true;
  if (!e || typeof e !== "object") return false;
  const code = (e as { code?: unknown }).code;
  return code === AUTH_REQUIRED_CODE;
}

/**
 * The `authStatus` inside an `_auth/status_update`, or null when the payload is not one.
 *
 * Validated rather than trusted: this crosses a process boundary from a package the app installs
 * and upgrades on its own, and a `kind` this build does not know is a payload whose meaning it
 * cannot guess — dropping it leaves the app in "could not be determined", which is honest, while
 * keeping it would put a string nobody handles where the UI expects one of five.
 */
export function parseAuthStatus(params: unknown): ClaudeAuthStatus | null {
  const status = (params as { authStatus?: unknown } | null | undefined)?.authStatus;
  if (!status || typeof status !== "object") {
    log.warn("acp", `${AUTH_STATUS_METHOD}: no authStatus in the payload; ignoring it`);
    return null;
  }
  const raw = status as Record<string, unknown>;
  if (typeof raw.kind !== "string" || !KINDS.includes(raw.kind as ClaudeAuthKind)) {
    log.warn("acp", `${AUTH_STATUS_METHOD}: unknown kind ${JSON.stringify(raw.kind)}; ignoring it`);
    return null;
  }
  const parsed: ClaudeAuthStatus = {
    kind: raw.kind as ClaudeAuthKind,
    // The adapter always sends one; a build that does not is still telling us which identity it is.
    label: typeof raw.label === "string" ? raw.label : raw.kind,
  };
  if (typeof raw.detail === "string") parsed.detail = raw.detail;
  const account = raw.account;
  if (account && typeof account === "object") {
    const a = account as Record<string, unknown>;
    const picked: NonNullable<ClaudeAuthStatus["account"]> = {};
    if (typeof a.email === "string") picked.email = a.email;
    if (typeof a.organization === "string") picked.organization = a.organization;
    if (typeof a.plan === "string") picked.plan = a.plan;
    if (Object.keys(picked).length > 0) parsed.account = picked;
  }
  if (raw.vendor && typeof raw.vendor === "object") parsed.vendor = raw.vendor as Record<string, unknown>;
  return parsed;
}

/** Whether a status says, in so many words, that nobody is logged in. */
export function saysLoggedOut(status: ClaudeAuthStatus | null | undefined): boolean {
  return status?.kind === "none";
}
