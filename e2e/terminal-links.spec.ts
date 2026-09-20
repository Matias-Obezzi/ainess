// What a click on a URL in the terminal actually opens.
//
// The report: a dev server printed `http://localhost:3000`, it did not fit in one row, and the
// click opened `http://localhost:30` — the half that fitted. Both ways of printing a URL are
// covered here, because they take different paths: plain text is found by
// `@xterm/addon-web-links`, and an OSC 8 hyperlink is found by xterm's own provider and handed to
// `linkHandler`. Both are wired in `src/lib/terminal-registry.ts`.
//
// A row xterm wrapped itself was never the problem; a row ConPTY broke with a real newline was.
// That is the last test here, and it only means anything on Windows.
import { test, expect, type Page } from "@playwright/test";
import { openDemo } from "./demo";

/** Narrow on purpose: `http://localhost:3000` is 21 characters and has to cross a row. */
const COLS = 24;
const ROWS = 8;

declare global {
  interface Window {
    __opened?: string[];
  }
}

/**
 * Puts one terminal on the screen with `data` written into it, and records every URL the app asks
 * the system to open. Outside the dock on purpose: the click path under test is the registry's,
 * not the panel's, and a bare host keeps the geometry easy to aim at.
 */
async function terminalWith(page: Page, data: string, cols = COLS): Promise<void> {
  await page.evaluate(async ({ data, cols, rows }) => {
    window.__opened = [];
    // `openExternal` falls back to `window.open` outside the desktop app, which is where the
    // click ends up in the browser preview these tests run in.
    window.open = ((url: string) => {
      window.__opened!.push(String(url));
      return null;
    }) as typeof window.open;

    const container = document.createElement("div");
    container.id = "link-probe";
    container.style.cssText = "position:fixed;left:0;top:0;width:640px;height:320px;z-index:9999;background:#000";
    document.body.appendChild(container);

    const registry = await import("/src/lib/terminal-registry.ts");
    const entry = registry.ensureTerminal(
      { id: "link-probe", title: "probe", shellId: "sh", shellPath: "sh", cwd: "/", projectId: null },
      container,
    );
    entry.term.resize(cols, rows);
    // `windowsPty` is decided asynchronously, before the shell is spawned. Nothing may be written
    // until then or the first lines would be read with the wrong idea of what wrapped.
    for (let i = 0; i < 40 && !entry.term.options.windowsPty?.backend; i++) {
      await new Promise<void>(resolve => setTimeout(resolve, 5));
    }
    // The spawn fails here — there is no PTY in the browser preview — and says so in the terminal.
    // Wiped, so the line under test is the first one and its row is where it is expected to be.
    await new Promise<void>(resolve => setTimeout(resolve, 100));
    entry.term.reset();
    await new Promise<void>(resolve => entry.term.write(data, resolve));
    await new Promise<void>(resolve => requestAnimationFrame(() => resolve()));
  }, { data, cols, rows: ROWS });
}

/** Clicks the middle of one cell of the grid, moving the mouse there first so the link is found. */
async function clickCell(page: Page, col: number, row: number, cols = COLS): Promise<void> {
  const box = await page.locator("#link-probe .xterm-rows").boundingBox();
  if (!box) throw new Error("the terminal was not drawn");
  const x = box.x + (col + 0.5) * (box.width / cols);
  const y = box.y + (row + 0.5) * (box.height / ROWS);
  await page.mouse.move(x, y);
  await page.waitForTimeout(50);
  await page.mouse.down();
  await page.mouse.up();
  await page.waitForTimeout(50);
}

async function opened(page: Page): Promise<string[]> {
  return page.evaluate(() => window.__opened ?? []);
}

const URL_UNDER_TEST = "http://localhost:3000";
/** Six characters, so the 21 of the URL run past column 24 and the tail lands on the next row. */
const PREFIX = "Local ";
/** `ESC ]8;; URL ST text ESC ]8;; ST` — the URL travels in the escape, not in what is on screen. */
const osc8 = (uri: string, text: string) => `\x1b]8;;${uri}\x1b\\${text}\x1b]8;;\x1b\\`;

test.beforeEach(async ({ page }) => {
  await openDemo(page, "chat");
});

test("a URL that fits in one row opens whole", async ({ page }) => {
  await terminalWith(page, `go ${URL_UNDER_TEST.slice(0, 16)}\r\n`);
  await clickCell(page, 8, 0);
  expect(await opened(page)).toEqual(["http://localhost"]);
});

test("a plain-text URL split across two rows opens whole", async ({ page }) => {
  await terminalWith(page, `${PREFIX}${URL_UNDER_TEST}\r\n`);
  // Column 12 is inside `localhost`, on the first of the two rows.
  await clickCell(page, 12, 0);
  expect(await opened(page)).toEqual([URL_UNDER_TEST]);
});

test("an OSC 8 URL split across two rows opens whole", async ({ page }) => {
  await terminalWith(page, `${PREFIX}${osc8(URL_UNDER_TEST, URL_UNDER_TEST)}\r\n`);
  await clickCell(page, 12, 0);
  expect(await opened(page)).toEqual([URL_UNDER_TEST]);
});

test("an OSC 8 URL behind a label opens the address, not the label", async ({ page }) => {
  await terminalWith(page, `${PREFIX}${osc8(URL_UNDER_TEST, "el servidor")}\r\n`);
  await clickCell(page, 9, 0);
  expect(await opened(page)).toEqual([URL_UNDER_TEST]);
});

test("the tail row of a split URL opens the whole URL too", async ({ page }) => {
  await terminalWith(page, `${PREFIX}${URL_UNDER_TEST}\r\n`);
  // The `00` that spilled onto the second row.
  await clickCell(page, 1, 1);
  expect(await opened(page)).toEqual([URL_UNDER_TEST]);
});

// The bug as it really happened. ConPTY prints a real newline where the row ended instead of
// telling the terminal that it wrapped, so the two halves are two lines and there is nothing left
// to join — unless `windowsPty` has xterm guess the wrap back, which is what this checks. The
// guess is Windows-only by design, so on any other machine there is nothing to assert.
test("a URL ConPTY broke with a real newline still opens whole", async ({ page }) => {
  test.skip(process.platform !== "win32", "the ConPTY heuristic is only turned on for Windows");
  await terminalWith(page, `${PREFIX}http://localhost:30\r\n00\r\n`, 25);
  await clickCell(page, 12, 0, 25);
  expect(await opened(page)).toEqual([URL_UNDER_TEST]);
});
