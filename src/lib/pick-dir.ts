// Asking the operating system for a folder.
//
// Two screens need this now — the project dialog and the home screen's start box — and both of them
// have to say the same two things when it cannot be done: that the browser build has no way to
// reach the filesystem, and that the dialog itself failed. One place, so they cannot drift.
import { open } from "@tauri-apps/plugin-dialog";
import { toast } from "@/components/ui/toast";
import { isTauri } from "@/lib/tauri";
import { translateNow } from "@/i18n/useT";

/**
 * The folder the user picked, or null.
 *
 * Null covers all three ways there is no folder — cancelled, unavailable, failed — because the
 * caller does the same thing in each: nothing. The two that are worth telling the user about say so
 * themselves on the way out.
 */
/**
 * A file the user picked, or null — same three ways there is none as `pickWorkspaceDir`. `extensions`
 * narrows the dialog to those kinds (without the dot); `directory` asks for a folder instead.
 */
export async function pickPath(opts: { extensions?: string[]; label?: string; directory?: boolean } = {}): Promise<string | null> {
  if (!isTauri()) {
    toast.error(translateNow("projectDialog.webUnavailable"));
    return null;
  }
  try {
    const selected = await open({
      directory: opts.directory ?? false,
      multiple: false,
      ...(opts.extensions ? { filters: [{ name: opts.label ?? opts.extensions.join(", "), extensions: opts.extensions }] } : {}),
    });
    return typeof selected === "string" ? selected : null;
  } catch {
    toast.error(translateNow("projectDialog.dialogFailed"));
    return null;
  }
}

export async function pickWorkspaceDir(): Promise<string | null> {
  if (!isTauri()) {
    toast.error(translateNow("projectDialog.webUnavailable"));
    return null;
  }
  try {
    const selected = await open({ directory: true, multiple: false });
    return typeof selected === "string" ? selected : null;
  } catch {
    toast.error(translateNow("projectDialog.dialogFailed"));
    return null;
  }
}
