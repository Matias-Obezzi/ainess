// Retrying a run puts the new attempt where the old one was, and takes the old one off the thread.
//
// Before this, a retry went out as a fresh prompt: the user saw their own request written again and
// a second turn at the bottom, with the run that had failed still sitting where it was.
import { test, expect, type Page } from "@playwright/test";
import { openDemo, snap } from "./demo";

const FIRST = "e2e-retry-first";
const FAILED = "e2e-retry-failed";
const AFTER = "e2e-retry-after";
const AGAIN = "e2e-retry-again";

/** Three turns of the planner — the middle one failed — and optionally the retry of that middle one. */
async function seedThread(page: Page, retried: boolean): Promise<void> {
  await page.evaluate(({ retried, FIRST, FAILED, AFTER, AGAIN }) => {
    type Store = {
      getState(): {
        currentProjectId: string;
        runs: Record<string, unknown>;
        config: { projects: Array<{ id: string; agents: Array<{ id: string; role: string }> }> };
      };
      setState(patch: object): void;
    };
    const store = (window as unknown as { __ainess: Store }).__ainess;
    const state = store.getState();
    const project = state.config.projects.find(p => p.id === state.currentProjectId)!;
    const planner = project.agents.find(a => a.role === "planner")!;
    const now = Date.now();
    const base = { projectId: project.id, agentId: planner.id, parentRunId: null, rawLines: [], childRunIds: [], round: 0 };
    const turn = (id: string, startedAt: number, prompt: string, status: string, output: string, extra = {}) =>
      ({ ...base, id, rootRunId: id, prompt, status, startedAt, endedAt: startedAt + 5_000, output, ...extra });

    const runs: Record<string, unknown> = {
      ...state.runs,
      [FIRST]: turn(FIRST, now - 40_000, "Rename the config file", "done", "Renamed."),
      [FAILED]: turn(FAILED, now - 30_000, "Reindex the search", "error", "The indexer died halfway."),
      [AFTER]: turn(AFTER, now - 20_000, "Write the release notes", "done", "Written."),
    };
    // The retry is the newest run of the four, and still belongs in the middle.
    if (retried) runs[AGAIN] = turn(AGAIN, now - 1_000, "Reindex the search", "done", "Indexed, this time.", { replacesRunId: FAILED });
    store.setState({ runs });
  }, { retried, FIRST, FAILED, AFTER, AGAIN });
}

/** The ids of the turns on screen, top to bottom, keeping only the ones this test put there. */
async function turnsOnScreen(page: Page): Promise<string[]> {
  const ids = await page.locator("[data-message-id]").evaluateAll(
    nodes => nodes.map(n => n.getAttribute("data-message-id") ?? ""),
  );
  return ids.filter(id => id.startsWith("e2e-retry-"));
}

test("the three turns are drawn in the order they happened", async ({ page }) => {
  await openDemo(page, "chat");
  await seedThread(page, false);
  await expect(page.getByText("The indexer died halfway.")).toBeVisible();
  expect(await turnsOnScreen(page)).toEqual([FIRST, FAILED, AFTER]);
});

test("the retry takes the failed turn's place instead of landing at the bottom", async ({ page }) => {
  await openDemo(page, "chat");
  await seedThread(page, true);

  await expect(page.getByText("Indexed, this time.")).toBeVisible();
  // The turn that failed is gone from the thread — not deleted, only no longer drawn — and the one
  // that replaced it is in its place, between the two turns that were already around it.
  await expect(page.getByText("The indexer died halfway.")).toHaveCount(0);
  expect(await turnsOnScreen(page)).toEqual([FIRST, AGAIN, AFTER]);
  // And nothing was added: the request was asked once and is written once.
  await expect(page.getByText("Reindex the search", { exact: true })).toHaveCount(1);

  await snap(page, "retry-in-place");
});
