// Two projects on screen at once: they are both there, each pane writes to its own project, and
// closing one leaves the other filling the window.
import { test, expect, type Page } from "@playwright/test";
import { openDemo, snap } from "./demo";

const LANDING = "p-landing";

type Store = {
  getState(): { messages: { projectId: string; text: string }[]; config: { projects: { id: string; agents: { id: string }[] }[] }; runtime: Record<string, unknown>; setProjectMode(mode: string, projectId?: string | null): void };
  setState(patch: object): void;
};

/**
 * The second project on a conversation with a team that can take a message. `demoState` only
 * builds a runtime for the project the shots are of, and a message to a team that is not there
 * never leaves the box.
 */
async function readyTheSecondProject(page: Page): Promise<void> {
  await page.evaluate((projectId) => {
    const store = (window as unknown as { __ainess: Store }).__ainess;
    const state = store.getState();
    const agents = state.config.projects.find(p => p.id === projectId)?.agents ?? [];
    store.setState({
      runtime: {
        ...state.runtime,
        [projectId]: Object.fromEntries(agents.map(a => [a.id, { agentId: a.id, status: "idle", queuedInstructions: [] }])),
      },
    });
    state.setProjectMode("chat", projectId);
  }, LANDING);
}

/** The two panes, with the second project ready to be used. */
async function twoPanes(page: Page) {
  const panes = page.getByTestId("project-pane");
  await expect(panes).toHaveCount(1);
  await page.getByTestId("sidebar-project").nth(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Open in a new pane" }).click();
  await expect(panes).toHaveCount(2);
  return panes;
}

test("each pane keeps its own dock, and its buttons say so", async ({ page }) => {
  await openDemo(page, "chat");
  const panes = await twoPanes(page);
  // The label collapses to its icon in a column this wide; the title is what stays.
  const commButton = (i: number) => panes.nth(i).getByTitle("Show or hide the communication panel");
  const dock = (i: number) => panes.nth(i).getByTestId("right-dock");

  await commButton(0).click();
  await expect(dock(0)).toBeVisible();
  await expect(commButton(0)).toHaveAttribute("aria-pressed", "true");

  // The bug: the dock followed the focus, so opening one in the second pane closed the first
  // one's — and left both buttons lit over a dock that was not there.
  await commButton(1).click();
  await expect(dock(0)).toBeVisible();
  await expect(dock(1)).toBeVisible();
  await expect(commButton(0)).toHaveAttribute("aria-pressed", "true");
  await expect(commButton(1)).toHaveAttribute("aria-pressed", "true");
  await snap(page, "panes-two-docks");

  // Closing one leaves the other exactly where it was.
  await commButton(0).click();
  await expect(dock(0)).toHaveCount(0);
  await expect(commButton(0)).toHaveAttribute("aria-pressed", "false");
  await expect(dock(1)).toBeVisible();
  await expect(commButton(1)).toHaveAttribute("aria-pressed", "true");
  await snap(page, "panes-one-dock-left");
});

test("a second project opens beside the first, writes to itself, and closes again", async ({ page }) => {
  await openDemo(page, "chat");
  const panes = page.getByTestId("project-pane");
  await expect(panes).toHaveCount(1);

  // The option lives in the project's own right-click menu, next to "New chat".
  await page.getByTestId("sidebar-project").nth(1).click({ button: "right" });
  await page.getByRole("menuitem", { name: "Open in a new pane" }).click();

  await expect(panes).toHaveCount(2);
  await expect(panes.nth(1)).toHaveAttribute("data-project-id", LANDING);
  await readyTheSecondProject(page);
  await snap(page, "panes-two");

  // The right-hand pane's own box, not the one on the left.
  const secondBox = panes.nth(1).getByTestId("composer-input");
  await secondBox.click();
  await secondBox.pressSequentially("esto va al segundo proyecto");
  await secondBox.press("Enter");

  await expect(panes.nth(1).getByTestId("user-bubble").last()).toContainText("esto va al segundo proyecto");
  await expect(panes.nth(0).getByText("esto va al segundo proyecto")).toHaveCount(0);
  // And in the store, under that project and no other.
  const landed = await page.evaluate((text) => {
    const store = (window as unknown as { __ainess: Store }).__ainess;
    return store.getState().messages.filter(m => m.text?.includes(text)).map(m => m.projectId);
  }, "esto va al segundo proyecto");
  expect(landed).toEqual([LANDING]);
  await snap(page, "panes-second-project-message");

  // A window too narrow for two columns shows one — the one with the focus, which is the second
  // project here. The first is not closed: it comes back when there is room for it again.
  await page.setViewportSize({ width: 900, height: 900 });
  await expect(panes).toHaveCount(1);
  await expect(panes.nth(0)).toHaveAttribute("data-project-id", LANDING);
  await expect(page.getByTestId("close-pane")).toHaveCount(0);
  await snap(page, "panes-too-narrow-for-two");

  // Just wide enough for two of the narrowest pane: what 420px each actually looks like.
  await page.setViewportSize({ width: 1140, height: 900 });
  await expect(panes).toHaveCount(2);
  await snap(page, "panes-two-narrow");

  await page.setViewportSize({ width: 1400, height: 900 });
  await expect(panes).toHaveCount(2);

  // Clicking the left pane moves the focus to it; the ring says which one is standing.
  await panes.nth(0).getByTestId("composer-input").click();
  await expect(panes.nth(0)).toHaveAttribute("data-focused", "1");
  await expect(panes.nth(1)).not.toHaveAttribute("data-focused", "1");
  await snap(page, "panes-focus-left");

  await panes.nth(1).getByTestId("close-pane").click();
  await expect(panes).toHaveCount(1);
  await expect(panes.nth(0)).toHaveAttribute("data-project-id", "p-checkout");
  // One pane is the screen, so it has no X and nothing to distinguish it from.
  await expect(page.getByTestId("close-pane")).toHaveCount(0);
  await snap(page, "panes-back-to-one");
});
