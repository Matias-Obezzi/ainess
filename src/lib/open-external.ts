import { isTauri } from "@/lib/tauri";

/** Opens a URL in the system browser: the Tauri opener plugin inside the app, `window.open` in the browser preview. */
export async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
      return;
    } catch {
      /* fall through to the browser */
    }
  }
  window.open(url, "_blank", "noopener");
}

/**
 * Shows a folder (or a file) in the system file manager. Uses `revealItemInDir`, which the
 * opener plugin allows by default: `openPath` would mean widening the plugin's scope to every
 * path on the machine. Answers false when there is nothing to open (browser preview).
 */
export async function revealPath(path: string): Promise<boolean> {
  if (!path || !isTauri()) return false;
  try {
    const { revealItemInDir } = await import("@tauri-apps/plugin-opener");
    await revealItemInDir(path);
    return true;
  } catch {
    return false;
  }
}
