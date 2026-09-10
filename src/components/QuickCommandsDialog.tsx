// The quick commands a project carries of its own, added and removed here.
//
// The ones read from a package.json or a Makefile need no screen — they are already written down
// somewhere else. This is for everything that is not: the docker compose line, the ssh tunnel, the
// one migration command this project needs and no file declares.
import { useState } from "react";
import { useAppStore, selectProject } from "@/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { useT } from "@/i18n/useT";
import { Plus, X } from "lucide-react";

export function QuickCommandsDialog({ projectId, open, onOpenChange }: {
  projectId: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const commands = useAppStore(state => selectProject(state, projectId)?.commands) ?? [];
  const addProjectCommand = useAppStore(state => state.addProjectCommand);
  const removeProjectCommand = useAppStore(state => state.removeProjectCommand);

  const [label, setLabel] = useState("");
  const [command, setCommand] = useState("");

  const add = () => {
    if (!label.trim() || !command.trim()) return;
    addProjectCommand(projectId, { label, command });
    setLabel("");
    setCommand("");
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("terminals.commands.title")}</DialogTitle>
          <DialogDescription>{t("terminals.commands.body")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3">
          {commands.length > 0 && (
            <ul className="flex flex-col gap-1">
              {commands.map(entry => (
                <li
                  key={entry.id}
                  className="flex items-center gap-2 rounded-md border border-border px-2 py-1.5"
                >
                  <span className="shrink-0 text-sm font-medium">{entry.label}</span>
                  <span className="min-w-0 flex-1 truncate font-mono text-xs text-muted-foreground">
                    {entry.command}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-6 w-6 shrink-0"
                    aria-label={t("terminals.commands.remove", { label: entry.label })}
                    onClick={() => removeProjectCommand(projectId, entry.id)}
                  >
                    <X className="h-3.5 w-3.5" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <div className="flex items-end gap-2">
            <div className="w-32 shrink-0 space-y-1.5">
              <Label htmlFor="qc-label" className="text-xs">{t("terminals.commands.label")}</Label>
              <Input
                id="qc-label"
                className="h-8"
                placeholder={t("terminals.commands.labelPlaceholder")}
                value={label}
                onChange={e => setLabel(e.target.value)}
              />
            </div>
            <div className="min-w-0 flex-1 space-y-1.5">
              <Label htmlFor="qc-command" className="text-xs">{t("terminals.commands.command")}</Label>
              <Input
                id="qc-command"
                className="h-8 font-mono text-xs"
                placeholder={t("terminals.commands.commandPlaceholder")}
                value={command}
                onChange={e => setCommand(e.target.value)}
                onKeyDown={e => {
                  if (e.key === "Enter") add();
                }}
              />
            </div>
            <Button
              size="sm"
              className="h-8 shrink-0"
              disabled={!label.trim() || !command.trim()}
              onClick={add}
            >
              <Plus className="h-3.5 w-3.5" /> {t("common.add")}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
