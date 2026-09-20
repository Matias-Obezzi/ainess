// The window is a WebView2, and a page's habits leak into it: text that highlights wherever you
// drag, a scroll that carries on into the pane behind it, the browser's own right-click menu. What
// is turned off in the runtime itself (zoom, swipe, the status bar) cannot be seen from here — see
// src-tauri/src/webview.rs. What CSS and the DOM do can, and the line that matters is where the
// shell ends and the content begins: aiming at the sidebar must select nothing, and aiming at an
// answer must still give you something to copy.
//
// The gesture here is a double click rather than a drag across the words. A drag is what a person
// does, but a synthetic one does not select in this browser — the caret follows the pointer and
// stays collapsed — while a double click goes through the same machinery in Blink and obeys the
// same `user-select`. What it proves is what matters: this text selects, that text does not.
import { test, expect, type Page, type Locator } from "@playwright/test";
import { openDemo, quietTheThread, snap } from "./demo";

/** Double-clicks in the middle of `target` and answers with whatever ended up selected. */
async function pickWord(page: Page, target: Locator): Promise<string> {
  await page.evaluate(() => window.getSelection()?.removeAllRanges());
  const box = (await target.boundingBox())!;
  await page.mouse.dblclick(box.x + Math.min(30, box.width / 2), box.y + box.height / 2);
  return page.evaluate(() => window.getSelection()?.toString() ?? "");
}

test("an answer can be selected with the mouse and the sidebar cannot", async ({ page }) => {
  await openDemo(page, "chat");
  await quietTheThread(page);

  // What an agent wrote, as markdown: the one thing that must never stop being copyable. The last
  // paragraph, which is the one on screen — a thread opens at its tail.
  const answer = page.locator("[data-testid='project-pane'] .select-text p").last();
  await expect(answer).toBeVisible();
  await answer.scrollIntoViewIfNeeded();
  expect((await pickWord(page, answer)).trim().length).toBeGreaterThan(0);
  await snap(page, "native-feel-selected-answer");

  // The menu is chrome. Aiming at a project is aiming at the project, not at its letters.
  expect(await pickWord(page, page.getByTestId("sidebar-project").first())).toBe("");

  // And Ctrl+A, pressed with the focus left in the menu, still means the conversation and not the
  // window: the same `user-select` is what decides what "all" is, so nothing else was needed.
  const row = ((await page.getByTestId("sidebar").locator("button").nth(1).textContent()) ?? "").trim();
  expect(row.length).toBeGreaterThan(4);
  await page.keyboard.press("Control+a");
  const all = await page.evaluate(() => window.getSelection()?.toString() ?? "");
  expect(all).toContain(((await answer.textContent()) ?? "").trim().slice(0, 20));
  expect(all).not.toContain(row);
});

test("right-click opens one of ours, or nothing, but never the browser's", async ({ page }) => {
  await openDemo(page, "chat");

  // Ours still opens: turning the browser's menu off is a `preventDefault`, and Radix's trigger
  // calls it first.
  await page.getByTestId("sidebar-project").first().click({ button: "right" });
  await expect(page.getByRole("menu").first()).toBeVisible();
  await page.keyboard.press("Escape");

  // Where the app has nothing to offer, nothing opens — not even the browser's reload/view-source.
  const swallowed = await page.evaluate(() => {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    document.querySelector("[data-testid='sidebar']")!.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(swallowed).toBe(true);

  // Over a field being typed into it is swallowed too — not into nothing: cut, copy and paste
  // take the click from there (e2e/edit-menu.spec.ts).
  const field = await page.evaluate(() => {
    const event = new MouseEvent("contextmenu", { bubbles: true, cancelable: true });
    document.querySelector("[data-testid='composer-input']")!.dispatchEvent(event);
    return event.defaultPrevented;
  });
  expect(field).toBe(true);
  await expect(page.locator("[data-testid='edit-context-menu']")).toBeVisible();
});

test("a scroll that ends stops, and the box you write in keeps its caret", async ({ page }) => {
  await openDemo(page, "chat");

  // Reaching the end of the thread does not hand the rest of the wheel to whatever is behind it.
  const thread = page.locator("[data-testid='project-pane'] .select-text").first();
  expect(await thread.evaluate(el => getComputedStyle(el).overscrollBehaviorY)).toBe("none");

  // The shell does not select; the box you write in does.
  expect(await page.getByTestId("sidebar").evaluate(el => getComputedStyle(el).userSelect)).toBe("none");
  expect(await page.getByTestId("composer-input").evaluate(el => getComputedStyle(el).userSelect)).toBe("text");
});
