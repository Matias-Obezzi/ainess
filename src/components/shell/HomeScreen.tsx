import { useEffect, useMemo, useState } from "react";
import { useAppStore, selectAllAgents } from "@/store";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusDot } from "@/components/StatusDot";
import { ProjectDialog } from "@/components/ProjectDialog";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ContextActionItems, type MenuAction } from "@/components/menu-actions";
import { copyText } from "@/lib/clipboard";
import { openFolder } from "@/lib/open-external";
import { confirm } from "@/lib/confirm";
import { formatTimeAgo, truncate } from "@/lib/format";
import { runStatusLabelKey } from "@/lib/labels";
import { useT, useLocale } from "@/i18n/useT";
import { plural } from "@/i18n";
import type { Project, Run } from "@/types";
import { Copy, Folder, FolderKanban, FolderOpen, Pencil, PlayCircle, Trash2 } from "lucide-react";

function ProjectCardSkeleton() {
  return (
    <Card className="flex flex-col gap-3 p-4">
      <div className="flex items-center gap-2">
        <Skeleton className="size-3 rounded-full" />
        <Skeleton className="h-4 w-32" />
      </div>
      <Skeleton className="h-3 w-full" />
      <Skeleton className="h-3 w-2/3" />
      <Skeleton className="h-8 w-full" />
    </Card>
  );
}

