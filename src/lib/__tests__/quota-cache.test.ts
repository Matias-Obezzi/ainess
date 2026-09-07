// The app asks for the quota from four places at once — the rings, the agent dialog, the timer and
// the sweep after each run — and every one of them used to be a request of its own. Claude Code's
// usage endpoint answers 429 to that, and the numbers turned into "HTTP 429".
import { describe, it, expect, beforeEach, vi } from "vitest";
import { fetchQuota, clearQuotaCache, QUOTA_CACHE_MS, QUOTA_BACKOFF_MS } from "@/lib/quota";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";

const USAGE = { five_hour: { utilization: 20, resets_at: "2026-09-08T00:00:00Z" } };

/** A transport that counts what it was asked and answers what the test wants. */
function transport(reply: () => { status: number; body: string }) {
  const calls = { get: 0 };
  setTransport({
    ...nullTransport,
    readHomeFile: async () => JSON.stringify({ claudeAiOauth: { accessToken: "t" } }),
    httpGet: async () => {
      calls.get++;
      return reply();
    },
  });
  return calls;
}

const ok = () => ({ status: 200, body: JSON.stringify(USAGE) });
const tooMany = () => ({ status: 429, body: "" });

beforeEach(() => {
  clearQuotaCache();
  vi.useRealTimers();
});

describe("fetchQuota", () => {
  it("asks once for everyone who asks at the same time", async () => {
    const calls = transport(ok);
    const results = await Promise.all([fetchQuota("claude"), fetchQuota("claude"), fetchQuota("claude")]);
    expect(calls.get).toBe(1);
    for (const r of results) expect(r.status).toBe("ok");
  });

  it("reuses the answer for a minute and reads it again when asked on purpose", async () => {
    const calls = transport(ok);
    await fetchQuota("claude");
    await fetchQuota("claude");
    expect(calls.get).toBe(1);

    await fetchQuota("claude", undefined, { force: true });
    expect(calls.get).toBe(2);
  });

  it("keeps the last numbers while a 429 lasts, and stops asking", async () => {
    let reply = ok;
    const calls = transport(() => reply());
    const good = await fetchQuota("claude");
    expect(good.items).toHaveLength(1);

    reply = tooMany;
    const limited = await fetchQuota("claude", undefined, { force: true });
    expect(calls.get).toBe(2);
    // What it said last time it worked, not an error where the numbers go.
    expect(limited.status).toBe("ok");
    expect(limited.items).toHaveLength(1);

    // And nothing else is asked of it for a while: the cache answers on its own.
    await fetchQuota("claude");
    await fetchQuota("claude");
    expect(calls.get).toBe(2);
  });

  it("says so when the very first read is a 429", async () => {
    transport(tooMany);
    const result = await fetchQuota("claude");
    expect(result.status).toBe("error");
    expect(result.rateLimited).toBe(true);
  });

  it("holds a provider back for five minutes, not for a minute", () => {
    expect(QUOTA_BACKOFF_MS).toBeGreaterThan(QUOTA_CACHE_MS);
  });
});
