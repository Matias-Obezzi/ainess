// The box once the text no longer fits in it. `composer-wrap` and `wrap-agreement` both look at a
// composer that shows everything it holds, and the two layers agreed there while the caret was
// landing in the middle of a word for anyone with more text than box. What changes when the box
// scrolls is a scroll position the layer has to be told about, a scrollbar that can take room from
// one of the two and not the other, and a last line neither of them can be alone in having.
//
// Where the caret is, is measured rather than assumed: the textarea draws it and gives no way to
// ask where. So a single character is selected instead — the selection is painted by the same
// engine, in the same place — and the box is photographed with and without it. The pixels that
// changed are where the textarea believes that character is; the layer is asked for its own
// rectangle for the same character, and the two have to be the same rectangle.
import { test, expect, type Page } from "@playwright/test";
import { composer, openDemo, snap } from "./demo";

/** Long enough to scroll the box at any width it is given, and plain prose: no fences, no menus. */
const TEXT = Array.from({ length: 8 }, (_, k) =>
  `parrafo ${k}: me esta pasando que los agentes contestan con nombres de archivos pero al abrirlos aparece una vista que dice que no se pudo encontrar el archivo, hay manera de pedirles la ruta desde la raiz del proyecto en lugar del nombre a secas.`).join("\n");

/** Puts `text` in the box the way a paste does: one value, one input event, no typing. */
async function fill(page: Page, text: string): Promise<void> {
  await page.evaluate((value) => {
    const box = document.querySelector('[data-testid="composer-input"]') as HTMLTextAreaElement;
    const native = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    native.call(box, value);
    box.dispatchEvent(new Event("input", { bubbles: true }));
    box.focus();
  }, text);
}

/** What the layer and the box say about their own scrolling, right now. */
async function scrollState(page: Page) {
  return page.evaluate(() => {
    const box = document.querySelector('[data-testid="composer-input"]') as HTMLTextAreaElement;
    const layer = document.querySelector('[data-testid="composer-layer"]') as HTMLElement;
    return {
      boxTop: box.scrollTop,
      layerTop: layer.scrollTop,
      boxHeight: box.scrollHeight,
      layerHeight: layer.scrollHeight,
      boxWidth: box.clientWidth,
      layerWidth: layer.clientWidth,
    };
  });
}

/**
 * Where the textarea puts the character at `index`, in pixels from the corner of the box, found by
 * selecting it and looking at what changed on screen. `null` when the character is not on screen or
 * is drawn over a line edge, which is not a disagreement — there is nothing to compare there.
 */
