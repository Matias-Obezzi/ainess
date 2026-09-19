import { useCallback, useEffect, useState } from "react";
import { useAppStore } from "@/store";
import { panesThatFit, visiblePanes } from "@/lib/project-panes";
import { ProjectScreen } from "./ProjectScreen";
import { cn } from "@/lib/utils";

/**
 * The project screen, once per open project, in columns of equal width.
 *
 * How many columns there is room for is decided from the width of this container, not the
 * window's: the sidebar opens and closes and the dock is dragged, and neither of those changes
 * `window.innerWidth`. The projects that do not fit stay open in the store and come back on their
 * own when the window is widened.
 */
export function ProjectPanes() {
  const openProjects = useAppStore(state => state.openProjects);
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const closeProjectPane = useAppStore(state => state.closeProjectPane);
  const focusProjectPane = useAppStore(state => state.focusProjectPane);

  const [width, setWidth] = useState(0);
  // A callback ref rather than an effect: the container is this component's own element and is
  // there the moment it mounts, and this is the pattern the composer already watches its box with.
  const attach = useCallback((el: HTMLDivElement | null) => {
    if (!el) return;
    setWidth(el.clientWidth);
    const observer = new ResizeObserver(entries => setWidth(entries[0].contentRect.width));
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  // Before the first measurement there is one pane, which is the shape of a single-project window
  // and what every pane count collapses to anyway.
  const ids = visiblePanes(openProjects, currentProjectId, width > 0 ? panesThatFit(width) : 1);
  const single = ids.length <= 1;

  // A project may be open in a pane that does not fit; the focus belongs to one that is showing.
  const shownFocus = currentProjectId && ids.includes(currentProjectId) ? currentProjectId : ids[0] ?? null;
  useEffect(() => {
    if (shownFocus && shownFocus !== currentProjectId) focusProjectPane(shownFocus);
  }, [shownFocus, currentProjectId, focusProjectPane]);

  // With nothing open at all, one pane on the focused project: that is `ProjectScreen`'s own empty
  // state, and it is what says "pick a project" rather than a blank screen.
  if (ids.length === 0) {
    return (
      <div ref={attach} className="flex-1 min-h-0 flex">
        <ProjectScreen />
      </div>
    );
  }

  return (
    <div ref={attach} className="flex-1 min-h-0 flex" data-testid="project-panes">
      {ids.map((id, index) => (
        <div
          key={id}
          data-testid="project-pane"
          data-project-id={id}
          data-focused={id === currentProjectId ? "1" : undefined}
          // Capture, so the focus moves before anything inside answers the click: a button in
          // another pane still does what it says, it just does it in the pane that now has the
          // focus. Nothing is cancelled here.
          onPointerDownCapture={() => focusProjectPane(id)}
          className={cn(
            "flex-1 min-w-0 flex flex-col relative",
            index > 0 && "border-l border-border",
            // One pane is not "the focused one", it is the screen: marking it says nothing.
            // A line around the column, not a glow or a dimmed neighbour: enough to find where
            // the typing goes, quiet enough to read four of them side by side.
            !single && id === currentProjectId && "ring-1 ring-inset ring-primary/70",
          )}
        >
          <ProjectScreen projectId={id} onClose={single ? undefined : () => closeProjectPane(id)} />
        </div>
      ))}
    </div>
  );
}
