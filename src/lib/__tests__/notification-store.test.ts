// Tests for B-14: notification persistence (src/lib/notification-store.ts).
// They exercise the module's own `parseNotificationFile`, not a copy of it: a file that survives a
// round-trip, a corrupted one, one from another version, entries missing fields, the cap, and
// duplicate ids.
import { describe, it, expect, beforeEach } from "vitest";
import { MAX_NOTIFICATIONS } from "@/lib/notifications";
import { parseNotificationFile as parseFile } from "@/lib/notification-store";
import type { AppNotification } from "@/types";

// ---------------------------------------------------------------------------
// Helper to build a minimal valid notification.
// ---------------------------------------------------------------------------
let seq = 0;
function n(over: Partial<AppNotification> = {}): AppNotification {
  seq++;
  return {
    id: `n${seq}`,
    kind: "info",
    title: `Notification ${seq}`,
    ts: seq * 1000,
    read: false,
    ...over,
  };
}

describe("notification-store serialization (B-14)", () => {
  beforeEach(() => { seq = 0; });

  it("round-trip preserves order (newest first) and read flags", () => {
    const notifications: AppNotification[] = [
      n({ ts: 3000, read: false }),
      n({ ts: 2000, read: true }),
      n({ ts: 1000, read: false }),
    ];
    const serialized = JSON.stringify({ version: 1, notifications });
    const loaded = parseFile(serialized);
    expect(loaded.map(x => x.ts)).toEqual([3000, 2000, 1000]);
    expect(loaded.map(x => x.read)).toEqual([false, true, false]);
  });

  it("a file with garbage JSON returns empty list without throwing", () => {
    expect(() => parseFile("not-json{{")).not.toThrow();
    expect(parseFile("not-json{{")).toEqual([]);
  });

  it("a file with wrong version returns empty list", () => {
    const raw = JSON.stringify({ version: 2, notifications: [n()] });
    expect(parseFile(raw)).toEqual([]);
  });

  it("entries without id, ts or kind are discarded", () => {
    const bad = [
      { title: "no id",   ts: 1, kind: "info" },
      { id: "x", title: "no ts",  kind: "info" },
      { id: "y", ts: 1,  title: "no kind" },
      { id: "z", ts: 2, kind: "info", title: "valid" },
    ];
    const raw = JSON.stringify({ version: 1, notifications: bad });
    const loaded = parseFile(raw);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].id).toBe("z");
  });

  it("entries with unknown kind are discarded", () => {
    const bad = [{ id: "x", ts: 1, kind: "unknown-future-kind", title: "t" }];
    const raw = JSON.stringify({ version: 1, notifications: bad });
    expect(parseFile(raw)).toEqual([]);
  });

  it("a list longer than MAX_NOTIFICATIONS is trimmed to the newest MAX_NOTIFICATIONS", () => {
    const many: AppNotification[] = Array.from({ length: MAX_NOTIFICATIONS + 50 }, (_, i) =>
      n({ ts: i + 1 })
    );
    const raw = JSON.stringify({ version: 1, notifications: many });
    const loaded = parseFile(raw);
    expect(loaded).toHaveLength(MAX_NOTIFICATIONS);
    // Newest entries survive.
    expect(loaded[0].ts).toBe(MAX_NOTIFICATIONS + 50);
  });

  it("duplicate ids are deduplicated (first occurrence kept)", () => {
    const a = n({ id: "dup", ts: 100, title: "first" });
    const b = n({ id: "dup", ts: 200, title: "second" });
    const raw = JSON.stringify({ version: 1, notifications: [a, b] });
    const loaded = parseFile(raw);
    expect(loaded).toHaveLength(1);
    expect(loaded[0].title).toBe("first"); // first occurrence wins
  });

  it("read flag is preserved exactly — not forced to true or false", () => {
    const readN   = n({ read: true,  ts: 2000 });
    const unreadN = n({ read: false, ts: 1000 });
    const raw = JSON.stringify({ version: 1, notifications: [readN, unreadN] });
    const loaded = parseFile(raw);
    expect(loaded.find(x => x.id === readN.id)!.read).toBe(true);
    expect(loaded.find(x => x.id === unreadN.id)!.read).toBe(false);
  });
});
