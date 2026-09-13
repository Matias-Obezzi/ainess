// A run that died of quota is drawn as a card under what it said, not as an answer made of the
// provider's boilerplate — and once the work was tried again, as one quiet line.
import { test, expect } from "@playwright/test";
import { openDemo, snap } from "./demo";

/** Puts a root run of the planner into the store, dead of quota, and optionally a retry after it. */
async function seedQuotaDeath(page: import("@playwright/test").Page, retried: boolean): Promise<void> {
  await page.evaluate(({ retried }) => {
    type Store = { getState(): { currentProjectId: string; runs: Record<string, unknown>; config: { projects: Array<{ id: string; agents: Array<{ id: string; role: string }> }> } }; setState(patch: object): void };
    const store = (window as unknown as { __ainess: Store }).__ainess;
    const state = store.getState();
    const project = state.config.projects.find(p => p.id === state.currentProjectId)!;
    const planner = project.agents.find(a => a.role === "planner")!;
    const base = { projectId: project.id, agentId: planner.id, parentRunId: null, prompt: "Reindex the search", rawLines: [], childRunIds: [], round: 0 };
    const dead = { ...base, id: "e2e-quota-dead", rootRunId: "e2e-quota-dead", status: "error", startedAt: Date.now() - 60_000, endedAt: Date.now() - 50_000, output: "You've hit your usage limit. Resets in 2h30m10s." };
    const again = { ...base, id: "e2e-quota-again", rootRunId: "e2e-quota-again", status: "running", startedAt: Date.now() - 10_000, output: "" };
    store.setState({ runs: { ...state.runs, [dead.id]: dead, ...(retried ? { [again.id]: again } : {}) } });
  }, { retried });
}

test("the dead run shows the card, with the wait and the two ways on", async ({ page }) => {
  await openDemo(page, "chat");
  await seedQuotaDeath(page, false);
  const card = page.getByText("Reindex the search").locator("..").locator("..");
  await expect(card).toBeVisible();
  // The boilerplate is not on screen; the card is.
  await expect(page.getByText("You've hit your usage limit")).toHaveCount(0);
  await expect(page.getByRole("button", { name: /retry when|reintentar cuando/i })).toBeVisible();
  await expect(page.getByText(/back in|vuelve en/i)).toBeVisible();
  await snap(page, "quota-card");
});

test("once retried, the card is one quiet line", async ({ page }) => {
  await openDemo(page, "chat");
  await seedQuotaDeath(page, true);
  await expect(page.getByRole("button", { name: /retry when|reintentar cuando/i })).toHaveCount(0);
  await expect(page.getByText(/· retried|· reintentado/i)).toBeVisible();
  await snap(page, "quota-card-retried");
});
