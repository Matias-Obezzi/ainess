// Hooks that fire on the machine's conditions. The arithmetic is what can go wrong: a time of day
// that fires twice, or one that fires at six in the evening because it was set for the morning.
import { describe, it, expect } from "vitest";
import { dueSchedules, readyHooks, CATCH_UP_MS, COOLDOWN_MS } from "@/lib/system-hooks";
import type { Hook } from "@/types";

const hook = (over: Partial<Hook>): Hook => ({
  id: "h1",
  name: "un hook",
  event: "schedule",
  enabled: true,
  action: { type: "notify", title: "hola", template: "algo" },
  ...over,
});

const at = (h: number, m: number) => new Date(2026, 8, 8, h, m, 0, 0);

describe("a time of day", () => {
  const morning = hook({ schedule: { at: "09:00" } });

  it("fires when the time comes, and not before", () => {
    expect(dueSchedules([morning], at(8, 59), {})).toEqual([]);
    expect(dueSchedules([morning], at(9, 0), {})).toEqual([morning]);
  });

  it("does not fire again the same day", () => {
    const fired = { h1: at(9, 0).getTime() };
    expect(dueSchedules([morning], at(9, 5), fired)).toEqual([]);
  });

  it("does not catch up hours later", () => {
    // Opening the app in the evening must not run everything set for the morning.
    expect(dueSchedules([morning], at(18, 0), {})).toEqual([]);
    // Within the catch-up window it still counts: the machine may have been asleep.
    expect(dueSchedules([morning], new Date(at(9, 0).getTime() + CATCH_UP_MS - 1000), {})).toEqual([morning]);
  });

  it("ignores a time that is not one", () => {
    expect(dueSchedules([hook({ schedule: { at: "25:00" } })], at(12, 0), {})).toEqual([]);
    expect(dueSchedules([hook({ schedule: { at: "mañana" } })], at(12, 0), {})).toEqual([]);
  });
});

describe("every so many minutes", () => {
  const every30 = hook({ schedule: { everyMinutes: 30 } });

  it("waits for the interval, counted from the last time", () => {
    // Never seen before: the runner records it and it fires an interval from now, not straight away.
    expect(dueSchedules([every30], at(9, 0), {})).toEqual([]);
    const seeded = { h1: at(9, 0).getTime() };
    expect(dueSchedules([every30], at(9, 29), seeded)).toEqual([]);
    expect(dueSchedules([every30], at(9, 30), seeded)).toEqual([every30]);
  });

  it("ignores a schedule that says nothing", () => {
    expect(dueSchedules([hook({ schedule: {} })], at(9, 0), { h1: 0 })).toEqual([]);
    expect(dueSchedules([hook({ schedule: { everyMinutes: 0 } })], at(9, 0), { h1: 0 })).toEqual([]);
  });

  it("leaves a disabled one alone", () => {
    const off = hook({ enabled: false, schedule: { everyMinutes: 1 } });
    expect(dueSchedules([off], at(9, 0), { h1: 0 })).toEqual([]);
  });
});

describe("the cooldown", () => {
  const onChange = hook({ id: "h2", event: "file.changed" });

  it("lets the first one through and holds the next", () => {
    const now = at(9, 0).getTime();
    expect(readyHooks([onChange], "file.changed", now, {})).toEqual([onChange]);
    expect(readyHooks([onChange], "file.changed", now, { h2: now })).toEqual([]);
    expect(readyHooks([onChange], "file.changed", now + COOLDOWN_MS, { h2: now })).toEqual([onChange]);
  });

  it("only answers for its own event", () => {
    expect(readyHooks([onChange], "internet.lost", at(9, 0).getTime(), {})).toEqual([]);
  });
});
