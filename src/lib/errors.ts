// What an error from a CLI actually means.
//
// Every provider fails in its own words, and what reached the conversation was that raw line: an
// English sentence about a subscription, a stack trace, an `os error 2`. It says nothing about
// what to do next, and the same failure looks different depending on which agent hit it. Here each
// one is read once and turned into a sentence in the user's language, with the original kept for
// whoever wants it.
//
// Nothing is invented: every pattern below comes from a message this app has actually shown.

export type ErrorKind = "quota" | "auth" | "model" | "missing-cli" | "network" | "timeout" | "tool" | "stopped" | "unknown";

export interface ExplainedError {
  kind: ErrorKind;
  /** Dictionary key of the one-line headline. */
  titleKey: string;
  /** Dictionary key of what to do about it, when there is something to do. */
  hintKey?: string;
  /** Values for those two, already extracted from the text (a model name, a wait). */
  values?: Record<string, string>;
  /** The original, for the detail nobody reads until they need it. */
  raw: string;
}

/** `130h23m56s` → `130 h 23 min`; the seconds do not matter when the wait is that long. */
function humanWait(raw: string): string | undefined {
  const match = /(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?/.exec(raw.trim());
  if (!match || (!match[1] && !match[2] && !match[3])) return undefined;
  const [, h, m, s] = match;
  if (h) return m ? `${h} h ${m} min` : `${h} h`;
  if (m) return `${m} min`;
  return s ? `${s} s` : undefined;
}

const PATTERNS: Array<{
  kind: ErrorKind;
  test: RegExp;
  titleKey: string;
  hintKey?: string;
  values?: (text: string) => Record<string, string> | undefined;
}> = [
  {
    // «Individual quota reached … Resets in 130h23m56s.» (Antigravity), «You have exceeded your
    // monthly quota» (Copilot), a 429 from the Gemini API through opencode.
    kind: "quota",
    test: /quota|rate.?limit|429|too many requests|premium requests|limit reached|resource_exhausted/i,
    titleKey: "error.quota.title",
    hintKey: "error.quota.hint",
    values: (text) => {
      const resets = /resets? in ([\dhms]+)/i.exec(text);
      const wait = resets && humanWait(resets[1]);
      return wait ? { wait } : undefined;
    },
  },
  {
    // A model the account cannot use: «Model "claude-opus-5" from --model flag is not available.»
    kind: "model",
    test: /model .*(not available|not found|does not exist|unknown model)|unknown model/i,
    titleKey: "error.model.title",
    hintKey: "error.model.hint",
    values: (text) => {
      const name = /model\s+"?([\w.:\-/]+)"?/i.exec(text);
      return name ? { model: name[1] } : undefined;
    },
  },
  {
    kind: "auth",
    test: /unauthorized|forbidden|\b401\b|\b403\b|invalid api key|authentication failed|not logged in|please (log|sign) in|token (has )?expired/i,
    titleKey: "error.auth.title",
    hintKey: "error.auth.hint",
  },
  {
    // A CLI that is not there, whichever way the shell says it.
    kind: "missing-cli",
    test: /no se encontró el cli|not recognized as an internal|command not found|no such file or directory|os error 2|executable file not found/i,
    titleKey: "error.missingCli.title",
    hintKey: "error.missingCli.hint",
  },
  {
    kind: "network",
    test: /econnrefused|etimedout|enotfound|getaddrinfo|socket hang up|network (error|unreachable)|dns/i,
    titleKey: "error.network.title",
    hintKey: "error.network.hint",
  },
  {
    // «Background tasks still running after 600s; terminating.»
    kind: "timeout",
    test: /timed? ?out|still running after|deadline exceeded|terminating/i,
    titleKey: "error.timeout.title",
    hintKey: "error.timeout.hint",
  },
  {
    // Ours: a tool the agent called came back with an error.
    kind: "tool",
    test: /^falló la herramienta\s+(.+)$/i,
    titleKey: "error.tool.title",
    values: (text) => {
      const name = /^falló la herramienta\s+([\w.-]+)/i.exec(text.trim());
      return name ? { tool: name[1] } : undefined;
    },
  },
  {
    kind: "stopped",
    test: /^\[?detenido por el usuario\]?$/i,
    titleKey: "error.stopped.title",
  },
];

/**
 * Reads one error and says what it is. Everything it cannot place comes back as `unknown`, which
 * the UI shows as the text itself: a message we do not understand is still the best thing to show.
 */
export function explainError(raw: string): ExplainedError {
  const text = raw.trim();
  for (const pattern of PATTERNS) {
    if (!pattern.test.test(text)) continue;
    const values = pattern.values?.(text);
    return {
      kind: pattern.kind,
      titleKey: pattern.titleKey,
      hintKey: pattern.hintKey,
      ...(values ? { values } : {}),
      raw: text,
    };
  }
  return { kind: "unknown", titleKey: "error.unknown.title", raw: text };
}

/** The first line, which is what a headline shows when we have nothing better than the text. */
export function firstLine(text: string, max = 160): string {
  const line = text.split(/\r?\n/).map(l => l.trim()).find(Boolean) ?? text.trim();
  return line.length > max ? `${line.slice(0, max - 1)}…` : line;
}
