import { toast } from "@/components/ui/toast";

/**
 * Copies `text` and says so, in the same voice everywhere:
 * `copyText(project.workspaceDir, "Ruta copiada")`.
 */
export async function copyText(text: string, message: string): Promise<void> {
  try {
    await navigator.clipboard.writeText(text);
    toast.success(message);
  } catch {
    toast.error("No se pudo copiar");
  }
}
