// Asking before something irreversible, in one voice.
//
// There are two shapes for the same question and each build gets the one that fits it: a dialog on
// the desktop, where a modal is the convention and Enter/Escape answer it, and the island on the
// phone, where a box in the middle of the screen is the wrong shape for a thumb. Components shared
// by both builds just call `confirm` and never learn which one they are running in.
import { island } from "@/components/ui/island";
import { askInDialog, dialogAvailable, type ConfirmRequest } from "@/components/ui/confirm-dialog";
import { isRemoteBuild } from "@/lib/platform";
import { translateNow } from "@/i18n/useT";

export type { ConfirmRequest };

export function confirm(request: ConfirmRequest): Promise<boolean> {
  // No host mounted (a test, a component rendered on its own): the island still answers.
  if (isRemoteBuild() || !dialogAvailable()) return island.confirm(request);
  return askInDialog(request);
}

/**
 * The destructive case, worded the same everywhere. The title is a whole sentence already
 * translated by the caller: `confirmDelete(t("skills.delete.title"), skill.name)`.
 */
export function confirmDelete(title: string, name?: string, detail?: string): Promise<boolean> {
  return confirm({
    title,
    description: [
      name ? translateNow("confirm.willDelete", { name }) : "",
      detail ?? translateNow("confirm.cannotUndo"),
    ].filter(Boolean).join(" "),
    destructive: true,
    confirmText: translateNow("common.delete"),
  });
}
