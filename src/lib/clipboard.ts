import { toast } from "@/components/ui/toast";
import { translateNow } from "@/i18n/useT";

/**
 * Copies `text` and says so, in the same voice everywhere:
 * `copyText(project.workspaceDir, t("sidebar.pathCopied"))`.
 *
 * Answers whether the clipboard took it, for the callers that only go on if it did — a cut that
 * could not copy must not delete.
 */
export async function copyText(text: string, message: string): Promise<boolean> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
    return true;
  } catch {
    toast.error(translateNow("common.copyFailed"));
    return false;
  }
}
