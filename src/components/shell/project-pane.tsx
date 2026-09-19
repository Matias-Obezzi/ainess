import { createContext, useContext } from "react";
import { useAppStore } from "@/store";

/**
 * The project one pane of the shell is showing. Only `ProjectScreen` provides it; everything it
 * draws asks for it instead of reading `currentProjectId`, so the same tree can be mounted twice
 * over two different projects without either half knowing about the other.
 */
const ProjectPaneContext = createContext<string | null>(null);

export const ProjectPaneProvider = ProjectPaneContext.Provider;

/**
 * The project of the pane this component is drawn in, or the focused one when it is drawn outside
 * a pane (the sidebar, the search palette, a dialog the shell owns).
 *
 * `currentProjectId` is not going away and does not change meaning: it is "the pane the user is
 * standing in", which is what the sidebar, the palette and the whole non-React half of the app —
 * `lib/history.ts`, `lib/bridge/`, `lib/system-hooks.ts`, the notification hooks — are asking for.
 * None of them has a pane to ask, and none of them should have to.
 */
export function useCurrentProjectId(): string | null {
  const paneId = useContext(ProjectPaneContext);
  const focused = useAppStore(state => state.currentProjectId);
  return paneId ?? focused;
}
