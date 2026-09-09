import { useEffect, useMemo, useState } from "react";
import { useAppStore, selectAllAgents } from "@/store";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ProjectDialog } from "@/components/ProjectDialog";
import { Shimmer } from "@/components/ui/shimmer";
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuTrigger,
} from "@/components/ui/context-menu";
import { ContextActionItems, type MenuAction } from "@/components/menu-actions";
import { copyText } from "@/lib/clipboard";
import { openFolder } from "@/lib/open-external";
import { confirm } from "@/lib/confirm";
import { formatTimeAgo, shortenPath, truncate } from "@/lib/format";
import { useT, useLocale } from "@/i18n/useT";
import { plural } from "@/i18n";
import type { Project, Run } from "@/types";
import { Bell, Copy, FolderKanban, FolderOpen, Pencil, Trash2 } from "lucide-react";
import { attentionItems, workingItems, countsByProject } from "@/lib/attention";
import { AgentAvatar } from "@/components/ProviderLogo";

function ProjectRowSkeleton() {
  return (
    <div className="flex items-start gap-3 p-2">
      <Skeleton className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5" />
      <div className="flex-1 min-w-0 flex flex-col gap-1.5">
        <Skeleton className="h-4 w-40" />
        <Skeleton className="h-3 w-64" />
      </div>
    </div>
  );
}

