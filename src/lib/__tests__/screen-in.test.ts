import { describe, it, expect } from "vitest";
import { shouldAnimateScreen } from "@/lib/screen-in";

describe("shouldAnimateScreen", () => {
  it("animates by default: a config that never heard of the setting is a config that wants the app as it ships", () => {
    expect(shouldAnimateScreen(undefined, false)).toBe(true);
  });

  it("does not animate once the setting is turned off", () => {
    expect(shouldAnimateScreen(false, false)).toBe(false);
  });

  it("does not animate when the system asked for less motion, whatever the setting says", () => {
    expect(shouldAnimateScreen(true, true)).toBe(false);
    expect(shouldAnimateScreen(undefined, true)).toBe(false);
    expect(shouldAnimateScreen(false, true)).toBe(false);
  });

  it("animates only when both agree", () => {
    expect(shouldAnimateScreen(true, false)).toBe(true);
  });
});
