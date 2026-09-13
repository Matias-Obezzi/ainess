import { test, expect, type Page } from "@playwright/test";
import { composer, openDemo } from "./demo";

const TEXT = "otr mas que el nombre de cada sala sea la semilla para cada una, que las salas sean livings, cuartos, terrazas, patios, cocinas, banos";

/** For every word end of `text`, whether the textarea and the layer agree on how many lines it takes. */
async function firstDisagreement(page: Page, text: string) {
  return page.evaluate((text) => {
    const ta = document.querySelector('[data-testid="composer-input"]') as HTMLTextAreaElement;
    const ly = document.querySelector('[data-testid="composer-layer"]') as HTMLElement;
    const setter = Object.getOwnPropertyDescriptor(HTMLTextAreaElement.prototype, "value")!.set!;
    const set = (v: string) => { setter.call(ta, v); ta.dispatchEvent(new Event("input", { bubbles: true })); };
    for (let i = 1; i <= text.length; i++) {
      if (i < text.length && text[i] !== " " && text[i - 1] !== " ") continue;
      set(text.slice(0, i));
      const d = ta.scrollHeight - ly.scrollHeight;
      if (Math.abs(d) > 2) {
        const out = { i, ta: ta.scrollHeight, ly: ly.scrollHeight, tail: text.slice(Math.max(0, i - 20), i), taW: ta.clientWidth, lyW: ly.clientWidth };
        set("");
        return out;
      }
    }
    set("");
    return null;
  }, text);
}

export async function scan(page: Page, label: string, step = 3) {
  test.setTimeout(600_000);
  await openDemo(page, "chat");
  const { input } = composer(page);
  await input.click();
  const out: string[] = [];
  for (let w = 980; w <= 1090; w += step) {
    await page.setViewportSize({ width: w, height: 900 });
    const d = await firstDisagreement(page, TEXT);
    if (d) out.push(`${label} w=${w} i=${d.i} ta=${d.ta} ly=${d.ly} taW=${d.taW} lyW=${d.lyW} tail="${d.tail}"`);
  }
  console.log(out.join("\n") || `${label}: no disagreement`);
  expect(out).toEqual([]);
}
