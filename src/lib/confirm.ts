import { island } from "@/components/ui/island";
import { translateNow } from "@/i18n/useT";

/**
 * Asks before a destructive action, in the same voice everywhere. The title is a whole sentence
 * already translated by the caller: `confirmDelete(t("skills.delete.title"), skill.name)`.
 */
export function confirmDelete(title: string, name?: string, detail?: string): Promise<boolean> {
  return island.confirm({
    title,
    description: [
      name ? translateNow("confirm.willDelete", { name }) : "",
      detail ?? translateNow("confirm.cannotUndo"),
    ].filter(Boolean).join(" "),
    destructive: true,
  });
}
