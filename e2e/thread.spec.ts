// Sending a message and still seeing the thread afterwards. Four reports and three wrong fixes
// went by before the black chat was understood; this is the test that would have said so.
import { test, expect } from "@playwright/test";
import { composer, expectNoHiddenScroll, freeTheTeam, openDemo, snap } from "./demo";

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
