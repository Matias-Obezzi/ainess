import { describe, it, expect } from "vitest";
import {
  LANGUAGES,
  dictionaries,
  es,
  languageLocales,
  languageNames,
  pickLanguage,
  plural,
  translate,
  type Dictionary,
} from "@/i18n";

const base: Dictionary = {
  "a.hello": "Hola",
  "a.greet": "Hola {name}, tenés {n} mensajes",
  "a.only": "Solo en español",
};

describe("translate", () => {
  it("uses the language's own string when it has one", () => {
    expect(translate({ "a.hello": "Hello" }, base, "a.hello")).toBe("Hello");
  });

  it("interpolates named placeholders", () => {
    expect(translate({ "a.greet": "Hi {name}, you have {n} messages" }, base, "a.greet", { name: "Ana", n: 3 }))
      .toBe("Hi Ana, you have 3 messages");
  });

  it("interpolates in the fallback too", () => {
    expect(translate({}, base, "a.greet", { name: "Ana", n: 1 })).toBe("Hola Ana, tenés 1 mensajes");
  });

  it("leaves unknown placeholders alone", () => {
    expect(translate({ "a.greet": "{name} / {missing}" }, base, "a.greet", { name: "Ana" }))
      .toBe("Ana / {missing}");
  });

  it("falls back to Spanish when the key is missing", () => {
    expect(translate({}, base, "a.only")).toBe("Solo en español");
  });

  it("returns the key itself when nobody has it", () => {
    expect(translate({}, base, "a.nope")).toBe("a.nope");
  });
});

describe("plural", () => {
  it("picks the singular only for one", () => {
    expect(plural(1, "1 tarea", "2 tareas")).toBe("1 tarea");
    expect(plural(0, "1 tarea", "0 tareas")).toBe("0 tareas");
    expect(plural(5, "1 tarea", "5 tareas")).toBe("5 tareas");
  });
});

describe("pickLanguage", () => {
  it("matches the region variant of a language it ships", () => {
    expect(pickLanguage(["pt-BR"])).toBe("pt");
    expect(pickLanguage(["zh-Hans-CN"])).toBe("zh");
    expect(pickLanguage(["en-US", "es-AR"])).toBe("en");
  });

  it("skips languages it does not ship and takes the next one", () => {
    expect(pickLanguage(["nl", "it", "de-AT"])).toBe("de");
  });

  it("falls back to Spanish for anything unknown", () => {
    expect(pickLanguage(["kl-GL"])).toBe("es");
    expect(pickLanguage([])).toBe("es");
    expect(pickLanguage([""])).toBe("es");
  });
});

describe("dictionaries", () => {
  it("ships one dictionary, a native name and a locale per language", () => {
    for (const lang of LANGUAGES) {
      expect(dictionaries[lang], lang).toBeTruthy();
      expect(languageNames[lang], lang).toBeTruthy();
      expect(languageLocales[lang], lang).toBeTruthy();
    }
  });

  it("gives every language exactly the same keys as Spanish", () => {
    const baseKeys = Object.keys(es).sort();
    for (const lang of LANGUAGES) {
      if (lang === "es") continue;
      const keys = Object.keys(dictionaries[lang]).sort();
      const missing = baseKeys.filter(k => !dictionaries[lang][k]);
      const extra = keys.filter(k => !(k in es));
      expect({ lang, missing }).toEqual({ lang, missing: [] });
      expect({ lang, extra }).toEqual({ lang, extra: [] });
    }
  });

  it("declares the keys in the same order in every language", () => {
    const baseOrder = Object.keys(es);
    for (const lang of LANGUAGES) {
      if (lang === "es") continue;
      const order = Object.keys(dictionaries[lang]);
      const firstDiff = baseOrder.findIndex((key, i) => order[i] !== key);
      expect({ lang, at: firstDiff, key: firstDiff === -1 ? null : order[firstDiff] })
        .toEqual({ lang, at: -1, key: null });
    }
  });

  it("keeps the same placeholders in every language", () => {
    const holders = (text: string) => (text.match(/\{\w+\}/g) ?? []).sort();
    for (const lang of LANGUAGES) {
      if (lang === "es") continue;
      for (const [key, value] of Object.entries(es)) {
        const translated = dictionaries[lang][key];
        if (!translated) continue;
        expect({ lang, key, holders: holders(translated) }).toEqual({ lang, key, holders: holders(value) });
      }
    }
  });
});
