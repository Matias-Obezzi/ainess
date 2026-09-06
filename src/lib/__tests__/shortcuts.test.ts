import { describe, it, expect } from "vitest";
import {
  SHORTCUTS,
  SHORTCUT_GROUPS,
  SHORTCUT_GROUP_KEY,
  formatShortcut,
  matchesShortcut,
  resolveGlobalShortcut,
  shortcutCombo,
  shortcutsOfGroup,
} from "@/lib/shortcuts";
import { es } from "@/i18n";

describe("the shortcut table", () => {
  it("gives every shortcut a unique id", () => {
    const ids = SHORTCUTS.map(s => s.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("never repeats a combination inside one group", () => {
    for (const group of SHORTCUT_GROUPS) {
      const combos = shortcutsOfGroup(group).map(s => shortcutCombo(s.keys));
      expect({ group, combos: new Set(combos).size }).toEqual({ group, combos: combos.length });
    }
  });

  it("never repeats a combination among the global ones", () => {
    const combos = SHORTCUTS.filter(s => s.global).map(s => shortcutCombo(s.keys));
    expect(new Set(combos).size).toBe(combos.length);
  });

  it("puts every shortcut in a group the dialog renders", () => {
    for (const shortcut of SHORTCUTS) {
      expect(SHORTCUT_GROUPS).toContain(shortcut.group);
    }
  });

  it("translates every description and group label", () => {
    for (const group of SHORTCUT_GROUPS) expect(es[SHORTCUT_GROUP_KEY[group]], group).toBeTruthy();
    for (const shortcut of SHORTCUTS) expect(es[shortcut.descriptionKey], shortcut.id).toBeTruthy();
  });

  it("spells the letter keys lowercase, so a KeyboardEvent can match them", () => {
    for (const shortcut of SHORTCUTS) {
      expect(shortcut.keys.key).toBe(shortcut.keys.key.toLowerCase());
    }
  });
});

describe("formatShortcut", () => {
  it("writes Ctrl on Windows and Linux", () => {
    expect(formatShortcut({ mod: true, key: "k" }, "other")).toEqual(["Ctrl", "K"]);
  });

  it("writes ⌘ on macOS", () => {
    expect(formatShortcut({ mod: true, key: "k" }, "mac")).toEqual(["⌘", "K"]);
  });

  it("keeps the modifiers in a fixed order", () => {
    expect(formatShortcut({ mod: true, alt: true, shift: true, key: "c" }, "other"))
      .toEqual(["Ctrl", "Alt", "Shift", "C"]);
    expect(formatShortcut({ mod: true, shift: true, key: "c" }, "mac")).toEqual(["⌘", "⇧", "C"]);
  });

  it("gives the named keys a readable label", () => {
    expect(formatShortcut({ key: "escape" }, "other")).toEqual(["Esc"]);
    expect(formatShortcut({ key: "arrowup" }, "other")).toEqual(["↑"]);
    expect(formatShortcut({ mod: true, key: "enter" }, "other")).toEqual(["Ctrl", "Enter"]);
  });

  it("leaves punctuation alone", () => {
    expect(formatShortcut({ mod: true, key: "," }, "other")).toEqual(["Ctrl", ","]);
    expect(formatShortcut({ mod: true, key: "`" }, "other")).toEqual(["Ctrl", "`"]);
  });
});

describe("matchesShortcut", () => {
  it("asks for Ctrl off macOS and for ⌘ on it", () => {
    const keys = { mod: true, key: "k" };
    expect(matchesShortcut(keys, { key: "k", ctrlKey: true }, "other")).toBe(true);
    expect(matchesShortcut(keys, { key: "k", metaKey: true }, "other")).toBe(false);
    expect(matchesShortcut(keys, { key: "k", metaKey: true }, "mac")).toBe(true);
    expect(matchesShortcut(keys, { key: "k", ctrlKey: true }, "mac")).toBe(false);
  });

  it("does not fire when a modifier the shortcut does not ask for is held", () => {
    const keys = { mod: true, key: "k" };
    expect(matchesShortcut(keys, { key: "k", ctrlKey: true, shiftKey: true }, "other")).toBe(false);
    expect(matchesShortcut(keys, { key: "k", ctrlKey: true, altKey: true }, "other")).toBe(false);
  });

  it("is case insensitive about the key itself", () => {
    expect(matchesShortcut({ mod: true, shift: true, key: "c" }, { key: "C", ctrlKey: true, shiftKey: true }, "other")).toBe(true);
  });

  it("falls back to the code for keys a layout can swallow", () => {
    const keys = { mod: true, key: "`", code: "Backquote" };
    expect(matchesShortcut(keys, { key: "Dead", code: "Backquote", ctrlKey: true }, "other")).toBe(true);
    expect(matchesShortcut(keys, { key: "Dead", code: "KeyA", ctrlKey: true }, "other")).toBe(false);
  });
});

describe("resolveGlobalShortcut", () => {
  it("finds the global shortcut a key press stands for", () => {
    expect(resolveGlobalShortcut({ key: "k", ctrlKey: true }, "other")?.id).toBe("palette");
    expect(resolveGlobalShortcut({ key: "/", ctrlKey: true }, "other")?.id).toBe("shortcuts");
    expect(resolveGlobalShortcut({ key: ",", metaKey: true }, "mac")?.id).toBe("settings");
  });

  it("ignores the ones a single component owns", () => {
    expect(resolveGlobalShortcut({ key: "escape" }, "other")).toBeUndefined();
    expect(resolveGlobalShortcut({ key: "c", ctrlKey: true, shiftKey: true }, "other")).toBeUndefined();
  });

  it("ignores a plain key press", () => {
    expect(resolveGlobalShortcut({ key: "k" }, "other")).toBeUndefined();
  });
});
