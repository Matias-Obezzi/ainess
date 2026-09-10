import { describe, it, expect } from "vitest";
import { LANGUAGES } from "@/i18n";
import { interruptedStrings } from "@/i18n/interrupted";
import { es } from "@/i18n/es";
import { en } from "@/i18n/en";
import { pt } from "@/i18n/pt";
import { zh } from "@/i18n/zh";
import { ja } from "@/i18n/ja";
import { fr } from "@/i18n/fr";
import { de } from "@/i18n/de";

const dictionaries = { es, en, pt, zh, ja, fr, de };

describe("interruptedStrings", () => {
  it("matches system.interrupted in every dictionary, exactly", () => {
    for (const lang of LANGUAGES) {
      expect(interruptedStrings[lang]).toBe(dictionaries[lang]["system.interrupted"]);
    }
  });
});
