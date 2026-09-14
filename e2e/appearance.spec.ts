// A theme is the components' own variables with new values: set one and the screen follows.
import { test, expect } from "@playwright/test";
import { openDemo, snap } from "./demo";

test("a preset changes the colours every component reads", async ({ page }) => {
  await openDemo(page, "chat");
  const before = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--background").trim());
  await page.evaluate(() => {
    type Store = { getState(): { updateConfig(patch: object): void } };
    (window as unknown as { __ainess: Store }).__ainess.getState().updateConfig({
      theme: { preset: "nord", vars: { background: "#2e3440", foreground: "#eceff4", primary: "#88c0d0" } },
    });
  });
  const after = await page.evaluate(() => getComputedStyle(document.documentElement).getPropertyValue("--background").trim());
  expect(after).toBe("#2e3440");
  expect(after).not.toBe(before);
  // Through Tailwind's token, the way a component asks for it: `bg-background` paints the theme.
  const painted = await page.evaluate(() => {
    const probe = document.createElement("div");
    probe.className = "bg-background text-primary";
    document.body.appendChild(probe);
    const cs = getComputedStyle(probe);
    const out = { background: cs.backgroundColor, primary: cs.color };
    probe.remove();
    return out;
  });
  expect(painted.background).toBe("rgb(46, 52, 64)");
  expect(painted.primary).toBe("rgb(136, 192, 208)");
  await snap(page, "theme-nord");
});
