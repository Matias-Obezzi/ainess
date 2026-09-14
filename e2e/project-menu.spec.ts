// The project's right-click menu: the submenu row reads like the rows around it.
import { test, expect } from "@playwright/test";
import { openDemo, snap } from "./demo";

test("the submenu row keeps the gap between its icon and its label", async ({ page }) => {
  await openDemo(page, "chat");
  // Editors are detected on the desktop only; the demo gets one so the row is enabled.
  await page.evaluate(() => {
    type Store = { setState(patch: object): void };
    (window as unknown as { __ainess: Store }).__ainess.setState({ editors: [{ id: "vscode", label: "Visual Studio Code", path: "code" }] });
  });
  await page.getByTestId("sidebar-project").first().click({ button: "right" });
  const menu = page.getByRole("menu").first();
  await expect(menu).toBeVisible();
  const rows = menu.locator('[role="menuitem"]');
  // Same left edge for every label: icon width plus the same gap, submenu row included.
  const labelLefts = await rows.evaluateAll(items => items.map(el => {
    const svg = el.querySelector("svg");
    const range = document.createRange();
    const text = [...el.childNodes].find(n => n.nodeType === Node.TEXT_NODE && n.textContent?.trim());
    if (!svg || !text) return null;
    range.selectNodeContents(text);
    const rect = range.getBoundingClientRect();
    return Math.round(rect.left - svg.getBoundingClientRect().right);
  }));
  const gaps = labelLefts.filter((g): g is number => g !== null);
  expect(gaps.length).toBeGreaterThan(2);
  expect(new Set(gaps).size).toBe(1);
  await snap(page, "project-menu");
});
