// The message a hook starts with, one per event and one per language.
//
// What this pins: for years there was a single preset, hardcoded in Spanish and written for
// `run.finished`. A hook on `internet.lost` opened claiming an agent had finished. Two things can
// go wrong now instead: an event with no preset (the dialog would show the key), and a preset
// reaching for a variable that event never carries (the message ships with `{{question}}` in it).
import { describe, it, expect } from "vitest";
import { es, type Dictionary, type Language } from "@/i18n";
import { en } from "@/i18n/en";
import { pt } from "@/i18n/pt";
import { zh } from "@/i18n/zh";
import { ja } from "@/i18n/ja";
import { fr } from "@/i18n/fr";
import { de } from "@/i18n/de";
import { TEMPLATE_VARS } from "@/lib/template-vars";
import type { HookEvent } from "@/types";

const dictionaries: Record<Language, Dictionary> = { es, en, pt, zh, ja, fr, de };

/** Every event the dialog offers, in its order. Kept here by hand so adding one fails this test. */
const EVENTS: HookEvent[] = [
  "task.started", "task.finished", "task.failed", "delegation", "approval.requested",
  "run.finished", "run.failed", "agent.stopped", "result", "question.asked",
  "review.changes", "quota.exhausted",
  "app.started", "schedule", "internet.lost", "internet.back", "file.changed",
];

/** `{{name}}` and `{{name|300}}` alike. */
const varsOf = (text: string) => [...text.matchAll(/\{\{(\w+)(?:\|\d+)?\}\}/g)].map(m => m[1]);

describe("hook message presets", () => {
  it("gives every event its own, in every language", () => {
    for (const [lang, dict] of Object.entries(dictionaries)) {
      const missing = EVENTS.filter(e => !dict[`hookPreset.${e}`]);
      expect({ lang, missing }).toEqual({ lang, missing: [] });
    }
  });

  it("only reaches for variables the hook actually carries", () => {
    const known = new Set(TEMPLATE_VARS);
    for (const [lang, dict] of Object.entries(dictionaries)) {
      for (const event of EVENTS) {
        const unknown = varsOf(dict[`hookPreset.${event}`]).filter(v => !known.has(v));
        expect({ lang, event, unknown }).toEqual({ lang, event, unknown: [] });
      }
    }
  });

  it("reaches for the same ones in every language", () => {
    for (const event of EVENTS) {
      const spanish = varsOf(es[`hookPreset.${event}`]).sort();
      for (const [lang, dict] of Object.entries(dictionaries)) {
        expect({ lang, event, vars: varsOf(dict[`hookPreset.${event}`]).sort() })
          .toEqual({ lang, event, vars: spanish });
      }
    }
  });

  it("has a sample value for every variable the test button fills in", () => {
    // The button's whole job is showing the message you will really get; a variable with no sample
    // renders empty and the preview lies about what will arrive.
    for (const key of ["project", "agent", "prompt", "output", "error", "taskPrompt", "toAgent", "task", "question", "summary"]) {
      for (const [lang, dict] of Object.entries(dictionaries)) {
        expect({ lang, key, has: !!dict[`hookTest.${key}`] }).toEqual({ lang, key, has: true });
      }
    }
  });
});