async function caretRect(page: Page, clip: { x: number; y: number; width: number; height: number }, index: number) {
  const shoot = async (from: number, to: number) => {
    await page.evaluate(({ from, to }) => {
      const box = document.querySelector('[data-testid="composer-input"]') as HTMLTextAreaElement;
      box.focus();
      box.setSelectionRange(from, to);
    }, { from, to });
    return (await page.screenshot({ clip })).toString("base64");
  };
  // The same caret position, once collapsed and once holding the character: only the selection of
  // that one character can have changed between the two.
  const without = await shoot(index, index);
  const With = await shoot(index, index + 1);
  return page.evaluate(async ({ without, With, index }) => {
    const pixels = async (encoded: string) => {
      const bytes = Uint8Array.from(atob(encoded), c => c.charCodeAt(0));
      const bitmap = await createImageBitmap(new Blob([bytes], { type: "image/png" }));
      const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
      const context = canvas.getContext("2d")!;
      context.drawImage(bitmap, 0, 0);
      return { data: context.getImageData(0, 0, bitmap.width, bitmap.height).data, width: bitmap.width, height: bitmap.height };
    };
    const a = await pixels(without);
    const b = await pixels(With);
    let left = 1e9, top = 1e9, right = -1, bottom = -1, changed = 0;
    for (let y = 0; y < a.height; y++) {
      for (let x = 0; x < a.width; x++) {
        const o = (y * a.width + x) * 4;
        const delta = Math.abs(a.data[o] - b.data[o]) + Math.abs(a.data[o + 1] - b.data[o + 1]) + Math.abs(a.data[o + 2] - b.data[o + 2]);
        if (delta <= 40) continue;
        changed++;
        if (x < left) left = x;
        if (x > right) right = x;
        if (y < top) top = y;
        if (y > bottom) bottom = y;
      }
    }
    // The layer's own rectangle for the same character, in the same corner's coordinates.
    const layer = document.querySelector('[data-testid="composer-layer"]') as HTMLElement;
    const texts: Text[] = [];
    const walker = document.createTreeWalker(layer, NodeFilter.SHOW_TEXT);
    for (let node = walker.nextNode(); node; node = walker.nextNode()) texts.push(node as Text);
    let seen = 0;
    let glyph: { left: number; top: number; right: number; bottom: number; char: string } | null = null;
    for (const node of texts) {
      if (index < seen + node.data.length) {
        const range = document.createRange();
        range.setStart(node, index - seen);
        range.setEnd(node, index - seen + 1);
        const rect = range.getBoundingClientRect();
        const frame = layer.getBoundingClientRect();
        glyph = { left: rect.left - frame.left, top: rect.top - frame.top, right: rect.right - frame.left, bottom: rect.bottom - frame.top, char: node.data[index - seen] };
        break;
      }
      seen += node.data.length;
    }
    if (!glyph || changed === 0) return null;
    // Only characters drawn whole, inside the box: one clipped by an edge has no rectangle to
    // compare, and the photograph would only show the part of it that fits.
    const inside = glyph.top >= 0 && glyph.bottom <= a.height && glyph.left >= 0 && glyph.right <= a.width;
    if (!inside) return null;
    return { char: glyph.char, dx: left - glyph.left, dy: top - glyph.top, changed, caret: { left, top, right, bottom } };
  }, { without, With, index });
}

test("the caret is on its own character while the box is scrolled", async ({ page }) => {
  await openDemo(page, "chat");
  const { input, layer } = composer(page);
  await input.click();
  // The caret is what is being measured, and a blinking one is a pixel that changes on its own.
  await page.addStyleTag({ content: '[data-testid="composer-input"]{caret-color:transparent !important}' });
  // Spelling is underlined as the selection moves through a word, which would be counted as the
  // selection itself. The words here are the point, not the red lines under them.
  await page.evaluate(() => { (document.querySelector('[data-testid="composer-input"]') as HTMLTextAreaElement).spellcheck = false; });
  await fill(page, TEXT);
  const state = await scrollState(page);
  expect(state.boxHeight, "the text has to be taller than the box for any of this to mean anything").toBeGreaterThan(198);

  const disagreements: string[] = [];
  for (const scrollTop of [0, 63, 147, 9999]) {
    await page.evaluate((top) => { (document.querySelector('[data-testid="composer-input"]') as HTMLTextAreaElement).scrollTop = top; }, scrollTop);
    await page.waitForTimeout(50);
    const here = await scrollState(page);
    expect(here.layerTop, `the layer did not follow the box to ${scrollTop}`).toBe(here.boxTop);
    for (let index = 40; index < TEXT.length; index += 97) {
      if (!/[a-záéíóúñ]/i.test(TEXT[index])) continue;
      const found = await caretRect(page, (await layer.boundingBox())!, index);
      if (!found) continue;
      if (Math.abs(found.dx) > 2 || Math.abs(found.dy) > 2) {
        disagreements.push(`scrollTop=${here.boxTop} i=${index} char=${JSON.stringify(found.char)} off by (${found.dx}, ${found.dy})`);
      }
    }
  }
  await snap(page, "composer-scrolled", page.locator('[data-testid="composer-layer"]').locator(".."));
  expect(disagreements, "the caret and the word under it are not in the same place").toEqual([]);
});

