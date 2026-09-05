import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { CommunicationPanel } from "@/components/CommunicationPanel";
import { X } from "lucide-react";

/**
 * Communication section of the right dock: the raw agent-to-agent feed.
 * The dock (`RightDock`) owns the `<aside>`; this is just a full-height block.
 */
export function CommDockSection() {
  const toggleCommPanel = useAppStore(state => state.toggleCommPanel);

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="px-3 py-2 border-b border-border flex items-start gap-2 shrink-0">
        <div className="flex flex-col min-w-0">
          <span className="text-sm font-semibold">Comunicación</span>
          <span className="text-[11px] text-muted-foreground truncate">Todo lo que se dicen los agentes y vos</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-7 w-7 ml-auto shrink-0"
          title="Cerrar"
          onClick={() => toggleCommPanel(false)}
        >
          <X className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex-1 min-h-0">
        <CommunicationPanel />
      </div>
    </div>
  );
}
