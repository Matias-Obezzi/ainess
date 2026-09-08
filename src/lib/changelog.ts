// The changelog the app shows, in the reader's language.
//
// English is the repo's own CHANGELOG.md, which is also what the GitHub release points at. The
// other languages live in docs/changelog/<lang>.md and are checked at release time (see
// scripts/release-check.mjs), so a language cannot quietly fall a version behind.
import en from "../../CHANGELOG.md?raw";
import type { Language } from "@/i18n";

const translated = import.meta.glob("../../docs/changelog/*.md", {
  eager: true,
  query: "?raw",
  import: "default",
}) as Record<string, string>;

/** The file, minus its own heading: the dialog already has a title. */
function body(text: string): string {
  return text.replace(/^#[^\n]*\n/, "").trim();
}

export function changelogFor(language: Language): string {
  const path = Object.keys(translated).find(p => p.endsWith(`/${language}.md`));
  // English has no file of its own here, and neither does a language nobody has translated yet.
  return body(path ? translated[path] : en);
}
