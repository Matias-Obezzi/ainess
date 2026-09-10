// `isInterruptedOutput` (src/lib/history.ts) has to recognize this mark in any language, because
// a run can be closed in one language and read back after the app restarted in another one.
// The other six dictionaries load lazily (see src/i18n/index.ts), so their strings are duplicated
// here on purpose: this is the one place that needs all seven values while only one dictionary is
// loaded. Kept in sync by src/lib/__tests__/interrupted-strings.test.ts.
import type { Language } from "./index";

export const interruptedStrings: Record<Language, string> = {
  es: "[interrumpido: la aplicación se cerró mientras el agente trabajaba]",
  en: "[interrupted: the app closed while the agent was working]",
  pt: "[interrompido: o aplicativo fechou enquanto o agente trabalhava]",
  zh: "[已中断：代理工作时应用已关闭]",
  ja: "[中断: エージェントの作業中にアプリが閉じられました]",
  fr: "[interrompu : l'application s'est fermée pendant que l'agent travaillait]",
  de: "[unterbrochen: die App wurde geschlossen, während der Agent arbeitete]",
};