/** Landing screen: every project as a row with what needs attention or what is working. */
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
  const lastRootRun = useMemo(() => {
    const last: Record<string, Run> = {};
    for (const r of Object.values(runs)) {
      if (r.parentRunId === null && r.kind !== "chat") {
        const prev = last[r.projectId];
        if (!prev || r.startedAt > prev.startedAt) last[r.projectId] = r;
      }
    }
    return last;
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
    <div className="flex-1 min-h-0 flex flex-col overflow-y-auto p-6 gap-6">
      <div className="flex justify-between items-center">
        {/* The screen is Inicio and one of its three sections is Proyectos. Reusing the sidebar's
            own word for the page keeps the two from both being called the same thing. */}
        <h2 className="text-xl font-bold">{t("sidebar.home")}</h2>
        <Button onClick={newProject}>{t("sidebar.newProject")}</Button>
      </div>

      {!loaded ? (
        <div className="flex flex-col gap-1">
          <ProjectRowSkeleton />
          <ProjectRowSkeleton />
          <ProjectRowSkeleton />
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
          {attentionList.length === 0 && workingList.length === 0 && (
            <p className="text-sm text-muted-foreground">{t("home.allClear")}</p>
          )}

          {attentionList.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold flex items-center gap-2">
                <Bell className="w-4 h-4" /> {t("home.attention.title")}
              </h3>
              <div className="flex flex-col gap-1">
                {attentionList.slice(0, 6).map(item => (
                  <button
                    key={item.id}
                    type="button"
                    className="flex items-start gap-3 w-full text-left p-2 rounded hover:bg-muted/50 transition-colors text-sm group min-w-0"
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
                    <Badge variant="secondary" className="shrink-0 mt-0.5">
                      {t(`home.attention.kind.${item.kind}`)}
                    </Badge>
                    <div className="flex-1 min-w-0 flex flex-col">
                      <span className="font-medium truncate">{item.title}</span>
                      <span className="text-xs text-muted-foreground truncate">
                        {[
                          projectName(item.projectId),
                          item.agentId ? agentName(item.agentId) : null,
                          formatTimeAgo(item.at, now, locale),
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                  </button>
                ))}
                {attentionList.length > 6 && (
                  <div className="text-sm text-muted-foreground p-2">{t("home.more", { n: attentionList.length - 6 })}</div>
                )}
              </div>
            </div>
          )}

          {workingList.length > 0 && (
            <div className="flex flex-col gap-2">
              <h3 className="font-semibold flex items-center gap-2">
                <Shimmer>{t("home.working.title")}</Shimmer>
              </h3>
              <div className="flex flex-col gap-1">
                {workingList.slice(0, 6).map(item => (
                  <button
                    key={`${item.projectId}-${item.agentId}`}
                    type="button"
                    className="flex items-start gap-3 w-full text-left p-2 rounded hover:bg-muted/50 transition-colors text-sm group min-w-0"
                    onClick={() => {
                      openProject(item.projectId, null);
                      setProjectMode("chat");
                    }}
                  >
                    <div className="shrink-0 mt-0.5">
                      <AgentAvatar provider={agentProvider(item.agentId)} color={agentColor(item.agentId)} size={20} />
                    </div>
                    <div className="flex-1 min-w-0 flex flex-col">
                      <span className="font-medium truncate">
                        {item.task || t("home.working", { name: agentName(item.agentId) })}
                      </span>
                      <span className="text-xs text-muted-foreground truncate">
                        {[
                          projectName(item.projectId),
                          agentName(item.agentId),
                          item.since ? formatTimeAgo(item.since, now, locale) : null,
                        ]
                          .filter(Boolean)
                          .join(" · ")}
                      </span>
                    </div>
                  </button>
                ))}
                {workingList.length > 6 && (
                  <div className="text-sm text-muted-foreground p-2">{t("home.more", { n: workingList.length - 6 })}</div>
                )}
              </div>
            </div>
          )}

          <div className="flex flex-col gap-2">
            <h3 className="font-semibold">{t("home.title")}</h3>
            <div className="flex flex-col gap-1">
              {projects.map(p => {
                const busy = busyByProject[p.id] ?? [];
                const last = lastRootRun[p.id];
                const pCounts = counts[p.id] || { needsYou: 0, working: 0 };

                let statusText: string;
                if (busy.length > 0) {
                  const first = busy[0];
                  statusText = first.task
                    ? t("home.workingOnTask", { name: agentName(first.agentId), task: truncate(first.task, 80) })
                    : t("home.working", { name: agentName(first.agentId) });
                } else if (last) {
                  const timeAgo = formatTimeAgo(last.endedAt ?? last.startedAt, now, locale);
                  statusText = `${t("home.lastTask", { task: truncate(last.prompt, 80) })} · ${timeAgo}`;
                } else {
                  statusText = t("home.noActivity");
                }

                return (
                  <ContextMenu key={p.id}>
                    <ContextMenuTrigger asChild>
                      <button
                        type="button"
                        className="flex items-start gap-3 w-full text-left p-2 rounded hover:bg-muted/50 transition-colors text-sm group min-w-0"
                        onClick={() => openProject(p.id)}
                      >
                        <div
                          className="w-2.5 h-2.5 rounded-full shrink-0 mt-1.5"
                          style={{ backgroundColor: p.color || "#4f8cff" }}
                        />
                        <div className="flex-1 min-w-0 flex flex-col">
                          <div className="flex items-baseline gap-2 min-w-0">
                            <span className="font-bold truncate shrink-0 max-w-[60%]">{p.name}</span>
                            {p.workspaceDir && (
                              <span className="text-xs text-muted-foreground truncate min-w-0" title={p.workspaceDir}>
                                {shortenPath(p.workspaceDir, 44)}
                              </span>
                            )}
                          </div>
                          <span className="text-xs text-muted-foreground truncate">
                            {statusText}
                          </span>
                        </div>
                        {(pCounts.needsYou > 0 || pCounts.working > 0) && (
                          <div className="flex items-center gap-1.5 shrink-0 self-center">
                            {pCounts.needsYou > 0 && (
                              <Badge variant="secondary">
                                {plural(
                                  pCounts.needsYou,
                                  t("home.counts.needsYou.one", { n: pCounts.needsYou }),
                                  t("home.counts.needsYou.other", { n: pCounts.needsYou }),
                                )}
                              </Badge>
                            )}
                            {pCounts.working > 0 && (
                              <Badge variant="outline">
                                {plural(
                                  pCounts.working,
                                  t("home.counts.working.one", { n: pCounts.working }),
                                  t("home.counts.working.other", { n: pCounts.working }),
                                )}
                              </Badge>
                            )}
                          </div>
                        )}
                      </button>
                    </ContextMenuTrigger>
                    <ContextMenuContent className="w-48">
                      <ContextActionItems actions={projectActions(p)} />
                    </ContextMenuContent>
                  </ContextMenu>
                );
              })}
            </div>
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
