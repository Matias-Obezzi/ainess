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
