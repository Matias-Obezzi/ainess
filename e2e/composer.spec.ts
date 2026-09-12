// The box: what it does to what you type, and whether the layer that draws the words sits where
// the textarea puts them. The second part is the one no unit test can answer.
import { test, expect } from "@playwright/test";
import { composer, openDemo, snap } from "./demo";

test.beforeEach(async ({ page }) => {
  await openDemo(page, "chat");
});

test("a ``` fence is a box the width of the composer, as tall as its lines", async ({ page }) => {
  const { input, layer } = composer(page);
  await input.click();
  await input.pressSequentially("```ts");
  // Enter on the opener closes the fence and leaves the caret inside it.
  await input.press("Enter");
  await input.pressSequentially("const a = 1;");
  await input.press("Enter");
  await input.pressSequentially("const b = 2;");
  await expect(input).toHaveValue("```ts\nconst a = 1;\nconst b = 2;\n```");

  // Same content height on both sides: the layer's lines land where the textarea's do.
  const heights = await page.evaluate(() => {
    const ta = document.querySelector('[data-testid="composer-input"]') as HTMLTextAreaElement;
    const ly = document.querySelector('[data-testid="composer-layer"]') as HTMLElement;
    return { textarea: ta.scrollHeight, layer: ly.scrollHeight, line: parseFloat(getComputedStyle(ta).lineHeight) };
  });
  // Two pixels: the textarea counts its border, the layer has none.
  expect(Math.abs(heights.textarea - heights.layer)).toBeLessThanOrEqual(2);

  const box = layer.locator("span.block").first();
  const boxRect = (await box.boundingBox())!;
  const layerRect = (await layer.boundingBox())!;
  // Edge to edge, not hugging the text.
  expect(Math.abs(boxRect.x - layerRect.x)).toBeLessThanOrEqual(1);
  expect(Math.abs(boxRect.x + boxRect.width - (layerRect.x + layerRect.width))).toBeLessThanOrEqual(1);
  // Four lines: the opener, two of code, the closer. Not a row more.
  expect(Math.round(boxRect.height / heights.line)).toBe(4);

  await snap(page, "composer-fence", page.locator('[data-testid="composer-layer"]').locator(".."));
});

test("the words after a fence sit on the right line", async ({ page }) => {
  const { input, layer } = composer(page);
  await input.click();
  await input.pressSequentially("antes");
  await input.press("Shift+Enter");
  await input.pressSequentially("```");
  await input.press("Enter");
  await input.pressSequentially("x");
  // Past the closing fence, on a line of its own.
  await input.press("End");
  await input.press("ArrowDown");
  await input.press("End");
  await input.press("Shift+Enter");
  await input.pressSequentially("después");
  await expect(input).toHaveValue("antes\n```\nx\n```\ndespués");

  const line = await input.evaluate(el => parseFloat(getComputedStyle(el).lineHeight));
  const layerRect = (await layer.boundingBox())!;
  // "después" is the fifth line: its top sits four line-heights under the first, plus the padding.
  const after = await layer.evaluate(el => {
    const range = document.createRange();
    const walker = document.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    let node: Text | null = null;
    while ((node = walker.nextNode() as Text | null)) if (node.data.includes("después")) break;
    if (!node) return null;
    range.setStart(node, node.data.indexOf("después"));
    range.setEnd(node, node.data.indexOf("después") + 1);
    return range.getBoundingClientRect().top;
  });
  expect(after).not.toBeNull();
  const padding = await layer.evaluate(el => parseFloat(getComputedStyle(el).paddingTop));
  expect(Math.abs((after! - layerRect.y - padding) / line - 4)).toBeLessThan(0.15);
});

test("Ctrl+B wraps the selection in bold, and again unwraps it", async ({ page }) => {
  const { input } = composer(page);
  await input.click();
  await input.pressSequentially("hola mundo");
  await input.press("Control+a");
  await input.press("Control+b");
  await expect(input).toHaveValue("**hola mundo**");
  await input.press("Control+b");
  await expect(input).toHaveValue("hola mundo");
  // The sidebar's Ctrl+B did not fire: the sidebar is still there.
  await expect(page.getByTestId("sidebar-project").first()).toBeVisible();
});

test("Shift+Enter on a list item starts the next one", async ({ page }) => {
  const { input } = composer(page);
  await input.click();
  await input.pressSequentially("1. primero");
  await input.press("Shift+Enter");
  await expect(input).toHaveValue("1. primero\n2. ");
  await input.press("Shift+Enter");
  await expect(input).toHaveValue("1. primero\n");
});

test("pasted code lands in a fence of its own", async ({ page }) => {
  const { input } = composer(page);
  await input.click();
  await input.pressSequentially("mirá:");
  await input.evaluate(el => {
    const dt = new DataTransfer();
    dt.setData("text/plain", "function a() {\n  return 1;\n}");
    el.dispatchEvent(new ClipboardEvent("paste", { clipboardData: dt, bubbles: true, cancelable: true }));
  });
  await expect(input).toHaveValue("mirá:\n```\nfunction a() {\n  return 1;\n}\n```");
});
