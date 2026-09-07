import { type Language, dictionaries, baseDictionary, pickLanguage, localeOf, translate } from "./index";

/** The language a CLI process runs in: what the user configured, else what the environment says. */
export function nodeLanguage(configured: Language | null | undefined, env: NodeJS.ProcessEnv): Language {
  if (configured) {
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

