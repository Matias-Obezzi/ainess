import { X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store";
import { useT } from "@/i18n/useT";
import { DiffPanel } from "@/components/DiffPanel";

export function DiffDockSection() {
  const t = useT();
  const toggleDiffPanel = useAppStore(state => state.toggleDiffPanel);

  return (
    <div className="flex h-full flex-col">
      <div className="flex shrink-0 items-center justify-between border-b border-border bg-muted/30 px-3 py-2">
        <div className="flex flex-col">
          <span className="text-sm font-medium leading-none">{t("dock.diff.title")}</span>
          <span className="text-[10px] text-muted-foreground mt-1">{t("dock.diff.subtitle")}</span>
        </div>
        <Button
          variant="ghost"
          size="icon"
          className="h-6 w-6 rounded-md hover:bg-muted"
          onClick={() => toggleDiffPanel(false)}
        >
          <X className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
      <div className="flex-1 min-h-0">
        <DiffPanel />
      </div>
    </div>
  );
}
