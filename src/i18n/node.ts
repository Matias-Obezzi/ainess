import { type Language, type Dictionary, LANGUAGES, dictionaries, baseDictionary, pickLanguage, localeOf, translate } from "./index";
import { en } from "./en";
import { pt } from "./pt";
import { zh } from "./zh";
import { ja } from "./ja";
import { fr } from "./fr";
import { de } from "./de";

// The CLI bundles separately (`npm run build:cli`), where the lazy-loading registry in `index.ts`
// buys nothing — there is no browser chunk to shrink, and `nodeI18n` has to stay synchronous. So
// this is the one place that imports all six non-Spanish dictionaries eagerly and registers them.
const nodeDictionaries: Partial<Record<Language, Dictionary>> = { en, pt, zh, ja, fr, de };
for (const [lang, dict] of Object.entries(nodeDictionaries)) {
  dictionaries[lang as Language] = dict;
}

/** The language a CLI process runs in: what the user configured, else what the environment says. */
export function nodeLanguage(configured: Language | null | undefined, env: NodeJS.ProcessEnv): Language {
  // A config written by a newer build (or edited by hand) can name a language this build does not
  // ship; that is not a reason to crash, so it falls through to the environment.
  if (configured && (LANGUAGES as readonly string[]).includes(configured)) {
    return configured;
  }
  const candidates: string[] = [];
  const vars = ["LC_ALL", "LC_MESSAGES", "LANG", "LANGUAGE"];
  for (const v of vars) {
    const val = env[v];
    if (val) {
      if (val === "C" || val === "POSIX") continue;
      const normalized = val.split(".")[0].split("@")[0].replace(/_/g, "-");
      candidates.push(normalized);
    }
  }
  return pickLanguage(candidates);
}

/** `t` and locale for a CLI process, resolved once. */
export function nodeI18n(configured: Language | null | undefined, env: NodeJS.ProcessEnv): {
  lang: Language;
  locale: string;
  t: (key: string, vars?: Record<string, string | number>) => string;
} {
  const lang = nodeLanguage(configured, env);
  const locale = localeOf(lang);
  const dict = dictionaries[lang] ?? baseDictionary;
  const t = (key: string, vars?: Record<string, string | number>) => {
    return translate(dict, baseDictionary, key, vars);
  };

  return { lang, locale, t };
}

