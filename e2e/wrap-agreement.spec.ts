// The layer under the textarea draws the words; the textarea keeps the caret. They only work as
// one thing while both wrap every line at the same word, at every width. This scans a sentence
// word by word across a range of widths and fails on the first prefix where the two disagree on
// how many lines it takes. Reported once as "patios" drawn at the end of one line while the caret
// sat at the start of the next; not reproduced in Chrome at 1x, 1.25x or 1.5x.
import { test } from "@playwright/test";
import { scan } from "./wrap-scan";

test("the textarea and the layer wrap every line at the same word", async ({ page }) => {
  await scan(page, "chrome", 6);
});
