// Configuración > Acerca de shows this text, and it opens by itself the first time a new version
// runs. CHANGELOG.md is two audiences in one file: the release entries are for whoever uses the
// app, and the note under the title ("the other languages are in docs/changelog/", "the release
// check will not let one of them fall behind") is for whoever keeps the repo. That note used to be
// a plain paragraph, so it was the first thing an English reader saw in the dialog and meant
// nothing to them. It is an HTML comment now and changelogFor() drops it, which is what is pinned
// down here: what reaches the reader starts at the first version and carries no repo talk.
import { describe, it, expect } from "vitest";
import { changelogFor } from "@/lib/changelog";

describe("changelogFor('en')", () => {
  const text = changelogFor("en");
  // Everything before the first version heading: the dialog's opening words, which should be none.
  const intro = text.slice(0, text.indexOf("## 0."));

  it("starts at the first version heading", () => {
    expect(text.startsWith("## 0.")).toBe(true);
    expect(intro).toBe("");
  });

  it("does not open with text aimed at the repo", () => {
    // "release check" is only checked here, not over the whole file: 0.13.0 tells the reader about
    // it on purpose, and that is a release note, not a preamble.
    expect(intro).not.toContain("release check");
    // This one never belongs anywhere in the dialog, so it is checked over everything.
    expect(text).not.toContain("docs/changelog/");
  });

  it("does not carry the maintainer comment either", () => {
    expect(text).not.toContain("<!--");
  });
});
