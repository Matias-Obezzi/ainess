// React side of the i18n layer: the components read the language from the store, so changing
// it in Settings repaints everything at once.
import { useMemo } from "react";
import { useAppStore } from "@/store";
import {
  baseDictionary,
  dictionaries,
  localeOf,
  resolveLanguage,
  translate,
  type Language,
} from "@/i18n";

export type TFunction = (key: string, vars?: Record<string, string | number>) => string;

/** The language in use right now, following the system when the user picked nothing. */
export function useLanguage(): Language {
  const configured = useAppStore(state => state.config.language);
  return resolveLanguage(configured);
}

/** BCP 47 locale of the language in use, for `Intl`. */
export function useLocale(): string {
  return localeOf(useLanguage());
}

/** `t("some.key", { name })`. */
export function useT(): TFunction {
  const lang = useLanguage();
  return useMemo(() => {
    const dict = dictionaries[lang] ?? baseDictionary;
    return (key: string, vars?: Record<string, string | number>) =>
      translate(dict, baseDictionary, key, vars);
  }, [lang]);
}

/** Same as `useLocale`, for code outside React (formatters shared with the CLI). */
export function activeLocale(): string {
  return localeOf(resolveLanguage(useAppStore.getState().config.language));
}

/** For code outside React (store actions, notifications) that still needs a translated string. */
export function translateNow(key: string, vars?: Record<string, string | number>): string {
  const lang = resolveLanguage(useAppStore.getState().config.language);
  return translate(dictionaries[lang] ?? baseDictionary, baseDictionary, key, vars);
}
