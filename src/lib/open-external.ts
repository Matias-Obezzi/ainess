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
 * The menu action: shows the folder and says so when it cannot, which is every build that is not
 * the desktop app (the browser preview, the phone) — there is no file manager to open there.
 */
export async function openFolder(path: string): Promise<void> {
  const { toast } = await import("@/components/ui/toast");
  const { translateNow } = await import("@/i18n/useT");
  if (!(await revealPath(path))) toast.error(translateNow("project.openFolderFailed"));
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
