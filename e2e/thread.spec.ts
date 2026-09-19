// Sending a message and still seeing the thread afterwards. Four reports and three wrong fixes
// went by before the black chat was understood; this is the test that would have said so.
import { test, expect, type Page } from "@playwright/test";
import { composer, expectNoHiddenScroll, freeTheTeam, openDemo, quietTheThread, snap } from "./demo";

/** Reads back up the thread, the way a wheel does — from a point inside it, whatever the window. */
async function readBack(page: Page): Promise<void> {
  const size = page.viewportSize()!;
  await page.mouse.move(size.width * 0.55, size.height * 0.45);
  for (let i = 0; i < 4; i++) await page.mouse.wheel(0, -1200);
}

test("the thread stays on screen after a message is sent", async ({ page }) => {
  await openDemo(page, "chat");
  await freeTheTeam(page);
  const { input } = composer(page);
  await input.click();
  await input.pressSequentially("- una lista");
  // Shift+Enter carries the list on: the "- " of the second item is the box's own.
  await input.press("Shift+Enter");
  await input.pressSequentially("con dos ítems");
  await expect(input).toHaveValue("- una lista\n- con dos ítems");
  await input.press("Enter");

  const bubble = page.getByTestId("user-bubble").last();
  await expect(bubble).toBeVisible();
  await expect(bubble).toBeInViewport();
  // Written as a list, drawn as one.
  await expect(bubble.locator("li")).toHaveCount(2);
  await expectNoHiddenScroll(bubble);
  await snap(page, "thread-after-send");
});

test("a one-on-one chat draws the message you sent", async ({ page }) => {
  await openDemo(page, "onechat");
  const { input } = composer(page);
  await input.click();
  await input.pressSequentially("hola, ¿cómo va?");
  await input.press("Enter");

  const bubble = page.getByTestId("user-bubble").last();
  await expect(bubble).toBeVisible();
  await expect(bubble).toBeInViewport();
  await expect(bubble).toContainText("hola, ¿cómo va?");
  await expectNoHiddenScroll(bubble);
  await snap(page, "onechat-after-send");
});

// Reading back up a thread and the way down again. The button used to need something new to have
// arrived to exist, which is the one moment it is not needed.
test("the way back to the bottom is there while you read up, with nothing new arriving", async ({ page }) => {
  await openDemo(page, "chat");
  await quietTheThread(page);
  await readBack(page);

  const back = page.getByTestId("to-bottom");
  await expect(back).toBeVisible();
  // Nothing arrived while we were up there, so it cannot be announcing a count.
  await expect(back).not.toContainText(/\d/);
  await snap(page, "thread-way-back");

  await back.click();
  await expect(back).toBeHidden();
});

test("sending a message takes you to it, however far up you were reading", async ({ page }) => {
  await openDemo(page, "chat");
  await quietTheThread(page);
  await freeTheTeam(page);
  await readBack(page);
  await expect(page.getByTestId("to-bottom")).toBeVisible();

  const { input } = composer(page);
  await input.click();
  await input.pressSequentially("y esto, ¿por qué falla?");
  await input.press("Enter");

  const bubble = page.getByTestId("user-bubble").last();
  await expect(bubble).toContainText("y esto, ¿por qué falla?");
  await expect(bubble).toBeInViewport();
  // Back at the bottom on its own: nothing left to go back to.
  await expect(page.getByTestId("to-bottom")).toBeHidden();
  await expectNoHiddenScroll(bubble);
});

test("a one-on-one chat also takes you to the message you just sent", async ({ page }) => {
  // Four messages fit on a full screen; the point is a thread taller than its box.
  await page.setViewportSize({ width: 900, height: 420 });
  await openDemo(page, "onechat");
  await readBack(page);
  await expect(page.getByTestId("to-bottom")).toBeVisible();

  const { input } = composer(page);
  await input.click();
  await input.pressSequentially("¿y los reembolsos?");
  await input.press("Enter");

  const bubble = page.getByTestId("user-bubble").last();
  await expect(bubble).toContainText("¿y los reembolsos?");
  await expect(bubble).toBeInViewport();
  await expect(page.getByTestId("to-bottom")).toBeHidden();
});
