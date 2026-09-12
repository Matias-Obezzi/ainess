// The app ships in seven languages. A sentence written into the source is a sentence six of those
// readers get in a language they did not pick, and nothing notices — which is how the app came to
// have a hundred of them, one line at a time.
//
// This is the thing that notices. The rule and the scan live in
// `scripts/check-hardcoded-strings.mjs` so they can also be run on their own; this puts them in the
// suite, where they run before anyone can forget.
import { describe, it, expect } from "vitest";
// @ts-expect-error -- a plain .mjs script, deliberately not part of the typed source.
import { hardcodedSpanish } from "../../../scripts/check-hardcoded-strings.mjs";

describe("user-facing text", () => {
  it("lives in the dictionaries, not in the source", () => {
    const found = hardcodedSpanish() as Array<{ at: string; text: string }>;
    // Named rather than counted: a failure should say which line, not just that there is one more.
    expect(found.map(f => `${f.at}  ${f.text}`)).toEqual([]);
  });
});
