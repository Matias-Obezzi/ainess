// The menu in its three shapes. The one that matters on screen is the middle one: a strip of
// project avatars that opens the whole menu *over* the content, so nothing to the right of it
// moves while the pointer is there.
import { test, expect } from "@playwright/test";
import { openDemo, snap } from "./demo";

test("a second pane collapses the menu to a strip, and hovering it opens the menu over the content", async ({ page }) => {
  await openDemo(page, "chat");
  const sidebar = page.getByTestId("sidebar");
  const rail = page.getByTestId("sidebar-rail");
  const flyout = page.getByTestId("sidebar-flyout");
  await expect(sidebar).toHaveAttribute("data-mode", "expanded");

  // The same two panes the rest of the suite opens, from the project's own right-click menu.
  await page.getByTestId("sidebar-project").nth(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Open in a new pane" }).click();
  await expect(page.getByTestId("project-pane")).toHaveCount(2);

  // Nobody asked for it: two projects need the width more than the tree does.
  await expect(sidebar).toHaveAttribute("data-mode", "collapsed");
  await expect(rail).toBeVisible();
  await expect(flyout).toHaveCount(0);
  await snap(page, "sidebar-collapsed-rail");

  // What the strip is: one avatar per project, each one saying its name.
  const avatars = rail.getByRole("button");
  await expect(avatars.first()).toHaveAttribute("aria-label", /.+/);

  const pane = page.getByTestId("project-pane").first();
  const before = await pane.boundingBox();
  await rail.hover();
  await expect(flyout).toBeVisible();
  // The whole point: the panel floats, so the pane underneath is exactly where it was.
  expect(await pane.boundingBox()).toEqual(before);
  // And it floats beside the strip rather than on top of it, so the avatars stay reachable.
  const railBox = await rail.boundingBox();
  const flyoutBox = await flyout.boundingBox();
  expect(flyoutBox!.x).toBeGreaterThanOrEqual(railBox!.x + railBox!.width - 1);
  await snap(page, "sidebar-collapsed-flyout");

  // Away from the menu it goes back to being a strip, and the pane still has not moved.
  await page.mouse.move(700, 400);
  await expect(flyout).toHaveCount(0);
  expect(await pane.boundingBox()).toEqual(before);
});

test("the title bar button walks the three shapes", async ({ page }) => {
  await openDemo(page, "chat");
  const sidebar = page.getByTestId("sidebar");
  await expect(sidebar).toHaveAttribute("data-mode", "expanded");

  // The label is what the next press does, so naming it is also asserting it.
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(sidebar).toHaveAttribute("data-mode", "collapsed");

  await page.getByRole("button", { name: "Hide sidebar" }).click();
  await expect(sidebar).toHaveAttribute("data-mode", "hidden");
  await expect(page.getByTestId("sidebar-rail")).toHaveCount(0);
  // Hidden means gone: hovering where it was does not bring it back.
  await page.mouse.move(2, 400);
  await expect(page.getByTestId("sidebar-flyout")).toHaveCount(0);

  await page.getByRole("button", { name: "Show sidebar" }).click();
  await expect(sidebar).toHaveAttribute("data-mode", "expanded");
  // Expanded, the menu is the column it always was and the hover does nothing either.
  await page.getByTestId("sidebar-project").first().hover();
  await expect(page.getByTestId("sidebar-flyout")).toHaveCount(0);
});
