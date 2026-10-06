// The words the `ui/` components say on their own — a close button's name, "Copied", the steppers
// of a number field, what a screen reader hears for a spinner — in the app's language. The
// components read them through `useLabels` (src/lib/labels.tsx); this puts the right pack above
// all of them, the same way the dictionaries are loaded: Spanish from the start, the rest on demand.
import { useEffect, useState, type ReactNode } from "react";
import { LabelsProvider, type LabelsPack } from "@/lib/labels";
import { es } from "@/lib/labels-es";
import { languageLocales, type Language } from "@/i18n";
import { useLanguage } from "@/i18n/useT";

const packs: Partial<Record<Language, LabelsPack>> = { es };

const loaders: Record<Exclude<Language, "es">, () => Promise<LabelsPack>> = {
  en: () => import("@/lib/labels-en").then(m => m.en),
  pt: () => import("@/lib/labels-pt").then(m => m.pt),
  fr: () => import("@/lib/labels-fr").then(m => m.fr),
  de: () => import("@/lib/labels-de").then(m => m.de),
  zh: () => import("@/lib/labels-zh").then(m => m.zh),
  ja: () => import("@/lib/labels-ja").then(m => m.ja),
};

export function ComponentLabels({ children }: { children: ReactNode }) {
  const lang = useLanguage();
  const [, loaded] = useState(0);
  useEffect(() => {
    if (packs[lang] || lang === "es") return;
    let alive = true;
    void loaders[lang]().then(pack => {
      packs[lang] = pack;
      if (alive) loaded(n => n + 1);
    });
    return () => {
      alive = false;
    };
  }, [lang]);
  // Until a pack arrives the components speak their own English, which is what they would say anyway.
  return (
    <LabelsProvider labels={packs[lang]} locale={languageLocales[lang]}>
      {children}
    </LabelsProvider>
  );
}
