import { describe, it, expect } from "vitest";
import {
  MAX_NOTIFICATIONS,
  dismissNotification,
  freshMessages,
  markAllRead,
  markApprovalRead,
  markRead,
  pushNotification,
  unreadBadge,
  unreadCount,
} from "@/lib/notifications";
import type { AppNotification, NotificationKind } from "@/types";

let seq = 0;
const push = (
  list: AppNotification[],
  input: { kind: NotificationKind; title: string; body?: string; runId?: string; approvalId?: string },
  ts = ++seq,
) => pushNotification(list, input, { id: `n${seq}`, ts });

describe("pushNotification", () => {
  it("puts the newest first", () => {
    let list: AppNotification[] = [];
    list = push(list, { kind: "info", title: "primera" });
    list = push(list, { kind: "info", title: "segunda" });
    expect(list.map(n => n.title)).toEqual(["segunda", "primera"]);
    expect(list.every(n => !n.read)).toBe(true);
  });

  it("refreshes the unread one about the same approval instead of adding another", () => {
    let list: AppNotification[] = [];
    list = push(list, { kind: "approval", title: "pide permiso", approvalId: "a1" });
    const firstId = list[0].id;
    list = push(list, { kind: "approval", title: "pide permiso otra vez", body: "detalle", approvalId: "a1" }, 500);
    expect(list).toHaveLength(1);
    expect(list[0].id).toBe(firstId);
    expect(list[0].title).toBe("pide permiso otra vez");
    expect(list[0].body).toBe("detalle");
    expect(list[0].ts).toBe(500);
  });

  it("dedupes by run too, and moves the refreshed one to the front", () => {
    let list: AppNotification[] = [];
    list = push(list, { kind: "task-done", title: "terminó", runId: "r1" });
    list = push(list, { kind: "info", title: "otra cosa" });
    list = push(list, { kind: "task-done", title: "terminó de nuevo", runId: "r1" });
    expect(list.map(n => n.title)).toEqual(["terminó de nuevo", "otra cosa"]);
  });

  it("does not merge different kinds about the same run", () => {
    let list: AppNotification[] = [];
    list = push(list, { kind: "task-done", title: "terminó", runId: "r1" });
    list = push(list, { kind: "task-failed", title: "falló", runId: "r1" });
    expect(list).toHaveLength(2);
  });

  it("does not touch one that was already read", () => {
    let list: AppNotification[] = [];
    list = push(list, { kind: "approval", title: "vieja", approvalId: "a1" });
    list = markAllRead(list);
    list = push(list, { kind: "approval", title: "nueva", approvalId: "a1" });
    expect(list).toHaveLength(2);
    expect(list[0].read).toBe(false);
    expect(list[1].read).toBe(true);
  });

  it("never dedupes when there is nothing to key on", () => {
    let list: AppNotification[] = [];
    list = push(list, { kind: "tunnel", title: "Se cayó el túnel" });
    list = push(list, { kind: "tunnel", title: "Se cayó el túnel" });
    expect(list).toHaveLength(2);
  });

  it("keeps at most MAX_NOTIFICATIONS, dropping the oldest", () => {
    let list: AppNotification[] = [];
    for (let i = 0; i < MAX_NOTIFICATIONS + 25; i++) {
      list = push(list, { kind: "info", title: `n${i}` });
    }
    expect(list).toHaveLength(MAX_NOTIFICATIONS);
    expect(list[0].title).toBe(`n${MAX_NOTIFICATIONS + 24}`);
    expect(list[list.length - 1].title).toBe("n25");
  });
});

describe("read flags", () => {
  it("counts and badges the unread ones", () => {
    let list: AppNotification[] = [];
    list = push(list, { kind: "info", title: "a" });
    list = push(list, { kind: "info", title: "b" });
    expect(unreadCount(list)).toBe(2);
    expect(unreadBadge(unreadCount(list))).toBe("2");
    expect(unreadBadge(0)).toBeNull();
    expect(unreadBadge(12)).toBe("9+");
  });

  it("marks one, all, and everything about an approval", () => {
    let list: AppNotification[] = [];
    list = push(list, { kind: "approval", title: "a", approvalId: "a1" });
    list = push(list, { kind: "info", title: "b" });
    const target = list.find(n => n.title === "b")!;

    list = markRead(list, target.id);
    expect(unreadCount(list)).toBe(1);

    list = markApprovalRead(list, "a1");
    expect(unreadCount(list)).toBe(0);

    expect(markAllRead(list)).toBe(list);
    expect(markRead(list, target.id)).toBe(list);
    expect(markApprovalRead(list, "a1")).toBe(list);
  });
});

describe("dismissNotification", () => {
  it("drops just that one", () => {
    let list: AppNotification[] = [];
    list = push(list, { kind: "info", title: "a" });
    list = push(list, { kind: "info", title: "b" });
    const out = dismissNotification(list, list[0].id);
    expect(out.map(n => n.title)).toEqual(["a"]);
  });
});

// Reopening the app pours the whole history into the store; announcing it turned into a wall of
// "tarea terminada" toasts for tasks that had finished days before.
describe("freshMessages", () => {
  const start = 1_000;
  const msg = (id: string, ts: number) => ({ id, ts });

  it("ignores what was restored from disk", () => {
    const messages = [msg("old-1", 10), msg("old-2", 20)];
    expect(freshMessages(messages, null, start)).toEqual([]);
  });

  it("announces what happened after the window came up", () => {
    const messages = [msg("old", 10), msg("live", start + 5)];
    expect(freshMessages(messages, null, start).map(m => m.id)).toEqual(["live"]);
  });

  it("does not repeat what the cursor already covered", () => {
    const messages = [msg("a", start + 1), msg("b", start + 2), msg("c", start + 3)];
    expect(freshMessages(messages, "b", start).map(m => m.id)).toEqual(["c"]);
  });

  it("stays quiet when history lands after the cursor was set", () => {
    // Another project's feed is read later and its messages sort in before the last seen one.
    const messages = [msg("old-of-other-project", 5), msg("a", start + 1), msg("b", start + 2)];
    expect(freshMessages(messages, "b", start)).toEqual([]);
  });
});
