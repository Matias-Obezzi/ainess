// Navigation persistence for the phone remote. The desktop stores its open panes and tabs
// under ainess.ui; the phone runs a single-column layout with its own tab bar, so it keeps
// its last-known position separate under ainess.remote.ui.

export type Tab = "tasks" | "thread" | "chats" | "approvals" | "agents";

export interface RemoteNav {
  projectId: string | null;
  chatId: string | null;
  tab: Tab;
}

export const REMOTE_NAV_KEY = "ainess.remote.ui";

const VALID_TABS: readonly Tab[] = ["tasks", "thread", "chats", "approvals", "agents"];

export function isTab(value: unknown): value is Tab {
  return typeof value === "string" && (VALID_TABS as readonly string[]).includes(value);
}

/**
 * Tolerant reader for stored remote navigation. Returns null on invalid JSON,
 * unexpected shapes, missing fields, or unrecognized tab names.
 */
export function readRemoteNav(storage: Storage): RemoteNav | null {
  try {
    const raw = storage.getItem(REMOTE_NAV_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return null;
    if (!isTab(parsed.tab)) return null;
    if (parsed.projectId !== null && typeof parsed.projectId !== "string" && parsed.projectId !== undefined) {
      return null;
    }
    if (parsed.chatId !== null && typeof parsed.chatId !== "string" && parsed.chatId !== undefined) {
      return null;
    }
    return {
      projectId: typeof parsed.projectId === "string" ? parsed.projectId : null,
      chatId: typeof parsed.chatId === "string" ? parsed.chatId : null,
      tab: parsed.tab,
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
 * - Missing state or gone project -> home (projectId: null, chatId: null, tab: "tasks")
 * - Missing chat or chat belonging to another project -> keep project, chatId: null, tab: "thread"
 * - Existing chat -> keep project, chatId: saved.chatId, tab: "chats"
 * - Existing project with no chat -> keep project, chatId: null, tab: saved.tab
 */
export function restoreNav(
  saved: RemoteNav | null,
  projects: { id: string }[],
  chats: { id: string; projectId: string }[],
): RemoteNav {
  if (!saved || !saved.projectId) {
    return { projectId: null, chatId: null, tab: "tasks" };
  }

  const projectExists = projects.some(p => p.id === saved.projectId);
  if (!projectExists) {
    return { projectId: null, chatId: null, tab: "tasks" };
  }

  if (saved.chatId) {
    const chat = chats.find(c => c.id === saved.chatId);
    if (chat && chat.projectId === saved.projectId) {
      return { projectId: saved.projectId, chatId: saved.chatId, tab: "chats" };
    }
    return { projectId: saved.projectId, chatId: null, tab: "thread" };
  }

  return { projectId: saved.projectId, chatId: null, tab: saved.tab };
}
