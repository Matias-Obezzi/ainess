// The right click that a desktop app owes a text field once the browser's own menu is gone: cut,
// copy, paste, select all — and the pasted text has to reach React, not just the DOM, because the
// composer is a controlled field and what it holds is what gets sent.
//
// The demo is seeded in English (src/demo/seed.ts), so the items are named in English here.
import { test, expect } from "@playwright/test";
import { composer, openDemo } from "./demo";

test.use({ permissions: ["clipboard-read", "clipboard-write"] });

/** The one menu every field shares. */
const MENU = "[data-testid='edit-context-menu']";

test("a right click on the composer opens ours, with what applies turned on", async ({ page }) => {
  await openDemo(page, "chat");
  const { input } = composer(page);

  // Empty box, nothing selected: only pasting is on the table.
  await input.click({ button: "right" });
  const menu = page.locator(MENU);
  await expect(menu).toBeVisible();
  await expect(menu.getByRole("menuitem")).toHaveText(["Cut", "Copy", "Paste", "Select all"]);
  await expect(menu.getByRole("menuitem", { name: "Cut" })).toHaveAttribute("data-disabled");
  await expect(menu.getByRole("menuitem", { name: "Copy" })).toHaveAttribute("data-disabled");
  await expect(menu.getByRole("menuitem", { name: "Select all" })).toHaveAttribute("data-disabled");
  await expect(menu.getByRole("menuitem", { name: "Paste" })).not.toHaveAttribute("data-disabled");
  await page.keyboard.press("Escape");

  // Words in it and all of them selected: everything is.
  await input.click();
  await input.pressSequentially("copiame entero");
  await page.keyboard.press("Control+a");
  await input.click({ button: "right" });
  for (const name of ["Cut", "Copy", "Paste", "Select all"]) {
    await expect(menu.getByRole("menuitem", { name })).not.toHaveAttribute("data-disabled");
  }
});

test("copy takes the selection and paste writes it back, where React can see it", async ({ page }) => {
  await openDemo(page, "chat");
  const { input, layer } = composer(page);

  await input.click();
  await input.pressSequentially("lo que se copia");
  await page.keyboard.press("Control+a");
  await input.click({ button: "right" });
  await page.locator(MENU).getByRole("menuitem", { name: "Copy" }).click();
  // Polled: the click hands the menu back its focus first, and the clipboard write comes after.
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("lo que se copia");

  // Straight over the selection that is still there, so the paste has to replace it.
  await input.click({ button: "right" });
  await page.locator(MENU).getByRole("menuitem", { name: "Paste" }).click();
  await expect(input).toHaveValue("lo que se copia");
  // The layer draws the React state, not the field: if the component had missed the change, the
  // words would be in the box and not under it.
  await expect(layer).toContainText("lo que se copia");
});

test("cut empties the field and leaves the words on the clipboard", async ({ page }) => {
  await openDemo(page, "chat");
  const { input, layer } = composer(page);

  await input.click();
  await input.pressSequentially("esto se va");
  await page.keyboard.press("Control+a");
  await input.click({ button: "right" });
  await page.locator(MENU).getByRole("menuitem", { name: "Cut" }).click();
  await expect(input).toHaveValue("");
  await expect(layer).not.toContainText("esto se va");
  // Polled: the click hands the menu back its focus first, and the clipboard write comes after.
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toBe("esto se va");
});

test("a right click on a message still opens the message's own menu", async ({ page }) => {
  await openDemo(page, "chat");

  const answer = page.locator("[data-testid='project-pane'] .select-text p").last();
  await answer.scrollIntoViewIfNeeded();
  await answer.click({ button: "right" });

  await expect(page.getByRole("menu").first()).toBeVisible();
  await expect(page.locator(MENU)).toHaveCount(0);
});

test("in a terminal the menu is copy and paste only, and copy takes what xterm has selected", async ({ page }) => {
  await openDemo(page, "chat");
  // A bare terminal outside the dock, the way e2e/terminal-links.spec.ts builds one: what is under
  // test is the registry's terminal, not the panel around it.
  await page.evaluate(async () => {
    const container = document.createElement("div");
    container.id = "term-probe";
    container.style.cssText = "position:fixed;left:200px;top:200px;width:640px;height:320px;z-index:9999;background:#000";
    document.body.appendChild(container);
    const registry = await import("/src/lib/terminal-registry.ts");
    const entry = registry.ensureTerminal(
      { id: "term-probe", title: "probe", shellId: "sh", shellPath: "sh", cwd: "/", projectId: null },
      container,
    );
    // The spawn fails in the browser preview and writes its complaint into the terminal; wiped, so
    // the selection below is the line under test and nothing else.
    await new Promise<void>(resolve => setTimeout(resolve, 200));
    entry.term.reset();
    await new Promise<void>(resolve => entry.term.write("copiame de la terminal", resolve));
    entry.term.selectAll();
  });

  // By coordinate: the layers xterm stacks over its rows take any click aimed at an element.
  const box = (await page.locator("#term-probe .xterm-rows").boundingBox())!;
  await page.mouse.click(box.x + 20, box.y + 8, { button: "right" });
  const menu = page.locator(MENU);
  await expect(menu.getByRole("menuitem")).toHaveText(["Copy", "Paste"]);
  await menu.getByRole("menuitem", { name: "Copy" }).click();
  await expect.poll(() => page.evaluate(() => navigator.clipboard.readText())).toContain("copiame de la terminal");
});
