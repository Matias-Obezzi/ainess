// Every `ui/` component that reads its words through `useLabels` has them in every language the
// app speaks. The German and Japanese packs are ainess's own and cover only what is installed, so
// a component added from the registry fails here until its words are written for them too.
import { describe, it, expect } from "vitest";
import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import { en } from "@/lib/labels-en";
import { es } from "@/lib/labels-es";
import { pt } from "@/lib/labels-pt";
import { fr } from "@/lib/labels-fr";
import { de } from "@/lib/labels-de";
import { zh } from "@/lib/labels-zh";
import { ja } from "@/lib/labels-ja";

const UI = join(__dirname, "..", "..", "components", "ui");
const installed = readdirSync(UI)
  .flatMap(file => [...readFileSync(join(UI, file), "utf8").matchAll(/useLabels\(\s*'([\w-]+)'/g)].map(m => m[1]));
const packs = { en, es, pt, fr, de, zh, ja } as Record<string, Record<string, object | undefined>>;

describe("the components' own words", () => {
  it("finds the components that have them", () => {
    expect(installed).toContain("dialog");
    expect(installed).toContain("password-field");
  });

  for (const [lang, pack] of Object.entries(packs)) {
    it(`are all there in ${lang}`, () => {
      for (const component of installed) {
        expect(pack[component], `${lang} has no entry for ${component}`).toBeDefined();
        expect(Object.keys(pack[component]!).sort(), `${lang} ${component}`).toEqual(Object.keys(en[component as keyof typeof en]).sort());
      }
    });
  }
});
