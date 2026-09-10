// A tiny i18n layer: flat dictionaries, dot-separated keys, Spanish as the base.
// No dependencies: the whole thing is a lookup plus `{name}` interpolation.
//
// Spanish loads eagerly (it is the base and the fallback); the other six load on demand via
// `loadLanguage`, so a build only ships the one dictionary a given session actually uses.
import { es } from "./es";

export type Language = "es" | "en" | "pt" | "zh" | "ja" | "fr" | "de";

/** Flat dictionary: the key is a dot-separated path. */
export type Dictionary = Record<string, string>;

/** Every language the app ships, in the order the picker shows them. */
export const LANGUAGES: readonly Language[] = ["es", "en", "pt", "zh", "ja", "fr", "de"];

/** How each language calls itself. Never translated. */
export const languageNames: Record<Language, string> = {
  es: "Español",
  en: "English",
  pt: "Português",
  zh: "中文",
  ja: "日本語",
  fr: "Français",
  de: "Deutsch",
};

/** BCP 47 locale used for dates and numbers. */
export const languageLocales: Record<Language, string> = {
  es: "es",
  en: "en",
  pt: "pt-BR",
  zh: "zh-Hans",
  ja: "ja",
  fr: "fr",
  de: "de",
};

/** Registry of loaded dictionaries. Starts with just Spanish; the rest arrive via `loadLanguage`. */
export const dictionaries: Partial<Record<Language, Dictionary>> = { es };

const loaders: Record<Exclude<Language, "es">, () => Promise<Dictionary>> = {
  en: () => import("./en").then(m => m.en),
  pt: () => import("./pt").then(m => m.pt),
  zh: () => import("./zh").then(m => m.zh),
  ja: () => import("./ja").then(m => m.ja),
  fr: () => import("./fr").then(m => m.fr),
  de: () => import("./de").then(m => m.de),
};

/** In-flight loads, so a language requested twice while its import is still in the air is only fetched once. */
const loading = new Map<Language, Promise<void>>();

/** Loads a language's dictionary into the registry. Resolves immediately if it is already there. */
export async function loadLanguage(lang: Language): Promise<void> {
  if (dictionaries[lang]) return;
  let promise = loading.get(lang);
  if (!promise) {
    promise = loaders[lang as Exclude<Language, "es">]().then(dict => {
      dictionaries[lang] = dict;
    });
    loading.set(lang, promise);
  }
  try {
    await promise;
  } finally {
    loading.delete(lang);
  }
}

/** The dictionary every language falls back to. */
export const baseDictionary: Dictionary = es;
export const baseLanguage: Language = "es";

export function localeOf(lang: Language): string {
  return languageLocales[lang];
}

const warned = new Set<string>();

function warnOnce(key: string): void {
  if (warned.has(key)) return;
  warned.add(key);
  if (typeof import.meta !== "undefined" && import.meta.env?.DEV) {
    console.warn(`[i18n] missing key: ${key}`);
  }
}

function interpolate(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (whole, name: string) => {
    const value = vars[name];
    return value === undefined ? whole : String(value);
  });
}

/** Translates `key`, interpolating `{name}` placeholders and falling back to `base`. */
export function translate(
  dict: Dictionary,
  base: Dictionary,
  key: string,
  vars?: Record<string, string | number>
): string {
  const hit = dict[key];
  if (hit !== undefined) return interpolate(hit, vars);
  const fallback = base[key];
  if (fallback !== undefined) {
    warnOnce(key);
    return interpolate(fallback, vars);
  }
  warnOnce(key);
  return key;
}

/** Picks singular or plural. Two keys, no rule engine. */
export function plural(n: number, one: string, other: string): string {
  return n === 1 ? one : other;
}

/** The language that best matches what the system asks for; Spanish when nothing does. */
export function pickLanguage(candidates: readonly string[]): Language {
  for (const raw of candidates) {
    if (typeof raw !== "string") continue;
    const tag = raw.trim().toLowerCase();
    if (!tag) continue;
    const primary = tag.split(/[-_]/)[0];
    // "zh-Hant" is still Chinese: the app only ships simplified, which is the closest match.
    if ((LANGUAGES as readonly string[]).includes(primary)) return primary as Language;
  }
  return "es";
}

/** What the browser (or the Tauri webview) says the system language is. */
export function systemLanguage(): Language {
  const nav = typeof navigator === "undefined" ? undefined : navigator;
  const candidates = nav?.languages?.length ? nav.languages : nav?.language ? [nav.language] : [];
  return pickLanguage(candidates);
}

/** The language actually in use: what the user picked, or the system's when they picked nothing. */
export function resolveLanguage(configured: Language | null | undefined): Language {
  return configured ?? systemLanguage();
}

export { es };
