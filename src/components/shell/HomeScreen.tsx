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
import { Copy, Folder, FolderKanban, FolderOpen, Pencil, PlayCircle, Trash2, Bell, Loader2 } from "lucide-react";
import { attentionItems, workingItems, countsByProject } from "@/lib/attention";
import { AgentAvatar } from "@/components/ProviderLogo";

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
  const approvals = useAppStore(state => state.approvals);
  const questions = useAppStore(state => state.questions);
  const tasks = useAppStore(state => state.tasks);
  const loaded = useAppStore(state => state.loaded);
  const openProject = useAppStore(state => state.openProject);
  const removeProject = useAppStore(state => state.removeProject);
  const setProjectMode = useAppStore(state => state.setProjectMode);
  const focusTask = useAppStore(state => state.focusTask);

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

  const attentionList = useMemo(() => attentionItems({ approvals, questions, tasks, projects }), [approvals, questions, tasks, projects]);
  const workingList = useMemo(() => workingItems({ runtime, runs, projects }), [runtime, runs, projects]);
  const counts = useMemo(() => countsByProject(attentionList, workingList), [attentionList, workingList]);

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
  const agentProvider = (id: string) => agents.find(a => a.id === id)?.provider ?? "custom";
  const agentColor = (id: string) => agents.find(a => a.id === id)?.color;
  const projectName = (id: string) => projects.find(p => p.id === id)?.name ?? "";

  const editProject = (p: Project) => {
    setEditingProject(p);
    setProjectDialogOpen(true);
  };

  const projectActions = (p: Project): MenuAction[] => [
    { key: "open", label: t("common.open"), icon: FolderKanban, onSelect: () => openProject(p.id) },
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
        <>
          {attentionList.length > 0 && (
            <div className="flex flex-col gap-2 mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Bell className="w-4 h-4" /> {t("home.attention.title")}
              </h3>
              <div className="flex flex-col gap-1">
                {attentionList.slice(0, 6).map(item => (
                  <button
                    key={item.id}
                    className="flex items-center gap-3 w-full text-left p-2 rounded hover:bg-muted/50 transition-colors text-sm group"
                    onClick={() => {
                      openProject(item.projectId, null);
                      if (item.kind === "task") {
                        setProjectMode("tasks");
                        if (item.taskId) focusTask(item.taskId);
                      } else {
                        setProjectMode("chat");
                      }
                    }}
                  >
                    <Badge variant="secondary" className="shrink-0">{t(`home.attention.kind.${item.kind}`)}</Badge>
                    <span className="font-medium shrink-0">{projectName(item.projectId)}</span>
                    {item.agentId && <span className="text-muted-foreground shrink-0">{agentName(item.agentId)}</span>}
                    <span className="truncate flex-1">{item.title}</span>
                    <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                      {formatTimeAgo(item.at, now, locale)}
                    </span>
                  </button>
                ))}
                {attentionList.length > 6 && (
                  <div className="text-sm text-muted-foreground p-2">{t("home.more", { n: attentionList.length - 6 })}</div>
                )}
              </div>
            </div>
          )}

          {workingList.length > 0 && (
            <div className="flex flex-col gap-2 mb-4">
              <h3 className="font-semibold flex items-center gap-2">
                <Loader2 className="w-4 h-4 animate-spin" /> {t("home.working.title")}
              </h3>
              <div className="flex flex-col gap-1">
                {workingList.slice(0, 6).map(item => (
                  <button
                    key={`${item.projectId}-${item.agentId}`}
                    className="flex items-center gap-3 w-full text-left p-2 rounded hover:bg-muted/50 transition-colors text-sm group"
                    onClick={() => {
                      openProject(item.projectId, null);
                      setProjectMode("chat");
                    }}
                  >
                    <span className="font-medium shrink-0">{projectName(item.projectId)}</span>
                    <div className="flex items-center gap-1.5 shrink-0">
                      <AgentAvatar provider={agentProvider(item.agentId)} color={agentColor(item.agentId)} size={20} />
                      <span className="text-muted-foreground">{agentName(item.agentId)}</span>
                    </div>
                    <span className="truncate flex-1">{item.task || t("home.working", { name: agentName(item.agentId) })}</span>
                    {item.since && (
                      <span className="text-xs text-muted-foreground shrink-0 tabular-nums">
                        {formatTimeAgo(item.since, now, locale)}
                      </span>
                    )}
                  </button>
                ))}
                {workingList.length > 6 && (
                  <div className="text-sm text-muted-foreground p-2">{t("home.more", { n: workingList.length - 6 })}</div>
                )}
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {projects.map(p => {
              const busy = busyByProject[p.id] ?? [];
              const last = lastRootRun[p.id];
              const pCounts = counts[p.id] || { needsYou: 0, working: 0 };

              return (
                <ContextMenu key={p.id}>
                  <ContextMenuTrigger asChild>
                    <Card
                      role="button"
                      className={`p-4 flex flex-col gap-3 cursor-pointer transition-colors hover:border-primary/50`}
                      onClick={() => openProject(p.id)}
                    >
                      <div className="flex items-center gap-2">
                        <div className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: p.color || "#4f8cff" }} />
                        <h3 className="font-bold truncate">{p.name}</h3>
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

                      {(pCounts.working > 0 || pCounts.needsYou > 0) && (
                        <div className="flex gap-2 flex-wrap items-center text-xs font-medium text-muted-foreground mt-1">
                          {pCounts.working > 0 && <span>{plural(pCounts.working, t("home.counts.working.one", { n: pCounts.working }), t("home.counts.working.other", { n: pCounts.working }))}</span>}
                          {pCounts.working > 0 && pCounts.needsYou > 0 && <span>·</span>}
                          {pCounts.needsYou > 0 && <span>{plural(pCounts.needsYou, t("home.counts.needsYou.one", { n: pCounts.needsYou }), t("home.counts.needsYou.other", { n: pCounts.needsYou }))}</span>}
                        </div>
                      )}

                      <div className="flex gap-2 mt-auto pt-2" onClick={e => e.stopPropagation()}>
                        <Button size="sm" className="flex-1" onClick={() => openProject(p.id)}>{t("common.open")}</Button>
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
        </>
      )}

      <ProjectDialog
        isOpen={projectDialogOpen}
        onOpenChange={setProjectDialogOpen}
        editProject={editingProject}
      />
    </div>
  );
}
