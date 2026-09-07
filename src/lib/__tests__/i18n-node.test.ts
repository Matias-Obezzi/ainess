import { describe, test, expect } from "vitest";
import { nodeLanguage, nodeI18n } from "@/i18n/node";
import type { Language } from "@/i18n";

describe("nodeLanguage", () => {
  test("explicit config wins over env", () => {
    expect(nodeLanguage("en", { LC_ALL: "es_AR.UTF-8" })).toBe("en");
  });

  test("LC_ALL wins over LANG", () => {
    expect(nodeLanguage(null, { LC_ALL: "pt_BR.UTF-8", LANG: "ja_JP.UTF-8" })).toBe("pt");
  });

  test("es_AR.UTF-8 -> es", () => {
    expect(nodeLanguage(null, { LANG: "es_AR.UTF-8" })).toBe("es");
  });

  test("en-US -> en", () => {
    expect(nodeLanguage(null, { LANG: "en-US" })).toBe("en");
  });

  test("ja_JP.UTF-8 -> ja", () => {
    expect(nodeLanguage(null, { LANG: "ja_JP.UTF-8" })).toBe("ja");
  });

  test("C and POSIX -> es", () => {
    expect(nodeLanguage(null, { LANG: "C" })).toBe("es");
    expect(nodeLanguage(null, { LANG: "POSIX" })).toBe("es");
  });

  test("empty env -> es", () => {
    expect(nodeLanguage(null, {})).toBe("es");
  });

  test("a configured language this build does not ship falls through to the env", () => {
    expect(nodeLanguage("ru" as Language, { LANG: "ja_JP.UTF-8" })).toBe("ja");
    expect(nodeLanguage("ru" as Language, {})).toBe("es");
  });

  test("language the app doesn't have -> es", () => {
    expect(nodeLanguage(null, { LANG: "ru_RU" })).toBe("es");
  });
});

describe("nodeI18n", () => {
  test("t translates to english and locale is en", () => {
    const { lang, locale, t } = nodeI18n("en", {});
    expect(lang).toBe("en");
    expect(locale).toBe("en");
    expect(t("common.cancel")).toBe("Cancel");
  });
});
