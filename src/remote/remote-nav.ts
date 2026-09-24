// Navigation persistence for the phone remote. The desktop stores its open panes and tabs
// under ainess.ui; the phone runs a single-column layout with its own tab bar, so it keeps
// its last-known position separate under ainess.remote.ui.

export type Tab = "tasks" | "conversations" | "approvals" | "agents";

export interface RemoteNav {
  projectId: string | null;
  chatId: string | null;
  tab: Tab;
  threadOpen: boolean;
}

export const REMOTE_NAV_KEY = "ainess.remote.ui";

const VALID_TABS: readonly Tab[] = ["tasks", "conversations", "approvals", "agents"];

export function isTab(value: unknown): value is Tab {
  return typeof value === "string" && (VALID_TABS as readonly string[]).includes(value);
}

/**
 * Tolerant reader for stored remote navigation. Returns null on invalid JSON,
 * unexpected shapes, missing fields, or unrecognized tab names.
 * Legacy tabs "thread" and "chats" are mapped to "conversations" ("thread" sets threadOpen true).
 */
export function readRemoteNav(storage: Storage): RemoteNav | null {
  try {
    const raw = storage.getItem(REMOTE_NAV_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;

    if (parsed.threadOpen !== undefined && typeof parsed.threadOpen !== "boolean") {
      return null;
    }

    let tab: Tab;
    let threadOpen = Boolean(parsed.threadOpen);

    if (parsed.tab === "thread") {
      tab = "conversations";
      threadOpen = true;
    } else if (parsed.tab === "chats") {
      tab = "conversations";
      threadOpen = false;
    } else if (isTab(parsed.tab)) {
      tab = parsed.tab;
    } else {
      return null;
    }

    if (parsed.projectId !== null && typeof parsed.projectId !== "string" && parsed.projectId !== undefined) {
      return null;
    }
    if (parsed.chatId !== null && typeof parsed.chatId !== "string" && parsed.chatId !== undefined) {
      return null;
    }
    return {
      projectId: typeof parsed.projectId === "string" ? parsed.projectId : null,
      chatId: typeof parsed.chatId === "string" ? parsed.chatId : null,
      tab,
      threadOpen,
    };
  } catch {
    return null;
  }
}

/**
 * Persists the remote navigation state to storage. Swallows quota or private-mode errors
 * so the caller never crashes if storage is unavailable.
 */
export function writeRemoteNav(storage: Storage, nav: RemoteNav): void {
  try {
    storage.setItem(REMOTE_NAV_KEY, JSON.stringify(nav));
  } catch {
    // Quota exceeded, private mode disabled, or storage unavailable: ignore silently
  }
}

/**
 * Resolves saved navigation against the live snapshot.
 * - Missing state or gone project -> home (projectId: null, chatId: null, tab: "tasks", threadOpen: false)
 * - Existing chat -> keep project, chatId: saved.chatId, tab: "conversations", threadOpen: false
 * - Missing chat or chat belonging to another project -> keep project, chatId: null, tab: "conversations", threadOpen: false
 * - Existing project with no chat -> keep project, chatId: null, tab: saved.tab, threadOpen: saved.threadOpen
 */
export function restoreNav(
  saved: RemoteNav | null,
  projects: { id: string }[],
  chats: { id: string; projectId: string }[],
): RemoteNav {
  if (!saved || !saved.projectId) {
    return { projectId: null, chatId: null, tab: "tasks", threadOpen: false };
  }

  const projectExists = projects.some(p => p.id === saved.projectId);
  if (!projectExists) {
    return { projectId: null, chatId: null, tab: "tasks", threadOpen: false };
  }

  if (saved.chatId) {
    const chat = chats.find(c => c.id === saved.chatId);
    if (chat && chat.projectId === saved.projectId) {
      return { projectId: saved.projectId, chatId: saved.chatId, tab: "conversations", threadOpen: false };
    }
    return { projectId: saved.projectId, chatId: null, tab: "conversations", threadOpen: false };
  }

  return {
    projectId: saved.projectId,
    chatId: null,
    tab: saved.tab,
    threadOpen: saved.threadOpen,
  };
}
