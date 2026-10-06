import { useEffect, useRef, useState, useMemo } from "react";
import { useAppStore, selectProject } from "@/store";
import { readDiff, readRunDiff, DiffMode } from "@/lib/git-diff";
import { parseUnifiedDiff, DiffFile, diffTotals } from "@/lib/diff";
import { useT } from "@/i18n/useT";
import { plural } from "@/i18n";
import { EmptyState } from "@/components/ui/empty-state";
import { TreeView, type TreeNode } from "@/components/ui/tree-view";
import { diffTree, type DiffTreeNode } from "@/lib/diff-tree";
import { GitCompare, RefreshCw, ChevronDown, ChevronRight } from "lucide-react";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Spinner } from "@/components/ui/spinner";
import { cn } from "@/lib/utils";
import { repoDirOf } from "@/lib/repo-dir";
import { useCurrentProjectId } from "@/components/shell/project-pane";


/** The tree's rows: a name and the lines it adds and removes, in the cards' colors. */
function toTreeNodes(nodes: DiffTreeNode[]): TreeNode[] {
  return nodes.map(n => ({
    id: n.id,
    textValue: n.name,
    label: (
      <span className="flex min-w-0 flex-1 items-center gap-2">
        <span className="truncate font-mono">{n.name}</span>
        <span className="ml-auto flex shrink-0 gap-1.5 text-[10px] tabular-nums">
          {n.additions > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{n.additions}</span>}
          {n.deletions > 0 && <span className="text-rose-600 dark:text-rose-400">−{n.deletions}</span>}
        </span>
      </span>
    ),
    children: n.children ? toTreeNodes(n.children) : undefined,
  }));
}

export function DiffPanel({ run }: { run?: { cwd?: string; baseSha?: string } } = {}) {
  const t = useT();
  const currentProjectId = useCurrentProjectId();
  const project = useAppStore(state => selectProject(state, currentProjectId));
  const repoState = useAppStore(state => currentProjectId ? state.repoState[currentProjectId] : undefined);
  const workspaceDir = project ? repoDirOf(project) : "";
  
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

  const applyDiffResult = (res: { available: boolean; text: string; truncated: boolean; untracked: string[] }) => {
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
  };
  
  const load = () => {
    if (run) {
      if (!run.cwd || !run.baseSha) {
        setFiles([]);
        setUntracked([]);
        setTruncated(false);
        setAvailable(false);
        return;
      }
      
      setLoading(true);
      const gen = ++generation.current;
      readRunDiff(run.cwd, run.baseSha).then(res => {
        if (generation.current !== gen) return;
        setLoading(false);
        applyDiffResult(res);
      });
      return;
    }

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
      applyDiffResult(res);
    });
  };

  useEffect(() => {
    load();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [currentProjectId, workspaceDir, mode, fetchedAt, run?.cwd, run?.baseSha]);

  const toggleCollapsed = (path: string) => {
    setCollapsedPaths(prev => {
      const next = new Set(prev);
      if (next.has(path)) next.delete(path);
      else next.add(path);
      return next;
    });
  };

  const totals = useMemo(() => diffTotals(files), [files]);
  const tree = useMemo(() => diffTree(files), [files]);
  const treeNodes = useMemo(() => toTreeNodes(tree), [tree]);
  // Every folder open: the index is short, and a closed folder would hide the file you came for.
  const treeFolders = useMemo(() => tree.flatMap(function dirs(n): string[] { return n.children ? [n.id, ...n.children.flatMap(dirs)] : []; }), [tree]);

  // A run with nothing to compare against, and one whose diff git refused to give: both are the
  // same thing to read — there is no before. Telling someone their project is not a repository
  // because one old run predates `baseSha` would be answering a question nobody asked.
  if (run && (!run.baseSha || !available)) {
    return (
      <div className="flex h-full flex-col">
        <EmptyState
          icon={GitCompare}
          title={t("diff.noBase")}
        />
      </div>
    );
  }

  if (!available || isRepo === false) {
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
        {run ? (
          <Badge variant="outline" className="text-xs font-normal">
            {t("diff.scopeTask")}
          </Badge>
        ) : (
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
        )}

        <div className="flex items-center gap-3 text-xs">
          {!isEmpty && (
            <div className="flex items-center gap-2">
              <span className="text-muted-foreground">{plural(totals.files, t("diff.files.one", { n: totals.files }), t("diff.files.other", { n: totals.files }))}</span>
              {totals.additions > 0 && <span className="text-emerald-600 dark:text-emerald-400">+{totals.additions}</span>}
              {totals.deletions > 0 && <span className="text-rose-600 dark:text-rose-400">−{totals.deletions}</span>}
            </div>
          )}
          <Button variant="ghost" size="icon" className="h-8 w-8" title={t("diff.refresh")} onClick={load}>
            {loading ? <Spinner aria-hidden className="h-4 w-4" /> : <RefreshCw className="h-4 w-4" />}
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-2 select-text">
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
            
            {/* An index of what changed, by folder: picking a file opens its card and scrolls to it.
                One file needs no index. */}
            {files.length > 1 && (
              <TreeView
                className="rounded-md border border-border bg-card p-1 text-xs"
                aria-label={t("diff.files")}
                data={treeNodes}
                defaultExpanded={treeFolders}
                onAction={node => {
                  if (!node.id.startsWith("file:")) return;
                  const path = node.id.slice("file:".length);
                  setCollapsedPaths(prev => {
                    if (!prev.has(path)) return prev;
                    const next = new Set(prev);
                    next.delete(path);
                    return next;
                  });
                  requestAnimationFrame(() => {
                    document.querySelector(`[data-diff-path="${CSS.escape(path)}"]`)?.scrollIntoView({ block: "start" });
                  });
                }}
              />
            )}

            {files.map(f => {
              const isCollapsed = collapsedPaths.has(f.path);
              const displayName = f.status === "renamed" ? `${f.oldPath} → ${f.path}` : f.path;
              
              return (
                <div key={f.path} data-diff-path={f.path} className="flex flex-col rounded-md border border-border bg-card overflow-hidden">
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
