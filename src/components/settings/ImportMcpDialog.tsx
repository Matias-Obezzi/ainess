import { useEffect, useMemo, useState } from "react";
import { useAppStore } from "@/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { toast } from "@/components/ui/toast";
import { Check } from "lucide-react";
import { useT } from "@/i18n/useT";
import { plural } from "@/i18n";
import { alreadyKnown, type DetectedMcp } from "@/lib/mcp-import";
import type { McpServer, Project } from "@/types";

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** What `detectMcpServers` found; null while it is still looking. */
  detected: DetectedMcp[] | null;
}

/** Folder paths compared the way the file system does on Windows: slashes and case aside. */
const samePath = (a: string, b: string) =>
  a.replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase() === b.replace(/[\\/]+$/, "").replace(/\\/g, "/").toLowerCase();

/** The ainess project a Claude Code project-scoped server belongs to, if it is one of them. */
function projectOf(projects: Project[], path: string | undefined): Project | undefined {
  return path ? projects.find(p => samePath(p.workspaceDir, path)) : undefined;
}

const keyOf = (d: DetectedMcp) => `${d.server.name}\u0000${d.project ?? ""}`;

/** Lets the user pick, out of what their other tools already have, what ainess should have too. */
export function ImportMcpDialog({ open, onOpenChange, detected }: Props) {
  const t = useT();
  const servers = useAppStore(state => state.config.mcpServers);
  const projects = useAppStore(state => state.config.projects);
  const upsertMcpServer = useAppStore(state => state.upsertMcpServer);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // What is new is ticked from the start. A server Claude Code keeps for one folder is only ticked
  // when that folder is an ainess project: anywhere else it belongs to work ainess knows nothing of.
  const preselected = useMemo(() => new Set(
    (detected ?? [])
      .filter(d => !alreadyKnown(servers, d.server) && (!d.project || projectOf(projects, d.project)))
      .map(keyOf),
  ), [detected, servers, projects]);
  useEffect(() => { if (open) setSelected(preselected); }, [open, preselected]);

  const toggle = (key: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(key)) next.delete(key); else next.add(key);
    return next;
  });

  const handleImport = () => {
    let count = 0;
    for (const d of detected ?? []) {
      if (!selected.has(keyOf(d))) continue;
      // Kept to the agents of the project it came from, when it came from one; everyone otherwise.
      const project = projectOf(projects, d.project);
      const enabledFor: McpServer["enabledFor"] = project ? project.agents.map(a => a.id) : "all";
      upsertMcpServer({ ...d.server, id: crypto.randomUUID(), enabledFor });
      count++;
    }
    if (count > 0) toast.success(plural(count, t("mcpImport.imported.one", { n: count }), t("mcpImport.imported.other", { n: count })));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>{t("mcpImport.title")}</DialogTitle>
          <DialogDescription>{t("mcpImport.description")}</DialogDescription>
        </DialogHeader>
        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
          {detected === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("mcpImport.loading")}</p>
          ) : detected.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("mcpImport.none")}</p>
          ) : (
            <div className="flex flex-col gap-2 py-2">
              {detected.map(d => {
                const key = keyOf(d);
                const already = alreadyKnown(servers, d.server);
                const isSelected = selected.has(key);
                const project = projectOf(projects, d.project);
                return (
                  <button
                    key={key}
                    type="button"
                    disabled={already}
                    aria-disabled={already}
                    onClick={() => toggle(key)}
                    className={`flex flex-col gap-1 rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div className={`flex size-4 shrink-0 items-center justify-center rounded border ${isSelected ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>
                        {isSelected && <Check className="size-3" />}
                      </div>
                      <span className="text-sm font-semibold">{d.server.name}</span>
                      {d.sources.map(source => (
                        <Badge key={source} variant="outline" className="text-[10px]">{t(`mcpImport.source.${source}`)}</Badge>
                      ))}
                      {already && <Badge variant="secondary" className="text-[10px]">{t("mcpImport.already")}</Badge>}
                    </div>
                    {/* What it runs or where it is — never the values of its variables or headers,
                        which is where the tokens are. */}
                    <code className="break-all pl-6 text-[11px] text-muted-foreground">
                      {d.server.transport === "stdio" ? `${d.server.command} ${(d.server.args ?? []).join(" ")}` : d.server.url}
                    </code>
                    {d.project && (
                      <p className="pl-6 text-[11px] text-muted-foreground">
                        {project ? t("mcpImport.projectKnown", { project: project.name }) : t("mcpImport.projectOther", { path: d.project })}
                      </p>
                    )}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <p className="text-[11px] text-muted-foreground">{t("mcpImport.secrets")}</p>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleImport} disabled={selected.size === 0}>{t("mcpImport.import", { n: selected.size })}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
