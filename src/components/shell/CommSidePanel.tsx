import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { CommunicationPanel } from "@/components/CommunicationPanel";
import { X } from "lucide-react";

/** Right dock with the raw agent-to-agent feed. */
export function CommSidePanel() {
  const toggleCommPanel = useAppStore(state => state.toggleCommPanel);

  return (
    // Under ~1100px it floats over the thread instead of squeezing it.
    <aside className="w-[380px] shrink-0 border-l border-border bg-card flex flex-col max-[1100px]:absolute max-[1100px]:right-0 max-[1100px]:top-0 max-[1100px]:bottom-0 max-[1100px]:z-20 max-[1100px]:shadow-xl">
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
    </aside>
  );
}
