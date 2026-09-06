import { useState } from "react";
import { useAppStore } from "@/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { SUGGESTED_MCP, SUGGESTED_SKILLS } from "@/lib/suggested";
import { toast } from "@/components/ui/toast";
import { Check } from "lucide-react";
import { useT } from "@/i18n/useT";
import { plural } from "@/i18n";

interface Props {
  kind: "mcp" | "skill";
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

/** Curated list of MCP servers or skills the user can add in one click (checkbox-style picker). */
export function SuggestedDialog({ kind, open, onOpenChange }: Props) {
  const t = useT();
  const config = useAppStore(state => state.config);
  const upsertSkill = useAppStore(state => state.upsertSkill);
  const upsertMcpServer = useAppStore(state => state.upsertMcpServer);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  const items: Array<{ name: string; description: string; requires?: string; command?: string; args?: string[] }> = kind === "mcp"
    ? SUGGESTED_MCP.map(m => ({ name: m.name, description: m.description, requires: m.requires, command: m.command, args: m.args }))
    : SUGGESTED_SKILLS.map(s => ({ name: s.name, description: s.description || "" }));

  const existingNames = new Set((kind === "mcp" ? config.mcpServers : config.skills).map(i => i.name));

  const toggle = (name: string) => {
    setSelected(prev => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const handleAdd = () => {
    let count = 0;
    if (kind === "mcp") {
      for (const item of SUGGESTED_MCP) {
        if (!selected.has(item.name)) continue;
        const { description, requires, ...server } = item;
        void description; void requires;
        upsertMcpServer({ ...server, id: crypto.randomUUID(), enabledFor: "all" });
        count++;
      }
    } else {
      for (const item of SUGGESTED_SKILLS) {
        if (!selected.has(item.name)) continue;
        upsertSkill({ ...item, id: crypto.randomUUID(), enabledFor: "all" });
        count++;
      }
    }
    if (count > 0) toast.success(plural(count, t("suggested.added.one", { n: count }), t("suggested.added.other", { n: count })));
    setSelected(new Set());
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>{kind === "mcp" ? t("suggested.mcpTitle") : t("suggested.skillsTitle")}</DialogTitle>
        </DialogHeader>
        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
          <div className="flex flex-col gap-2 py-2">
            {items.map(item => {
              const already = existingNames.has(item.name);
              const isSelected = selected.has(item.name);
              return (
                <button
                  key={item.name}
                  type="button"
                  disabled={already}
                  aria-disabled={already}
                  onClick={() => toggle(item.name)}
                  className={`flex flex-col gap-1 rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"}`}
                >
                  <div className="flex items-center gap-2">
                    <div className={`flex size-4 shrink-0 items-center justify-center rounded border ${isSelected ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>
                      {isSelected && <Check className="size-3" />}
                    </div>
                    <span className="font-semibold text-sm">{item.name}</span>
                    {already && <Badge variant="secondary" className="text-[10px]">{t("suggested.alreadyAdded")}</Badge>}
                  </div>
                  <p className="pl-6 text-xs text-muted-foreground">{item.description}</p>
                  {item.command && (
                    <code className="pl-6 text-[11px] text-muted-foreground">{item.command} {(item.args || []).join(" ")}</code>
                  )}
                  {item.requires && (
                    <p className="pl-6 text-[11px] text-amber-600 dark:text-amber-400">⚠ {item.requires}</p>
                  )}
                </button>
              );
            })}
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleAdd} disabled={selected.size === 0}>
            {t("suggested.addSelected", { n: selected.size })}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
