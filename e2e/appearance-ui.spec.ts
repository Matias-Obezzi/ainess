// The Appearance section itself: it opens, shows every colour, and a preset picked there paints
// the window.
import { test, expect } from "@playwright/test";
import { openDemo, snap } from "./demo";

test("the appearance section lists the colours and applies a preset", async ({ page }) => {
  await openDemo(page, "settings");
  await page.evaluate(() => {
    type Store = { getState(): { openSettings(section: string): void } };
    (window as unknown as { __ainess: Store }).__ainess.getState().openSettings("appearance");
  });
  // Eighteen colours, each with its text field.
  await expect(page.locator('input[type="color"]')).toHaveCount(18);
  await snap(page, "appearance-default");

  await page.getByRole("dialog").getByRole("combobox").first().click();
  await page.getByRole("option", { name: "Nord" }).click();
  await expect.poll(() => page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--background").trim())).toBe("#2e3440");
  await snap(page, "appearance-nord");
});
