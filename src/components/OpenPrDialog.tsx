// Opens a pull request for the branch the project is on. Publishing something outside the app is
// not a one-click action: this dialog always shows what is about to be created and waits for the
// user to confirm it, with the title and body left editable.
import { useEffect, useState } from "react";
import { useAppStore, selectTasks } from "@/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { toast } from "@/components/ui/toast";
import { openExternal } from "@/lib/open-external";
import { openPullRequest, pushBranch, defaultBranch, type PrsUnavailable } from "@/lib/git-repo";
import { prDraft } from "@/lib/pr-draft";
import { useT, type TFunction } from "@/i18n/useT";

const DEFAULT_BRANCHES = new Set(["main", "master"]);

/** Best guess at what the PR would target: the default branch, if it is somewhere in the list. */
function reasonText(t: TFunction, reason: PrsUnavailable | "failed", message: string): string {
  if (reason === "no-gh") return t("git.prs.noGh");
  if (reason === "no-auth") return t("git.prs.noAuth");
  return message || t("git.failed");
}

export function OpenPrDialog({ projectId, taskId, open, onOpenChange }: {
  projectId: string;
  taskId?: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const repo = useAppStore(state => state.repoState[projectId]);
  const workspaceDir = useAppStore(state => state.config.projects.find(p => p.id === projectId)?.workspaceDir ?? "");
  const refreshRepoState = useAppStore(state => state.refreshRepoState);
  const task = useAppStore(state => (taskId ? selectTasks(state, projectId).find(x => x.id === taskId) : undefined));
  const run = useAppStore(state => (task?.runId ? state.runs[task.runId] : undefined));

  const [title, setTitle] = useState("");
  const [body, setBody] = useState("");
  const [creating, setCreating] = useState(false);
  const [pushing, setPushing] = useState(false);
  // What `gh pr create` will actually target, read from the remote rather than guessed — see
  // `defaultBranch`. Empty means the remote never said, and then the dialog names no target.
  const [baseBranch, setBaseBranch] = useState("");

  // Re-seeds the draft every time the dialog opens: a different task may be behind it this time.
  useEffect(() => {
    if (!open) return;
    const draft = prDraft({ task, run });
    setTitle(draft.title);
    setBody(draft.body);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open, task?.id, run?.id]);

  useEffect(() => {
    if (!open) return;
    void defaultBranch(workspaceDir).then(setBaseBranch);
  }, [open, workspaceDir]);

  const status = repo?.status ?? null;
  const branch = status?.branch ?? null;
  const onDefaultBranch = !!branch && DEFAULT_BRANCHES.has(branch);
  const needsPush = !onDefaultBranch && !!branch && (!status?.upstream || (status?.ahead ?? 0) > 0);

  const handlePush = async () => {
    setPushing(true);
    try {
      const result = await pushBranch(workspaceDir, status);
      if (result.ok) toast.success(result.message || t("git.done"));
      else toast.error(result.message || t("git.failed"));
      await refreshRepoState(projectId);
    } finally {
      setPushing(false);
    }
  };

  const handleCreate = async () => {
    setCreating(true);
    try {
      const result = await openPullRequest(workspaceDir, { title: title.trim(), body });
      if (result.ok) {
        onOpenChange(false);
        toast.success(t("pr.created"));
        if (result.pr.url) void openExternal(result.pr.url);
      } else {
        toast.error(t("pr.failed", { error: reasonText(t, result.reason, result.message) }));
      }
    } finally {
      setCreating(false);
    }
  };

  const canCreate = !!branch && !onDefaultBranch && !needsPush && title.trim().length > 0 && !creating;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("pr.title")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          {/* Only names a target when the remote told us what it is. Naming one we guessed would
              be a promise `gh` never made, on the screen whose job is saying what will happen. */}
          <p className="text-xs text-muted-foreground">
            {baseBranch
              ? t("pr.branchInto", { from: branch ?? "", into: baseBranch })
              : branch ?? ""}
          </p>

          {onDefaultBranch && (
            <p className="text-xs text-amber-600 dark:text-amber-400">{t("pr.onDefaultBranch")}</p>
          )}

          {!onDefaultBranch && needsPush && (
            <div className="flex items-center justify-between gap-2 rounded-lg border border-border p-2">
              <p className="text-xs text-muted-foreground">{t("pr.needsPush")}</p>
              <Button type="button" variant="outline" size="sm" disabled={pushing} onClick={() => void handlePush()}>
                {t("pr.pushFirst")}
              </Button>
            </div>
          )}

          <div className="space-y-1.5">
            <Label htmlFor="pr-title">{t("pr.fieldTitle")}</Label>
            <Input id="pr-title" value={title} disabled={onDefaultBranch} onChange={e => setTitle(e.target.value)} />
          </div>

          <div className="space-y-1.5">
            <Label htmlFor="pr-body">{t("pr.fieldBody")}</Label>
            <Textarea
              id="pr-body"
              className="min-h-32"
              value={body}
              disabled={onDefaultBranch}
              onChange={e => setBody(e.target.value)}
            />
          </div>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => void handleCreate()} disabled={!canCreate}>{t("common.create")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
