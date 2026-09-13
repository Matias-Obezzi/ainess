// A theme is new values for the variables the components already read. These are the rules for
// starting one from a preset, changing it by hand, and moving it in and out as CSS.
import { describe, it, expect } from "vitest";
import {
  CUSTOM_PRESET, DEFAULT_PRESET, DEFAULT_THEME, THEME_PRESETS, THEME_VARS,
  applyTheme, parseThemeCss, themeFromPreset, themeToCss, withVar,
} from "@/lib/themes";

describe("presets", () => {
  it("each set every variable a theme may set, and nothing else", () => {
    for (const preset of THEME_PRESETS) {
      expect(Object.keys(preset.vars).sort(), preset.id).toEqual([...THEME_VARS].sort());
      expect(preset.label || preset.labelKey, preset.id).toBeTruthy();
    }
  });

  it("start a theme as a copy, so edits do not change the preset", () => {
    const theme = themeFromPreset("nord");
    expect(theme.preset).toBe("nord");
    const edited = withVar(theme, "primary", "#ffffff");
    expect(edited.preset).toBe(CUSTOM_PRESET);
    expect(edited.vars.primary).toBe("#ffffff");
    expect(themeFromPreset("nord").vars.primary).not.toBe("#ffffff");
  });

  it("fall back to the default for an id nobody knows", () => {
    expect(themeFromPreset("no-such")).toEqual(DEFAULT_THEME);
    expect(DEFAULT_THEME.preset).toBe(DEFAULT_PRESET);
  });
});

describe("withVar", () => {
  it("drops a variable emptied by hand instead of keeping a blank", () => {
    const theme = withVar(themeFromPreset("nord"), "ring", "   ");
    expect("ring" in theme.vars).toBe(false);
  });
});

describe("CSS in and out", () => {
  it("writes only what is set, in the settings' order", () => {
    expect(themeToCss({ primary: "#111111", background: "#222222", unknown: "x" })).toBe(
      ":root {\n  --background: #222222;\n  --primary: #111111;\n}",
    );
  });

  it("reads the known variables out of any stylesheet and ignores the rest", () => {
    const css = ".dark {\n  --background: oklch(0.145 0 0);\n  --titlebar-h: 2.5rem;\n  --primary:#abc;\n}\nbody { color: red }";
    expect(parseThemeCss(css)).toEqual({ background: "oklch(0.145 0 0)", primary: "#abc" });
  });

  it("round-trips a preset", () => {
    const nord = themeFromPreset("nord").vars;
    expect(parseThemeCss(themeToCss(nord))).toEqual(nord);
  });
});

describe("applyTheme", () => {
  /** A stand-in for <html>.style: what was set, what was removed. */
  const fakeRoot = () => {
    const set = new Map<string, string>();
    const style = {
      setProperty: (name: string, value: string) => { set.set(name, value); },
      removeProperty: (name: string) => { set.delete(name); return ""; },
    } as unknown as CSSStyleDeclaration;
    return { style, set };
  };

  it("sets the theme's variables on the root and clears the ones it does not set", () => {
    const root = fakeRoot();
    applyTheme(themeFromPreset("dracula"), root);
    expect(root.set.get("--background")).toBe("#282a36");
    applyTheme({ preset: CUSTOM_PRESET, vars: { primary: "#123456" } }, root);
    expect(root.set.get("--primary")).toBe("#123456");
    expect(root.set.has("--background")).toBe(false);
  });

  it("clears everything for no theme at all", () => {
    const root = fakeRoot();
    applyTheme(themeFromPreset("nord"), root);
    applyTheme(undefined, root);
    expect(root.set.size).toBe(0);
  });

  it("ignores a variable that is not a theme's to set", () => {
    const root = fakeRoot();
    applyTheme({ preset: CUSTOM_PRESET, vars: { "titlebar-h": "0" } as never }, root);
    expect(root.set.size).toBe(0);
  });
});
