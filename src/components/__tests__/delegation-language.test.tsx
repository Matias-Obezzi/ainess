// A delegation says what it is doing in the reader's language, in all seven of them.
//
// The two lines it can draw — "delegating to X" while the block is being written, and the brief a
// task shows when it is shut — are new, and a new string is exactly the kind that ships in one
// language and quietly falls back everywhere else.
//
// Rendered in the DOM and not to a string: `<Markdown>` reads the language out of the store, and
// a server render hands every component the store's *initial* state, so a test that renders to a
// string sees one language no matter what it sets.
import { describe, it, expect, beforeAll, afterEach } from "vitest";
import { render, cleanup } from "@testing-library/react";
import { Markdown } from "@/components/shell/Markdown";
import { LANGUAGES, dictionaries, loadLanguage, type Language } from "@/i18n";
import { useAppStore } from "@/store";

const HALF_WRITTEN = '```delegate\n{"tasks":[{"agent":"Obrero","task":"arregl';
const FINISHED = '```delegate\n{"tasks":[{"agent":"Obrero","task":"arreglar el login"}]}\n```';

const before = useAppStore.getState().config.language;
afterEach(() => {
  cleanup();
  useAppStore.setState(state => ({ config: { ...state.config, language: before } }));
});

beforeAll(async () => {
  await Promise.all(LANGUAGES.map(loadLanguage));
});

/** What the app draws for `text` with the app set to `lang`. */
function inLanguage(lang: Language, text: string, streaming = false): string {
  useAppStore.setState(state => ({ config: { ...state.config, language: lang } }));
  return render(<Markdown text={text} streaming={streaming} />).container.textContent ?? "";
}

const writingIn = (lang: Language) => dictionaries[lang]!["delegation.writing"].replace("{names}", "Obrero");
const briefIn = (lang: Language) => dictionaries[lang]!["delegation.brief"].replace("{name}", "Obrero");

describe("a delegation in every language", () => {
  it.each(LANGUAGES)("says who it is delegating to, in %s", (lang) => {
    expect(inLanguage(lang, HALF_WRITTEN, true)).toContain(writingIn(lang));
  });

  it.each(LANGUAGES)("briefs a shut task in %s", (lang) => {
    expect(inLanguage(lang, FINISHED)).toContain(briefIn(lang));
  });

  it("does not fall back to Spanish for the six that are not Spanish", () => {
    for (const lang of LANGUAGES.filter(l => l !== "es")) {
      // Portuguese opens with the same word as Spanish, so what must not appear is the whole
      // Spanish sentence, not a word of it.
      expect(inLanguage(lang, HALF_WRITTEN, true)).not.toContain(writingIn("es"));
      expect(inLanguage(lang, FINISHED)).not.toContain(briefIn("es"));
    }
  });

  it("gives every language its own wording, not one copied seven times", () => {
    expect(new Set(LANGUAGES.map(writingIn)).size).toBe(LANGUAGES.length);
    expect(new Set(LANGUAGES.map(briefIn)).size).toBe(LANGUAGES.length);
  });
});