test("the layer keeps the scroll position of the box across a redraw", async ({ page }) => {
  await openDemo(page, "chat");
  const { input } = composer(page);
  await input.click();
  await fill(page, TEXT);
  await input.press("Control+End");
  await input.pressSequentially(" ya", { delay: 10 });
  const scrolled = await scrollState(page);
  expect(scrolled.boxTop, "typing at the end of a full box scrolls it to keep the caret in sight").toBeGreaterThan(0);
  expect(scrolled.layerTop).toBe(scrolled.boxTop);

  // What a scroll event arriving before the layer was drawn at its new height leaves behind: a
  // position clamped to a maximum that no longer holds. Nothing scrolls afterwards, so only a
  // redraw can put it back — and every redraw has to.
  await page.evaluate(() => { (document.querySelector('[data-testid="composer-layer"]') as HTMLElement).scrollTop = 0; });
  await input.pressSequentially(" mas", { delay: 10 });
  const after = await scrollState(page);
  expect(after.layerTop, "the redraw did not put the layer back where the box is").toBe(after.boxTop);
});

test("the box and the layer keep the same width whichever of them overflows", async ({ page }) => {
  await openDemo(page, "chat");
  const { input } = composer(page);
  await input.click();
  // A scrollbar that takes room takes it from the line, so the two only wrap alike while both pay
  // for it. The layer overflows on its own — it draws the grey suggestion the box does not have —
  // and that is when only one of them used to be paying. Says little where scrollbars float over
  // the text and take no room, which is what this browser does: the test below is the one that
  // looks at the arithmetic.
  for (const value of ["", "una linea sola", TEXT.slice(0, 400), TEXT]) {
    await fill(page, value);
    const state = await scrollState(page);
    expect(state.layerWidth, `the two disagree on the width of a line with ${value.length} characters`).toBe(state.boxWidth);
  }
});

test("the layer is given the room the box's scrollbar takes, whatever it takes", async ({ page }) => {
  await openDemo(page, "chat");
  const { input } = composer(page);
  await input.click();
  await fill(page, TEXT);
  // Where scrollbars float there is nothing to give, so the room is taken away from the box by
  // hand: a border on the side the scrollbar would be on is the same thing to the arithmetic —
  // room inside the box's edge that its lines no longer have.
  const widths = await page.evaluate(async () => {
    const box = document.querySelector('[data-testid="composer-input"]') as HTMLTextAreaElement;
    const layer = document.querySelector('[data-testid="composer-layer"]') as HTMLElement;
    const inner = (el: HTMLElement) => {
      const style = getComputedStyle(el);
      return el.clientWidth - parseFloat(style.paddingLeft) - parseFloat(style.paddingRight);
    };
    const before = { box: inner(box), layer: inner(layer) };
    box.style.borderRightWidth = "11px";
    // The size the box gives its text changed, which is what the watch on it is for.
    await new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve)));
    const after = { box: inner(box), layer: inner(layer) };
    box.style.borderRightWidth = "";
    return { before, after };
  });
  expect(widths.before.layer).toBe(widths.before.box);
  expect(widths.after.box, "the border has to have taken room off the box's own line").toBeLessThan(widths.before.box);
  expect(widths.after.layer, "the layer kept a line the box no longer has").toBe(widths.after.box);
});

test("the box and the layer agree on how many lines the text takes once it scrolls", async ({ page }) => {
  await openDemo(page, "chat");
  const { input } = composer(page);
  await input.click();
  // `wrap-agreement` walks a sentence that always fits. This walks past the bottom of the box,
  // where a line of difference stops being invisible: it is a line of scrolling the two do not
  // share, and every word after it is drawn away from the caret that belongs to it.
  const worst = await page.evaluate((text) => {
    const box = document.querySelector('[data-testid="composer-input"]') as HTMLTextAreaElement;
    const layer = document.querySelector('[data-testid="composer-layer"]') as HTMLElement;
    const native = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    const put = (value: string) => { native.call(box, value); box.dispatchEvent(new Event("input", { bubbles: true })); };
    let out: { at: number; box: number; layer: number; scrolling: boolean } | null = null;
    for (let i = 1; i <= text.length; i++) {
      if (i < text.length && text[i] !== " " && text[i - 1] !== " ") continue;
      put(text.slice(0, i));
      if (Math.abs(box.scrollHeight - layer.scrollHeight) > 2) {
        out = { at: i, box: box.scrollHeight, layer: layer.scrollHeight, scrolling: box.scrollHeight > box.clientHeight };
        break;
      }
    }
    put("");
    return out;
  }, TEXT);
  expect(worst).toBeNull();
});
