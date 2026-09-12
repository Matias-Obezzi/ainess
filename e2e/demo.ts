// Opening the made-up workspace on a given screen, and waiting until it is drawn — not mounted,
// drawn: `data-demo-ready` is set from a frame after the store settled (see `src/main.tsx`).
import { expect, type Page, type Locator } from "@playwright/test";
import type { DemoScreen } from "../src/demo/install";

export async function openDemo(page: Page, screen: DemoScreen): Promise<void> {
  await page.goto(`/?demo=${screen}`);
  // Long, because the first time vite serves a screen it transforms it, and three tests may be
  // asking at once.
  await expect(page.locator('html[data-demo-ready="1"]')).toBeAttached({ timeout: 30_000 });
}

/**
 * Marks every agent of the open project idle. The made-up workspace is an afternoon in progress —
 * the planner is waiting on its implementer — and a message sent to a busy team is queued, not
 * sent. A test about what a sent message looks like needs a team that can take it.
 */
export async function freeTheTeam(page: Page): Promise<void> {
  await page.evaluate(() => {
    type Store = { getState(): { currentProjectId: string | null; runtime: Record<string, Record<string, { status: string; currentRunId?: string }>> }; setState(patch: object): void };
    const store = (window as unknown as { __ainess: Store }).__ainess;
    const state = store.getState();
    const projectId = state.currentProjectId;
    if (!projectId) return;
    const project = Object.fromEntries(
      Object.entries(state.runtime[projectId] ?? {}).map(([id, rt]) => [id, { ...rt, status: "idle", currentRunId: undefined }]),
    );
    store.setState({ runtime: { ...state.runtime, [projectId]: project } });
  });
}

/** The composer's textarea and the layer under it that draws the words. */
export function composer(page: Page): { input: Locator; layer: Locator } {
  return {
    input: page.getByTestId("composer-input"),
    layer: page.getByTestId("composer-layer"),
  };
}

/**
 * Nothing between `el` and the document may have been scrolled without a scrollbar to scroll it
 * back. That is what turned the chat black: `scrollIntoView` scrolled an `overflow: hidden`
 * ancestor, and the content slid out of the window with no way back.
 */
export async function expectNoHiddenScroll(el: Locator): Promise<void> {
  const offenders = await el.evaluate(node => {
    const out: string[] = [];
    let cursor: HTMLElement | null = (node as HTMLElement).parentElement;
    while (cursor) {
      const style = getComputedStyle(cursor);
      const hidden = style.overflowY === "hidden" || style.overflowX === "hidden";
      if (hidden && (cursor.scrollTop > 0 || cursor.scrollLeft > 0)) {
        out.push(`${cursor.tagName.toLowerCase()}.${[...cursor.classList].slice(0, 3).join(".")} scrollTop=${cursor.scrollTop}`);
      }
      cursor = cursor.parentElement;
    }
    return out;
  });
  expect(offenders, "an overflow:hidden ancestor was scrolled").toEqual([]);
}

/** Saved for a person to look at, next to the test's other output. Not compared to anything. */
export async function snap(page: Page, name: string, target?: Locator): Promise<void> {
  const path = `e2e/shots/${name}.png`;
  if (target) await target.screenshot({ path });
  else await page.screenshot({ path });
}
