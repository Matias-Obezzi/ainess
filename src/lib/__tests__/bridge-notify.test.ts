import { describe, it, expect } from "vitest";
import { notificationText, shortId } from "@/lib/bridge/notify";
import type { AppNotification } from "@/types";

const base: AppNotification = {
  id: "n1",
  kind: "task-done",
  title: "Claude terminó",
  ts: 1,
  read: false,
};

describe("notificationText", () => {
  it("says which project it came from when it knows", () => {
    expect(notificationText(base, "ainess")).toBe("[ainess] Claude terminó");
    expect(notificationText(base)).toBe("Claude terminó");
  });

  it("carries the detail on its own line, flattened and trimmed", () => {
    const text = notificationText({ ...base, body: "  dos líneas\n  en una  " }, "ainess");
    expect(text).toBe("[ainess] Claude terminó\ndos líneas en una");
  });

  it("cuts a long detail instead of sending a wall", () => {
    const body = "x".repeat(400);
    const lines = notificationText({ ...base, body }).split("\n");
    expect(lines[1].length).toBeLessThanOrEqual(201);
  });

  it("tells you what to write back when something is waiting on you", () => {
    const approval = notificationText({
      ...base,
      kind: "approval",
      title: "Claude pide tu permiso",
      approvalId: "3f2a1b0c-1111-4222-8333-444455556666",
    });
    expect(approval).toContain("/approve 3f2a1b0c");

    const question = notificationText({ ...base, kind: "question", title: "Claude pregunta algo" });
    expect(question).toContain("/answer");
  });

  it("adds no instructions to news that needs no answer", () => {
    expect(notificationText(base)).toBe("Claude terminó");
    expect(notificationText({ ...base, kind: "task-failed", title: "algo falló" })).toBe("algo falló");
  });
});

describe("shortId", () => {
  it("is the same short form the replies use", () => {
    expect(shortId("3f2a1b0c-1111-4222-8333-444455556666")).toBe("3f2a1b0c");
  });
});
