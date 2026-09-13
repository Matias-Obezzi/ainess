// Getting around: the screens open, and a second click on the project you are in goes to its
// orchestrator.
import { test, expect } from "@playwright/test";
import { composer, openDemo, snap } from "./demo";

test("the home draws", async ({ page }) => {
  await openDemo(page, "home");
  await snap(page, "home");
  await expect(page.getByTestId("sidebar-project").first()).toBeVisible();
});

test("the board draws, and a second click on the project goes to the orchestrator", async ({ page }) => {
  await openDemo(page, "board");
  await snap(page, "board");
  const project = page.getByTestId("sidebar-project").first();
  await project.click();
  await expect(composer(page).input).toBeVisible();
  await snap(page, "board-then-orchestrator");
});

test("the hierarchy and the settings draw", async ({ page }) => {
  await openDemo(page, "hierarchy");
  await snap(page, "hierarchy");
  await openDemo(page, "settings");
  await snap(page, "settings");
});
