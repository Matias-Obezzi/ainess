// How many projects fit side by side, and which ones are the ones on screen.
//
// Pure on purpose: the only input is a width the shell measured (see `ProjectPanes`), so the rule
// can be pinned by tests instead of by looking at a window.

/**
 * The narrowest a project pane may be. Below this the top bar drops every label to its icon and
 * the composer stops being a place anyone would write in, so a fifth of a screen is not a pane,
 * it is a sliver. Measured against the real bar: `@xl` (576px) is where the branch and the usage
 * button go, `@5xl` where the dock buttons lose their words — 420 keeps the tabs and the box
 * usable and is what the two-pane layout lands on in a 1080p window.
 */
export const PROJECT_PANE_MIN_WIDTH = 420;

/**
 * More than four projects at once is not a screen anyone reads, and every extra pane is a whole
 * project tree rendering and subscribing for nobody.
 */
export const MAX_PROJECT_PANES = 4;

/** How many panes fit in `availableWidth` px. Always at least one: something has to be showing. */
export function panesThatFit(availableWidth: number, minWidth: number = PROJECT_PANE_MIN_WIDTH): number {
  if (!Number.isFinite(availableWidth) || availableWidth <= 0 || minWidth <= 0) return 1;
  return Math.max(1, Math.min(MAX_PROJECT_PANES, Math.floor(availableWidth / minWidth)));
}

/**
 * The panes actually drawn: the first `count` of what is open, except that the focused one is
 * never the one left out. The rest stay in `openProjects` — they are not closed, they come back
 * when the window is widened.
 */
export function visiblePanes(openProjects: string[], focused: string | null, count: number): string[] {
  if (count >= openProjects.length) return openProjects;
  const shown = openProjects.slice(0, Math.max(1, count));
  if (focused && openProjects.includes(focused) && !shown.includes(focused)) {
    shown[shown.length - 1] = focused;
  }
  return shown;
}
