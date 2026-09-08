import { isTauri } from "@/lib/tauri";

/** Schemes that must never become a link: they run in the page, and agent output is not trusted. */
const DANGEROUS = /^(javascript|data|vbscript|blob|file):/i;

/**
 * Anything of the shape `scheme:` — handed to the system as it is. Two characters at least, so a
 * Windows path (`C:/Users/…`) is read as the path it is and not as a scheme called "c".
 */
const HAS_SCHEME = /^[a-z][a-z0-9+.-]+:/i;

/**
 * `www.foo.dev/x`: a web address markdown left the scheme off. Only `www.`, deliberately —
 * `README.md` and `foo.ts` have exactly the shape of a host with a TLD (`.md` is Moldova's), and
 * sending somebody to a website because their agent linked a file is worse than not linking it.
 */
const BARE_HOST = /^www\.[\w-]+\.[\w-]+/;

/**
 * `href` as an address the system browser can open, or `null` when it is not one.
 *
 * A relative path (`src/lib/foo.ts`, `#section`) is not: it is a place in the repo, and left on an
 * `<a href>` the app itself would follow it — which inside the desktop window means navigating to
 * `tauri.localhost/src/lib/foo.ts` and losing the app. Agents write those links constantly.
 */
export function webUrl(href: string | undefined): string | null {
  const clean = (href ?? "").trim();
  if (!clean || DANGEROUS.test(clean)) return null;
  if (clean.startsWith("//")) return `https:${clean}`;
  if (HAS_SCHEME.test(clean)) return clean;
  if (BARE_HOST.test(clean)) return `https://${clean}`;
  return null;
}

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
