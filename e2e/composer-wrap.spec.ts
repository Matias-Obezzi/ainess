// Ways the layer under the textarea can stop matching it, or stop reading like what was typed: a
// word too long for the line inside a fence, the grey suggestion after what was typed, and a
// sentence typed right after the backticks.
import { test, expect } from "@playwright/test";
import { composer, freeTheTeam, openDemo, snap } from "./demo";

test("a long word inside a fence wraps where the textarea wraps it", async ({ page }) => {
  await openDemo(page, "chat");
  const { input, layer } = composer(page);
  await input.click();
  const long = "a".repeat(220);
  await input.pressSequentially("```");
  await input.press("Enter");
  await input.pressSequentially(long);
  await expect(input).toHaveValue("```\n" + long + "\n```");
  await snap(page, "composer-wrap", page.locator('[data-testid="composer-layer"]').locator(".."));
  const heights = await page.evaluate(() => {
    const ta = document.querySelector('[data-testid="composer-input"]') as HTMLTextAreaElement;
    const ly = document.querySelector('[data-testid="composer-layer"]') as HTMLElement;
    return { textarea: ta.scrollHeight, layer: ly.scrollHeight };
  });
  expect(Math.abs(heights.textarea - heights.layer)).toBeLessThanOrEqual(2);
  void layer;
});

test("the suggestion sits on the line of the caret, not under it", async ({ page }) => {
  await openDemo(page, "chat");
  await freeTheTeam(page);
  const { input, layer } = composer(page);
  await input.click();
  await input.pressSequentially("arregla esto porque se ve mal");
  await input.press("Enter");
  await expect(input).toHaveValue("");
  await input.pressSequentially("arre");
  await snap(page, "composer-ghost", page.locator('[data-testid="composer-layer"]').locator(".."));
  // The typed word and the suggestion share a line: same top edge.
  const tops = await layer.evaluate(el => {
    const ghost = el.querySelector("span.text-muted-foreground\\/70") as HTMLElement | null;
    const range = document.createRange();
    const first = el.firstChild;
    if (!first || !ghost) return null;
    range.setStart(first, 0);
    range.setEnd(first, 1);
    return { typed: range.getBoundingClientRect().top, ghost: ghost.getBoundingClientRect().top };
  });
  expect(tops).not.toBeNull();
  expect(Math.abs(tops!.typed - tops!.ghost)).toBeLessThan(2);
});

test("words typed right after the backticks are not dimmed as a language tag", async ({ page }) => {
  await openDemo(page, "chat");
  const { input, layer } = composer(page);
  await input.click();
  await input.pressSequentially("```una frase entera");
  // Only the backticks are the fence's; the sentence is drawn like any other.
  const dimmed = await layer.locator("span.text-muted-foreground\\/50").allTextContents();
  expect(dimmed).toEqual(["```"]);
  await expect(layer).toContainText("una frase entera");
  await snap(page, "composer-opener-sentence", page.locator('[data-testid="composer-layer"]').locator(".."));
});
