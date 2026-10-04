import { McpServer } from "@/types";

/**
 * Takes the credentials of one server out of a text that is about to be shown. Same idea as
 * `sanitizeBridgeError` in `src/lib/bridge/index.ts`: the secret is known here, so it is matched by
 * its literal value instead of guessed at with a pattern.
 *
 * Exported for its own test. This is the one place a token could reach the screen, and a redaction
 * that quietly stops matching is indistinguishable from one that works until the day it does not.
 */
export function redactSecrets(text: string, server: McpServer): string {
  let out = text;
  for (const value of [...Object.values(server.headers ?? {}), ...Object.values(server.env ?? {})]) {
    if (value && value.trim()) out = out.split(value).join("[REDACTED]");
  }
  return out;
}
