// The catalogue of board providers: what the picker in the project dialog offers, and how a
// project's saved choice turns into something that actually reads and writes.
import { githubProjectsBoardProvider } from "@/lib/board/github-projects";
import { localBoardProvider } from "@/lib/board/local";
import type { BoardProvider } from "@/lib/board/provider";
import type { BoardProviderId, Project } from "@/types";

export interface BoardProviderMeta {
  id: BoardProviderId;
  labelKey: string;
  /** Whether it can be picked today. The remote ones are declared and not yet built. */
  available: boolean;
}

/** Every provider the app knows about, in the order the picker shows them. */
export const BOARD_PROVIDERS: BoardProviderMeta[] = [
  { id: "local", labelKey: "board.provider.local", available: true },
  { id: "github-projects", labelKey: "board.provider.github-projects", available: true },
  { id: "trello", labelKey: "board.provider.trello", available: false },
  { id: "jira", labelKey: "board.provider.jira", available: false },
];

/** The ones that can read and write. An id missing here is declared and not yet built. */
const IMPLEMENTED: Partial<Record<BoardProviderId, BoardProvider>> = {
  local: localBoardProvider,
  "github-projects": githubProjectsBoardProvider,
};

/**
 * The provider a project's board goes through. Always one that works: a config written by hand, or
 * by a newer version of the app, can name a provider this build has never heard of, or one that is
 * declared and not yet built, and a board that does not load because of that is worse than a local
 * board. So anything missing, unknown or unavailable falls back to the local one — which is also
 * what `Project.board === undefined` means, for every project that existed before this seam.
 */
export function boardProviderFor(project: Project | undefined): BoardProvider {
  const id = project?.board?.provider;
  if (!id) return localBoardProvider;
  const meta = BOARD_PROVIDERS.find(p => p.id === id);
  if (!meta?.available) return localBoardProvider;
  return IMPLEMENTED[id] ?? localBoardProvider;
}
