// A file an agent names is a button, and the button opens a panel beside the conversation.
import { test, expect } from "@playwright/test";
import { openDemo, snap } from "./demo";

test("a path in an answer opens the file panel", async ({ page }) => {
  await openDemo(page, "chat");
  // A finished turn of the planner naming two files, the way answers do.
  await page.evaluate(() => {
    type Store = { getState(): { currentProjectId: string; runs: Record<string, unknown>; config: { projects: Array<{ id: string; agents: Array<{ id: string; role: string }> }> } }; setState(patch: object): void };
    const store = (window as unknown as { __ainess: Store }).__ainess;
    const state = store.getState();
    const project = state.config.projects.find(p => p.id === state.currentProjectId)!;
    const planner = project.agents.find(a => a.role === "planner")!;
    const run = {
      id: "e2e-path-run", projectId: project.id, agentId: planner.id, parentRunId: null, rootRunId: "e2e-path-run",
      prompt: "¿Dónde quedó el plan?", status: "done", startedAt: Date.now() - 20_000, endedAt: Date.now() - 10_000,
      output: "Dejé el plan en .claude/handoff/007-preview.md y el cambio en `src/lib/file-preview.ts:12`.",
      rawLines: [], childRunIds: [], round: 0,
    };
    store.setState({ runs: { ...state.runs, [run.id]: run } });
  });
  const chips = page.getByTestId("path-chip");
  await expect(chips).toHaveCount(2);
  await chips.last().click();
  const panel = page.getByTestId("file-preview");
  await expect(panel).toBeVisible();
  await expect(panel).toContainText("file-preview.ts");
  await snap(page, "file-preview");
});