/** Landing screen: every project as a card with what it is doing right now. */
export function HomeScreen() {
  const t = useT();
  const locale = useLocale();
  const projects = useAppStore(state => state.config.projects);
  const agents = useAppStore(selectAllAgents);
  const runs = useAppStore(state => state.runs);
  const runtime = useAppStore(state => state.runtime);
  const loaded = useAppStore(state => state.loaded);
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const openProject = useAppStore(state => state.openProject);
  const removeProject = useAppStore(state => state.removeProject);

  const [projectDialogOpen, setProjectDialogOpen] = useState(false);
  const [editingProject, setEditingProject] = useState<Project | undefined>(undefined);
  const [now, setNow] = useState(Date.now());

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 5000);
    return () => clearInterval(interval);
  }, []);

  // One pass over runs per change: a selector returning a fresh object would re-render forever.
  const { savedRuns, lastRootRun } = useMemo(() => {
    const counts: Record<string, number> = {};
    const last: Record<string, Run> = {};
    for (const r of Object.values(runs)) {
      counts[r.projectId] = (counts[r.projectId] ?? 0) + 1;
      if (r.parentRunId === null && r.kind !== "chat") {
        const prev = last[r.projectId];
        if (!prev || r.startedAt > prev.startedAt) last[r.projectId] = r;
      }
    }
    return { savedRuns: counts, lastRootRun: last };
  }, [runs]);

  const busyByProject = useMemo(() => {
    const out: Record<string, Array<{ agentId: string; task?: string }>> = {};
    for (const [projectId, projectRuntime] of Object.entries(runtime)) {
      const busy = Object.values(projectRuntime)
        .filter(r => r.status === "working" || r.status === "waiting")
        .map(r => ({ agentId: r.agentId, task: r.currentTask }));
      if (busy.length > 0) out[projectId] = busy;
    }
    return out;
  }, [runtime]);

  const newProject = () => {
    setEditingProject(undefined);
    setProjectDialogOpen(true);
  };

  const handleRemove = async (p: Project) => {
    const confirmed = await confirm({
      title: t("sidebar.deleteProject.title"),
      description: t("sidebar.deleteProject.body", { name: p.name }),
      destructive: true,
    });
    if (confirmed) removeProject(p.id);
  };

  const agentName = (id: string) => agents.find(a => a.id === id)?.name ?? t("home.formerAgent");

  const editProject = (p: Project) => {
    setEditingProject(p);
    setProjectDialogOpen(true);
  };

  const projectActions = (p: Project): MenuAction[] => [
    { key: "open", label: t("common.open"), icon: FolderKanban, onSelect: () => openProject(p.id, null) },
    { key: "edit", label: t("common.edit"), icon: Pencil, onSelect: () => editProject(p) },
    {
      key: "open-folder",
      label: t("project.openFolder"),
      icon: FolderOpen,
      disabled: !p.workspaceDir,
      separatorBefore: true,
      onSelect: () => void openFolder(p.workspaceDir),
    },
    {
      key: "copy-path",
      label: t("home.copyPath"),
      icon: Copy,
      disabled: !p.workspaceDir,
      onSelect: () => void copyText(p.workspaceDir, t("sidebar.pathCopied")),
    },
    {
      key: "delete",
      label: t("common.delete"),
      icon: Trash2,
      destructive: true,
      separatorBefore: true,
      onSelect: () => void handleRemove(p),
    },
  ];

  return (
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto p-6 gap-4">
      <div className="flex justify-between items-center">
        <h2 className="text-xl font-bold">{t("home.title")}</h2>
        <Button onClick={newProject}>{t("sidebar.newProject")}</Button>
      </div>

      {!loaded ? (
        <div className="grid grid-cols-1 gap-4 md:grid-cols-2 lg:grid-cols-3">
          <ProjectCardSkeleton />
          <ProjectCardSkeleton />
          <ProjectCardSkeleton />
        </div>
      ) : projects.length === 0 ? (
        <EmptyState
          icon={FolderKanban}
          title={t("home.empty.title")}
          description={t("home.empty.body")}
          action={{ label: t("home.empty.action"), onClick: newProject }}
          className="flex-1"
        />
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
          {projects.map(p => {
            const busy = busyByProject[p.id] ?? [];
            const last = lastRootRun[p.id];
            const isCurrent = p.id === currentProjectId;

            return (
              <ContextMenu key={p.id}>
                <ContextMenuTrigger asChild>
                  <Card
                    role="button"
                    className={`p-4 flex flex-col gap-3 cursor-pointer transition-colors hover:border-primary/50 ${isCurrent ? "ring-2 ring-primary" : ""}`}
                    onClick={() => openProject(p.id, null)}
                  >
                    <div className="flex items-center gap-2">
                      <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color || "#4f8cff" }} />
                      <h3 className="font-bold truncate">{p.name}</h3>
                      {isCurrent && <span className="ml-auto text-xs bg-primary/10 text-primary px-2 py-0.5 rounded">{t("home.current")}</span>}
                    </div>

                    <div className="text-sm text-muted-foreground flex items-center gap-1.5 truncate">
                      <Folder className="w-4 h-4 shrink-0" />
                      <span className="truncate" title={p.workspaceDir}>{p.workspaceDir}</span>
                    </div>

                    <div className="text-xs flex flex-col gap-1 min-h-[2.5rem]">
                      {busy.length > 0 ? (
                        busy.slice(0, 2).map(b => (
                          <div key={b.agentId} className="flex items-center gap-1.5">
                            <StatusDot status="working" />
                            <span className="truncate">
                              {b.task
                                ? t("home.workingOnTask", { name: agentName(b.agentId), task: truncate(b.task, 80) })
                                : t("home.working", { name: agentName(b.agentId) })}
                            </span>
                          </div>
                        ))
                      ) : last ? (
                        <>
                          <span className="truncate text-muted-foreground">{t("home.lastTask", { task: truncate(last.prompt, 80) })}</span>
                          <div className="flex items-center gap-2">
                            <Badge variant={last.status === "error" ? "destructive" : "outline"} className="text-[10px]">
                              {t(runStatusLabelKey[last.status])}
                            </Badge>
                            <span className="text-muted-foreground">{formatTimeAgo(last.endedAt ?? last.startedAt, now, locale)}</span>
                          </div>
                        </>
                      ) : (
                        <span className="text-muted-foreground">{t("home.noActivity")}</span>
                      )}
                    </div>

                    <div className="text-sm flex items-center gap-1.5">
                      <PlayCircle className="w-4 h-4 text-orange-500" />
                      {plural(busy.length, t("home.activeTasks.one", { n: busy.length }), t("home.activeTasks.other", { n: busy.length }))}
                      <span className="text-muted-foreground">
                        {" · "}
                        {plural(savedRuns[p.id] ?? 0, t("home.savedRuns.one", { n: savedRuns[p.id] ?? 0 }), t("home.savedRuns.other", { n: savedRuns[p.id] ?? 0 }))}
                      </span>
                    </div>

                    <div className="flex gap-2 mt-auto pt-2" onClick={e => e.stopPropagation()}>
                      <Button size="sm" className="flex-1" onClick={() => openProject(p.id, null)}>{t("common.open")}</Button>
                      <Button size="sm" variant="outline" onClick={() => editProject(p)}>
                        {t("common.edit")}
                      </Button>
                      <Button size="sm" variant="destructive" onClick={() => void handleRemove(p)}>{t("common.delete")}</Button>
                    </div>
                  </Card>
                </ContextMenuTrigger>
                <ContextMenuContent className="w-48">
                  <ContextActionItems actions={projectActions(p)} />
                </ContextMenuContent>
              </ContextMenu>
            );
          })}
        </div>
      )}

      <ProjectDialog
        isOpen={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        editProject={editingProject}
      />
    </div>
  );
}
