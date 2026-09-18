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

/**
 * The file, minus its own heading (the dialog already has a title) and minus the HTML comment
 * under it. That comment is a note to whoever keeps the file: it talks about the repo, not to the
 * reader, so it never belongs in the dialog. The renderer drops it too, but dropping it here also
 * keeps it out of anything else that reads this string.
 */
function body(text: string): string {
  return text
    .replace(/^#[^\n]*\n/, "")
    .replace(/^\s*<!--[\s\S]*?-->/, "")
    .trim();
}

export function changelogFor(language: Language): string {
  const path = Object.keys(translated).find(p => p.endsWith(`/${language}.md`));
  // English has no file of its own here, and neither does a language nobody has translated yet.
  return body(path ? translated[path] : en);
}
