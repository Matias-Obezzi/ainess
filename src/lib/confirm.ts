import { island } from "@/components/ui/island";

/**
 * Asks before a destructive action, in the same voice everywhere:
 * `confirmDelete("la skill", "Commits convencionales")`.
 */
export function confirmDelete(what: string, name?: string, detail?: string): Promise<boolean> {
  return island.confirm({
    title: `¿Eliminar ${what}?`,
    description: [name ? `Se eliminará «${name}».` : "", detail ?? "Esta acción no se puede deshacer."].filter(Boolean).join(" "),
    destructive: true,
  });
}
