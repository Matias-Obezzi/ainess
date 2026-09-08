import { useEffect, useRef, useState, useMemo } from "react";
import { useAppStore, selectProject } from "@/store";
import { readDiff, DiffMode } from "@/lib/git-diff";
import { parseUnifiedDiff, DiffFile, diffTotals } from "@/lib/diff";
import { useT } from "@/i18n/useT";
import { plural } from "@/i18n";
import { EmptyState } from "@/components/ui/empty-state";
import { GitCompare, Loader2, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

export function DiffPanel() {
  const t = useT();
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const project = useAppStore(state => selectProject(state, state.currentProjectId));
  const repoState = useAppStore(state => currentProjectId ? state.repoState[currentProjectId] : undefined);
  const workspaceDir = project?.workspaceDir || "";
  
  const [mode, setMode] = useState<DiffMode>("working");
  const [files, setFiles] = useState<DiffFile[]>([]);
  const [untracked, setUntracked] = useState<string[]>([]);
  const [truncated, setTruncated] = useState(false);
  const [loading, setLoading] = useState(false);
  const [available, setAvailable] = useState(true);
  const [collapsedPaths, setCollapsedPaths] = useState<Set<string>>(new Set());

  const fetchedAt = repoState?.fetchedAt;
  const isRepo = repoState?.isRepo;

  const generation = useRef(0);
  
  const load = () => {
    if (!currentProjectId || !workspaceDir || isRepo === false) {
      setFiles([]);
      setUntracked([]);
      setTruncated(false);
      setAvailable(false);
      return;
    }
    
    setLoading(true);
    const gen = ++generation.current;
    readDiff(workspaceDir, mode).then(res => {
      if (generation.current !== gen) return;
      setLoading(false);
      setAvailable(res.available);
      if (res.available) {
        const parsedFiles = parseUnifiedDiff(res.text);
        setFiles(parsedFiles);
        setUntracked(res.untracked);
        setTruncated(res.truncated);
        
        setCollapsedPaths(prev => {
          const next = new Set(prev);
          for (const f of parsedFiles) {
            const lines = f.hunks.reduce((acc, h) => acc + h.lines.length, 0);
            if (lines > 400 && !next.has(f.path)) {
              next.add(f.path);
            }
          }
          return next;
        });
      } else {
        setFiles([]);
        setUntracked([]);
        setTruncated(false);
      }
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId, workspaceDir, mode, fetchedAt]);

  const toggleCollapsed = (path: string) => {
    setCollapsedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const totals = useMemo(() => diffTotals(files), [files]);

  if (isRepo === false || !available) {
    return (
      <div className="flex h-full flex-col">
        <EmptyState
          icon={GitCompare}
          title={t("diff.notARepo.title")}
          description={t("diff.notARepo.body")}
        />
      </div>
    );
  }

  const isEmpty = files.length === 0 && untracked.length === 0;

  return (
    <div className="flex h-full flex-col">
      <div className="flex items-center justify-between border-b border-border p-2">
        <Select value={mode} onValueChange={(v) => setMode(v as DiffMode)}>
          <SelectTrigger className="h-8 w-[150px]">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="working">{t("diff.mode.working")}</SelectItem>
            <SelectItem value="staged">{t("diff.mode.staged")}</SelectItem>
            <SelectItem value="head">{t("diff.mode.head")}</SelectItem>
          </SelectContent>
        </Select>

        <div className="flex items-center gap-3 text-xs">
          {!isEmpty && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{plural(totals.files, t("diff.files.one", { n: totals.files }), t("diff.files.other", { n: totals.files }))}</span>
              {totals.additions > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{totals.additions}</span>}
              {totals.deletions > 0 && <span className="text-rose-600 dark:text-rose-400">−{totals.deletions}</span>}
            </div>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" title={t("diff.refresh")} onClick={load}>
            {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2">
        {isEmpty ? (
          <EmptyState
            icon={GitCompare}
            title={t("diff.empty.title")}
            description={t("diff.empty.body")}
          />
        ) : (
          <div className="flex flex-col gap-4 pb-4">
            {truncated && (
              <div className="text-xs text-muted-foreground">{t("diff.truncated")}</div>
            )}
            
            {files.map(f => {
              const isCollapsed = collapsedPaths.has(f.path);
              const displayName = f.status === "renamed" ? `${f.oldPath} → ${f.path}` : f.path;
              
              return (
                <div key={f.path} className="flex flex-col rounded-md border border-border bg-card overflow-hidden">
                  <button
                    className="flex w-full items-center gap-2 bg-muted/30 px-2 py-1.5 text-left hover:bg-muted/50"
                    onClick={() => toggleCollapsed(f.path)}
                  >
                    {isCollapsed ? <ChevronRight className="h-3.5 w-3.5 shrink-0" /> : <ChevronDown className="h-3.5 w-3.5 shrink-0" />}
                    <span className="font-mono text-xs truncate flex-1">{displayName}</span>
                    <div className="flex items-center gap-2 text-[10px] shrink-0">
                      {f.additions > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{f.additions}</span>}
                      {f.deletions > 0 && <span className="text-rose-600 dark:text-rose-400">−{f.deletions}</span>}
                    </div>
                  </button>
                  
                  {!isCollapsed && (
                    <div className="overflow-x-auto border-t border-border bg-background">
                      {f.binary ? (
                        <div className="p-3 text-xs text-muted-foreground italic">{t("diff.binary")}</div>
                      ) : (
                        <div className="font-mono text-[11px] leading-[1.35] whitespace-pre min-w-max pb-1">
                          {f.hunks.map((h, i) => (
                            <div key={i}>
                              <div className="text-sky-600 dark:text-sky-400 bg-muted/50 px-2 py-0.5">{h.header}</div>
                              {h.lines.map((l, j) => (
                                <div
                                  key={j}
                                  className={cn(
                                    "px-2",
                                    l.kind === "add" && "bg-emerald-500/10 text-emerald-700 dark:text-emerald-400",
                                    l.kind === "del" && "bg-rose-500/10 text-rose-700 dark:text-rose-400",
                                    l.kind === "ctx" && "text-muted-foreground",
                                    l.kind === "meta" && "text-muted-foreground italic"
                                  )}
                                >
                                  {l.kind === "add" ? "+" : l.kind === "del" ? "-" : l.kind === "ctx" ? " " : ""}
                                  {l.text}
                                </div>
                              ))}
                            </div>
                          ))}
                        </div>
                      )}
                    </div>
                  )}
                </div>
              );
            })}
            
            {untracked.length > 0 && (
              <div className="mt-2 flex flex-col gap-1">
                <div className="text-xs font-medium">{plural(untracked.length, t("diff.untracked.one", { n: untracked.length }), t("diff.untracked.other", { n: untracked.length }))}</div>
                <ul className="flex flex-col gap-0.5">
                  {untracked.map(u => (
                    <li key={u} className="font-mono text-[11px] text-muted-foreground truncate">{u}</li>
                  ))}
                </ul>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
