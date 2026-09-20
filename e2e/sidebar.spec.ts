// The menu in its two shapes. The one that matters on screen is the rail: a strip of icons
// that carries everything the expanded bar does — home, new project, the projects, the counters and
// the gear — and opens nothing by itself. A project's rows hang from its own avatar.
import { test, expect } from "@playwright/test";
import { openDemo, snap } from "./demo";

test("the collapsed rail carries the whole bar as icons, and hovering it opens nothing", async ({ page }) => {
  await openDemo(page, "chat");
  const sidebar = page.getByTestId("sidebar");
  const rail = page.getByTestId("sidebar-rail");
  const menu = page.getByTestId("rail-project-menu");
  await expect(sidebar).toHaveAttribute("data-mode", "expanded");

  // The same two panes the rest of the suite opens, from the project's own right-click menu.
  await page.getByTestId("sidebar-project").nth(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Open in a new pane" }).click();
  await expect(page.getByTestId("project-pane")).toHaveCount(2);

  // Nobody asked for it: two projects need the width more than the tree does.
  await expect(sidebar).toHaveAttribute("data-mode", "collapsed");
  await expect(rail).toBeVisible();
  await snap(page, "sidebar-collapsed-rail");

  // Top to bottom, and in this order: the house, the plus, the projects, the two counters, the
  // gear. Everything the expanded bar offers has its icon here.
  const projects = page.getByTestId("rail-project");
  const projectCount = await projects.count();
  expect(projectCount).toBeGreaterThan(1);
  const order = await rail
    .locator("[data-testid]")
    .evaluateAll(els => els.map(el => el.getAttribute("data-testid")));
  expect(order).toEqual([
    "rail-home",
    "rail-new-project",
    ...Array(projectCount).fill("rail-project"),
    "rail-working",
    "rail-ports",
    "rail-settings",
    "rail-report-issue",
  ]);

  // Every icon says what it is, since none of them carries a word.
  await expect(page.getByTestId("rail-home")).toHaveAttribute("aria-label", "Home");
  await expect(page.getByTestId("rail-new-project")).toHaveAttribute("aria-label", "New project");
  await expect(page.getByTestId("rail-settings")).toHaveAttribute("aria-label", "Settings");
  await expect(projects.first()).toHaveAttribute("aria-label", /.+/);

  // Crossing it with the pointer opens nothing, and moves nothing.
  const pane = page.getByTestId("project-pane").first();
  const before = await pane.boundingBox();
  await rail.hover();
  await projects.first().hover();
  await expect(menu).toHaveCount(0);
  expect(await pane.boundingBox()).toEqual(before);
});

test("a project on the rail opens its own rows on click and its menu on right click", async ({ page }) => {
  await openDemo(page, "chat");
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(page.getByTestId("sidebar")).toHaveAttribute("data-mode", "collapsed");

  const menu = page.getByTestId("rail-project-menu");
  await page.getByTestId("rail-project").first().click();
  await expect(menu).toBeVisible();

  // What the expanded bar shows indented under the row, and nothing invented for the rail.
  for (const label of ["Orchestrator", "Tasks", "Hierarchy", "New chat"]) {
    await expect(menu.getByText(label, { exact: true })).toHaveCount(1);
  }
  // Once on screen, not twice: the rail is the only place the projects live now.
  await expect(page.getByText("Orchestrator", { exact: true })).toHaveCount(1);
  await snap(page, "sidebar-rail-project-menu");

  // Escape closes it, and a click anywhere else does too.
  await page.keyboard.press("Escape");
  await expect(menu).toHaveCount(0);
  await page.getByTestId("rail-project").first().click();
  await expect(menu).toBeVisible();
  await page.mouse.click(700, 400);
  await expect(menu).toHaveCount(0);

  // Right click is the project menu the expanded row already had, unchanged.
  await page.getByTestId("rail-project").first().click({ button: "right" });
  const context = page.getByRole("menu").first();
  await expect(context).toBeVisible();
  await expect(context.getByRole("menuitem", { name: "Edit project" })).toBeVisible();
  await expect(context.getByRole("menuitem", { name: "Open in a new pane" })).toBeVisible();
});

test("the title bar button walks the two shapes", async ({ page }) => {
  await openDemo(page, "chat");
  const sidebar = page.getByTestId("sidebar");
  await expect(sidebar).toHaveAttribute("data-mode", "expanded");

  // The label is what the next press does, so naming it is also asserting it.
  await page.getByRole("button", { name: "Collapse sidebar" }).click();
  await expect(sidebar).toHaveAttribute("data-mode", "collapsed");
  // Hovering an avatar on the rail does not pop a menu open without a click.
  await page.getByTestId("rail-project").first().hover();
  await expect(page.getByTestId("rail-project-menu")).toHaveCount(0);

  await page.getByRole("button", { name: "Expand sidebar" }).click();
  await expect(sidebar).toHaveAttribute("data-mode", "expanded");
  // Expanded, the menu is the column it always was and the hover does nothing either.
  await page.getByTestId("sidebar-project").first().hover();
  await expect(page.getByTestId("rail-project-menu")).toHaveCount(0);
});

test("the project avatar is vertically centered in its row when git status adds a second line", async ({ page }) => {
  await openDemo(page, "chat");

  await page.evaluate(async () => {
    const { useAppStore } = await import("/src/store.ts");
    const state = useAppStore.getState();
    const firstProject = state.config.projects[0];
    if (!firstProject) throw new Error("no project in demo");
    useAppStore.setState({
      repoState: {
        ...state.repoState,
        [firstProject.id]: {
          isRepo: true,
          status: { branch: "main", dirty: 0, ahead: 0, behind: 0, upstream: null },
          pullRequests: [],
          fetchedAt: Date.now(),
        },
      },
    });
  });

  const row = page.getByTestId("sidebar-project").first();
  await expect(row.getByText("main")).toBeVisible();

  const avatar = row.locator(".rounded-full").first();
  const rowBox = (await row.boundingBox())!;
  const avatarBox = (await avatar.boundingBox())!;
  const rowCenterY = rowBox.y + rowBox.height / 2;
  const avatarCenterY = avatarBox.y + avatarBox.height / 2;
  expect(Math.abs(rowCenterY - avatarCenterY)).toBeLessThanOrEqual(1);
});

