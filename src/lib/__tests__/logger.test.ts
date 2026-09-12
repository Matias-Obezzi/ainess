// The log is the one place a credential must never land, and the Telegram bot token travels in a
// URL path rather than a query or a header — which is why the masker that knew about `token=`,
// `Bearer` and `api_key` wrote it out whole, every forty-five seconds, for as long as a poll failed.
import { describe, it, expect } from "vitest";
import { maskSecrets } from "@/lib/logger";

describe("maskSecrets", () => {
  it("masks a Telegram bot token in the URL path", () => {
    const line = "GET https://api.telegram.org/bot123456789:AAHxyz_ABC-def0123/getUpdates?offset=0 failed: timeout";
    expect(maskSecrets(line)).toBe("GET https://api.telegram.org/bot***/getUpdates?offset=0 failed: timeout");
  });

  it("masks it at the end of the string too", () => {
    expect(maskSecrets("token path /bot42:abcDEF")).toBe("token path /bot***");
  });

  it("leaves a path that only looks like it alone", () => {
    // No digits, no colon: not the shape of a bot token.
    expect(maskSecrets("/bottle/water")).toBe("/bottle/water");
    expect(maskSecrets("/bot/noid")).toBe("/bot/noid");
  });

  it("still masks the shapes it already knew", () => {
    expect(maskSecrets("x?token=abc&y=1")).toBe("x?token=***&y=1");
    expect(maskSecrets("Authorization: Bearer abc.def")).toBe("Authorization: Bearer ***");
  });
});
