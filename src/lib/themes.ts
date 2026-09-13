// Themes: the colours every component reads, as CSS variables you can override.
//
// The components never name a colour. They read `--background`, `--primary` and the rest from
// `src/index.css`, and Tailwind's tokens are aliases of those (`@theme inline`). So a theme is
// nothing more than new values for the same variables, set on <html> where an inline style wins
// over the stylesheet's `:root` and `.dark`. Nothing else has to know a theme exists.
import type { ThemeConfig } from "@/types";

/** The variables a theme may set, in the order the settings show them. */
export const THEME_VARS = [
  "background",
  "foreground",
  "card",
  "card-foreground",
  "popover",
  "popover-foreground",
  "primary",
  "primary-foreground",
  "secondary",
  "secondary-foreground",
  "muted",
  "muted-foreground",
  "accent",
  "accent-foreground",
  "destructive",
  "border",
  "input",
  "ring",
] as const;

export type ThemeVar = (typeof THEME_VARS)[number];
export type ThemeVars = Partial<Record<ThemeVar, string>>;

/** `preset` of a theme that is the app's own colours, untouched. */
export const DEFAULT_PRESET = "default";
/** `preset` of a theme somebody edited by hand. */
export const CUSTOM_PRESET = "custom";

export interface ThemePreset {
  id: string;
  /** A proper noun (Nord, Dracula), the same in every language — or a key when it is a word. */
  label?: string;
  labelKey?: string;
  vars: Record<ThemeVar, string>;
}

const palette = (
  bg: string, fg: string, surface: string, primary: string, primaryFg: string, raised: string,
  mutedFg: string, accent: string, destructive: string, ring: string,
): Record<ThemeVar, string> => ({
  background: bg,
  foreground: fg,
  card: surface,
  "card-foreground": fg,
  popover: surface,
  "popover-foreground": fg,
  primary,
  "primary-foreground": primaryFg,
  secondary: raised,
  "secondary-foreground": fg,
  muted: raised,
  "muted-foreground": mutedFg,
  accent,
  "accent-foreground": fg,
  destructive,
  border: accent,
  input: accent,
  ring,
});

/** A few well-known palettes, dark like the app, and the app's own light one. */
export const THEME_PRESETS: ThemePreset[] = [
  {
    id: "light",
    labelKey: "appearance.presetLight",
    vars: {
      background: "oklch(1 0 0)",
      foreground: "oklch(0.145 0 0)",
      card: "oklch(1 0 0)",
      "card-foreground": "oklch(0.145 0 0)",
      popover: "oklch(1 0 0)",
      "popover-foreground": "oklch(0.145 0 0)",
      primary: "oklch(0.205 0 0)",
      "primary-foreground": "oklch(0.985 0 0)",
      secondary: "oklch(0.97 0 0)",
      "secondary-foreground": "oklch(0.205 0 0)",
      muted: "oklch(0.97 0 0)",
      "muted-foreground": "oklch(0.556 0 0)",
      accent: "oklch(0.97 0 0)",
      "accent-foreground": "oklch(0.205 0 0)",
      destructive: "oklch(0.577 0.245 27.325)",
      border: "oklch(0.922 0 0)",
      input: "oklch(0.922 0 0)",
      ring: "oklch(0.708 0 0)",
    },
  },
  { id: "nord", label: "Nord", vars: palette("#2e3440", "#eceff4", "#3b4252", "#88c0d0", "#2e3440", "#434c5e", "#d8dee9", "#4c566a", "#bf616a", "#81a1c1") },
  { id: "dracula", label: "Dracula", vars: palette("#282a36", "#f8f8f2", "#343746", "#bd93f9", "#282a36", "#44475a", "#b0b3c6", "#4d5066", "#ff5555", "#bd93f9") },
  { id: "catppuccin-mocha", label: "Catppuccin Mocha", vars: palette("#1e1e2e", "#cdd6f4", "#24243a", "#cba6f7", "#1e1e2e", "#313244", "#a6adc8", "#45475a", "#f38ba8", "#cba6f7") },
  { id: "gruvbox", label: "Gruvbox", vars: palette("#282828", "#ebdbb2", "#32302f", "#fabd2f", "#282828", "#3c3836", "#bdae93", "#504945", "#fb4934", "#d79921") },
  { id: "solarized", label: "Solarized", vars: palette("#002b36", "#eee8d5", "#073642", "#268bd2", "#fdf6e3", "#0b3d49", "#93a1a1", "#0d4a5a", "#dc322f", "#2aa198") },
];

export function presetById(id: string): ThemePreset | undefined {
  return THEME_PRESETS.find(p => p.id === id);
}

/** The theme with nothing changed: the app's own colours. */
export const DEFAULT_THEME: ThemeConfig = { preset: DEFAULT_PRESET, vars: {} };

/** A preset, ready to be saved: its id and a copy of its colours, so edits start from them. */
export function themeFromPreset(id: string): ThemeConfig {
  const preset = presetById(id);
  return preset ? { preset: id, vars: { ...preset.vars } } : DEFAULT_THEME;
}

/** One variable changed by hand: the theme is custom from then on, whatever it started from. */
export function withVar(theme: ThemeConfig, name: ThemeVar, value: string): ThemeConfig {
  const vars = { ...theme.vars } as Record<string, string>;
  if (value.trim()) vars[name] = value.trim();
  else delete vars[name];
  return { preset: CUSTOM_PRESET, vars };
}

/**
 * Puts the theme on the root element, where an inline custom property beats the stylesheet.
 * Every variable a theme may set is cleared first, so switching themes leaves nothing behind.
 */
export function applyTheme(theme: ThemeConfig | undefined, root: { style: CSSStyleDeclaration } = document.documentElement): void {
  for (const name of THEME_VARS) root.style.removeProperty(`--${name}`);
  for (const [name, value] of Object.entries(theme?.vars ?? {})) {
    if ((THEME_VARS as readonly string[]).includes(name) && value) root.style.setProperty(`--${name}`, value);
  }
}

/** The theme as a stylesheet rule, for copying out and sharing. */
export function themeToCss(vars: Record<string, string>): string {
  const lines = THEME_VARS.filter(name => vars[name]).map(name => `  --${name}: ${vars[name]};`);
  return `:root {\n${lines.join("\n")}\n}`;
}

/**
 * The variables a pasted stylesheet sets, of the ones a theme may: `--primary: #88c0d0;` lines,
 * wherever they sit. Anything else in the text is ignored, so a whole `index.css` pastes fine.
 */
export function parseThemeCss(text: string): ThemeVars {
  const out: Record<string, string> = {};
  const re = /--([a-z][a-z-]*)\s*:\s*([^;{}\n]+)/g;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text))) {
    const name = m[1];
    if ((THEME_VARS as readonly string[]).includes(name)) out[name] = m[2].trim();
  }
  return out;
}
