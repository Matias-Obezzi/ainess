// What the repo of a project looks like right now, in the two places the user asks for it: a
// compact line under the project in the sidebar, and a branch button with the full breakdown in
// the project header. Both read `store.repoState`, which `useRepoSync` keeps fresh; nothing here
// runs a command of its own, and nothing ever writes to the repo.
import { useEffect, useState } from "react";
import { ArrowDownToLine, ArrowUpFromLine, GitBranch, GitPullRequest, Plus, RefreshCw } from "lucide-react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectSeparator, SelectTrigger, SelectValue } from "@/components/ui/select";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { toast } from "@/components/ui/toast";
import { openExternal } from "@/lib/open-external";
import { OpenPrDialog } from "@/components/OpenPrDialog";
import { cn } from "@/lib/utils";
import type { GitStatus, PullRequest, PullRequestChecks, PullRequestReview } from "@/lib/git";
import {
  createBranch,
  listBranches,
  pullBranch,
  pushBranch,
  switchBranch,
  type GitCommandResult,
  type RepoState,
} from "@/lib/git-repo";
import { useT, type TFunction } from "@/i18n/useT";
import { plural } from "@/i18n";

const CHECKS_LABEL_KEY: Record<PullRequestChecks, string> = {
  passing: "git.checks.passing",
  failing: "git.checks.failing",
  pending: "git.checks.pending",
  none: "git.checks.none",
};

const REVIEW_LABEL_KEY: Record<PullRequestReview, string> = {
  approved: "git.review.approved",
  "changes-requested": "git.review.changesRequested",
  pending: "git.review.pending",
  none: "git.review.none",
};

/** Red when something is broken, amber when something is waiting, green when it is all fine. */
type Tone = "bad" | "warn" | "ok" | "muted";

const TONE_TEXT: Record<Tone, string> = {
  bad: "text-red-500",
  warn: "text-amber-500",
  ok: "text-green-500",
  muted: "text-muted-foreground",
};

const TONE_CHIP: Record<Tone, string> = {
  bad: "border-red-500/30 bg-red-500/15 text-red-500",
  warn: "border-amber-500/30 bg-amber-500/15 text-amber-500",
  ok: "border-green-500/30 bg-green-500/15 text-green-500",
  muted: "border-border bg-muted text-muted-foreground",
};

function checksTone(checks: PullRequestChecks): Tone {
  if (checks === "failing") return "bad";
  if (checks === "pending") return "warn";
  return checks === "passing" ? "ok" : "muted";
}

function reviewTone(review: PullRequestReview): Tone {
  if (review === "changes-requested") return "bad";
  if (review === "pending") return "warn";
  return review === "approved" ? "ok" : "muted";
}

/** The worst news across every open pull request: that is the colour the count gets. */
function worstTone(pullRequests: PullRequest[]): Tone {
  if (pullRequests.length === 0) return "muted";
  if (pullRequests.some(pr => pr.checks === "failing")) return "bad";
  if (pullRequests.some(pr => pr.checks === "pending" || pr.review !== "approved")) return "warn";
  return "ok";
}

/** Why the pull requests are missing, said in words. */
function unavailableText(t: TFunction, reason: RepoState["prsUnavailable"]): string | null {
  switch (reason) {
    case "no-gh":
      return t("git.prs.noGh");
    case "no-auth":
      return t("git.prs.noAuth");
    case "no-remote":
      return t("git.prs.noRemote");
    default:
      return null;
  }
}

/** Sentences for the sidebar tooltip: one per number actually shown. */
function statusSentences(t: TFunction, repo: RepoState): string[] {
  const lines: string[] = [];
  const status = repo.status;
  if (status?.branch) lines.push(t("git.branchIs", { branch: status.branch }));
  if (status?.upstream) lines.push(t("git.tracks", { upstream: status.upstream }));
  if (status && status.dirty > 0) {
    lines.push(plural(status.dirty, t("git.dirty.one", { n: status.dirty }), t("git.dirty.other", { n: status.dirty })));
  }
  if (status && status.ahead > 0) {
    lines.push(plural(status.ahead, t("git.ahead.one", { n: status.ahead }), t("git.ahead.other", { n: status.ahead })));
  }
  if (status && status.behind > 0) {
    lines.push(plural(status.behind, t("git.behind.one", { n: status.behind }), t("git.behind.other", { n: status.behind })));
  }
  const prs = repo.pullRequests;
  if (prs.length > 0) {
    const failing = prs.filter(pr => pr.checks === "failing").length;
    const waiting = prs.filter(pr => pr.review === "pending" || pr.review === "changes-requested").length;
    let detail = t("git.prs.allGreen");
    if (failing > 0) detail = t("git.prs.failing", { n: failing });
    else if (waiting > 0) detail = t("git.prs.waiting", { n: waiting });
    lines.push(plural(prs.length, t("git.prs.open.one", { n: prs.length, detail }), t("git.prs.open.other", { n: prs.length, detail })));
  }
  return lines;
}

/** The compact signals shared by the sidebar line and the header button. */
function Signals({ repo, className }: { repo: RepoState; className?: string }) {
  const status = repo.status;
  const prs = repo.pullRequests;
  return (
    <span className={cn("flex shrink-0 items-center gap-1 tabular-nums", className)}>
      {status && status.dirty > 0 && <span className="text-amber-500">●{status.dirty}</span>}
      {status && status.ahead > 0 && <span>↑{status.ahead}</span>}
      {status && status.behind > 0 && <span>↓{status.behind}</span>}
      {prs.length > 0 && <span className={TONE_TEXT[worstTone(prs)]}>PR {prs.length}</span>}
    </span>
  );
}

/**
 * The line under a project's name in the sidebar. Renders nothing at all when the folder is not a
 * repo or has not been read yet: an error there would only be noise.
 */
export function GitStatusLine({ projectId }: { projectId: string }) {
  const t = useT();
  const repo = useAppStore(state => state.repoState[projectId]);
  if (!repo?.isRepo || !repo.status?.branch) return null;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div className="flex items-center gap-1 pl-6 pr-1 text-[10px] text-muted-foreground">
          <GitBranch className="h-3 w-3 shrink-0" />
          <span className="truncate">{repo.status.branch}</span>
          <Signals repo={repo} className="ml-auto" />
        </div>
      </TooltipTrigger>
      <TooltipContent side="right" className="max-w-[260px]">
        <div className="flex flex-col gap-0.5">
          {statusSentences(t, repo).map(line => (
            <span key={line}>{line}</span>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/** One open pull request inside the header popover. Clicking it opens the PR in the browser. */
function PullRequestRow({ pr }: { pr: PullRequest }) {
  const t = useT();
  return (
    <button
      type="button"
      className="flex w-full flex-col gap-1 rounded-md px-2 py-1.5 text-left hover:bg-accent"
      onClick={() => void openExternal(pr.url)}
      disabled={!pr.url}
      title={pr.title}
    >
      <span className="flex items-center gap-1.5 text-xs">
        <GitPullRequest className="h-3.5 w-3.5 shrink-0 text-muted-foreground" />
        <span className="shrink-0 text-muted-foreground tabular-nums">#{pr.number}</span>
        <span className="truncate font-medium">{pr.title || t("git.untitled")}</span>
        {pr.state === "draft" && (
          <span className="shrink-0 rounded-full border border-border px-1.5 text-[10px] text-muted-foreground">
            {t("git.draft")}
          </span>
        )}
      </span>
      <span className="flex items-center gap-1.5 pl-5 text-[10px]">
        <span className="truncate text-muted-foreground">{pr.head}</span>
        <span className={cn("ml-auto shrink-0 rounded-full border px-1.5", TONE_CHIP[checksTone(pr.checks)])}>
          {t(CHECKS_LABEL_KEY[pr.checks])}
        </span>
        <span className={cn("shrink-0 rounded-full border px-1.5", TONE_CHIP[reviewTone(pr.review)])}>
          {t(REVIEW_LABEL_KEY[pr.review])}
        </span>
      </span>
    </button>
  );
}

/** One labelled number of the branch block. */
function Detail({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline gap-2 text-xs">
      <span className="text-muted-foreground">{label}</span>
      <span className="ml-auto truncate tabular-nums">{value}</span>
    </div>
  );
}

/** Both buttons wear what the select next to them wears: `size="sm"` alone would not match. */
const FIELD_BUTTON = "h-7 gap-1.5 rounded-lg bg-transparent px-2 text-xs dark:bg-input/30 dark:hover:bg-input/50";

/** The value the "new branch" entry of the select carries; no branch can be called this. */
const NEW_BRANCH = " new";
/** Remote entries keep their remote in the name, so "origin/main" cannot collide with "main". */
const REMOTE_PREFIX = " remote:";

/**
 * Pull, push and switch branch. All of it is off while an agent is working: moving the repo under
 * a run is how one ends up half applied to the wrong branch.
 */
function RepoActions({ projectId, workspaceDir, status, onCreateBranch, canOpenPr, onOpenPr }: {
  projectId: string;
  workspaceDir: string;
  status: GitStatus | null;
  onCreateBranch(): void;
  canOpenPr: boolean;
  onOpenPr(): void;
}) {
  const t = useT();
  const refreshRepoState = useAppStore(state => state.refreshRepoState);
  const agentsWorking = useAppStore(state => {
    const projectRuntime = state.runtime[projectId];
    return projectRuntime
      ? Object.values(projectRuntime).some(r => r.status === "working" || r.status === "waiting")
      : false;
  });

  const [branches, setBranches] = useState<{ local: string[]; remote: string[] }>({ local: [], remote: [] });
  const [running, setRunning] = useState<"pull" | "push" | "switch" | null>(null);

  // Reread when the branch changes: a switch adds the local branch that was only remote before.
  useEffect(() => {
    let alive = true;
    void listBranches(workspaceDir).then(found => {
      if (alive) setBranches(found);
    });
    return () => { alive = false; };
  }, [workspaceDir, status?.branch]);

  const busy = agentsWorking || running !== null;

  const perform = async (kind: "pull" | "push" | "switch", command: () => Promise<GitCommandResult>) => {
    setRunning(kind);
    try {
      const result = await command();
      if (result.ok) toast.success(result.message || t("git.done"));
      else toast.error(result.message || t("git.failed"));
      await refreshRepoState(projectId);
    } finally {
      setRunning(null);
    }
  };

  const onPick = (value: string) => {
    if (value === NEW_BRANCH) return onCreateBranch();
    if (value === status?.branch) return;
    const remote = value.startsWith(REMOTE_PREFIX);
    void perform("switch", () => switchBranch(workspaceDir, remote ? value.slice(REMOTE_PREFIX.length) : value, remote));
  };

  return (
    <>
    <div className="mt-2 flex items-center gap-1.5">
      <Select value={status?.branch ?? ""} onValueChange={onPick} disabled={busy}>
        <SelectTrigger size="sm" className="min-w-0 flex-1 text-xs data-[size=sm]:h-7" title={t("git.switchBranch")}>
          <SelectValue placeholder={t("git.noBranch")} />
        </SelectTrigger>
        <SelectContent className="max-h-72">
          <SelectItem value={NEW_BRANCH}>
            <Plus className="h-3.5 w-3.5" /> {t("git.newBranch")}
          </SelectItem>
          <SelectSeparator />
          {branches.local.map(branch => (
            <SelectItem key={branch} value={branch}>{branch}</SelectItem>
          ))}
          {branches.remote.length > 0 && <SelectSeparator />}
          {branches.remote.map(branch => (
            <SelectItem key={branch} value={REMOTE_PREFIX + branch}>
              <span className="text-muted-foreground">{branch}</span>
            </SelectItem>
          ))}
        </SelectContent>
      </Select>

      <Button
        type="button"
        variant="outline"
        size="sm"
        className={FIELD_BUTTON}
        disabled={busy}
        title={agentsWorking ? t("git.agentsWorking") : t("git.pullHint")}
        onClick={() => void perform("pull", () => pullBranch(workspaceDir))}
      >
        <ArrowDownToLine className={cn("h-3.5 w-3.5", running === "pull" && "animate-pulse")} /> {t("git.pull")}
      </Button>
      <Button
        type="button"
        variant="outline"
        size="sm"
        className={FIELD_BUTTON}
        disabled={busy}
        title={agentsWorking ? t("git.agentsWorking") : t("git.pushHint")}
        onClick={() => void perform("push", () => pushBranch(workspaceDir, status))}
      >
        <ArrowUpFromLine className={cn("h-3.5 w-3.5", running === "push" && "animate-pulse")} /> {t("git.push")}
      </Button>
      {canOpenPr && (
        <Button
          type="button"
          variant="outline"
          size="sm"
          className={FIELD_BUTTON}
          disabled={busy}
          title={t("pr.open")}
          onClick={onOpenPr}
        >
          <GitPullRequest className="h-3.5 w-3.5" /> {t("pr.open")}
        </Button>
      )}
    </div>
    {/* A row of controls that is off for no visible reason is worse than one that is not there. */}
    {agentsWorking && <p className="mt-1 text-[10px] text-muted-foreground">{t("git.agentsWorking")}</p>}
    </>
  );
}

/** Asks for the name and creates the branch from wherever the repo is now. */
function NewBranchDialog({ projectId, workspaceDir, open, onOpenChange }: {
  projectId: string;
  workspaceDir: string;
  open: boolean;
  onOpenChange(open: boolean): void;
}) {
  const t = useT();
  const refreshRepoState = useAppStore(state => state.refreshRepoState);
  const [name, setName] = useState("");
  const [creating, setCreating] = useState(false);

  const create = async () => {
    const branch = name.trim();
    if (!branch) return;
    setCreating(true);
    try {
      const result = await createBranch(workspaceDir, branch);
      if (result.ok) {
        toast.success(t("git.branchCreated", { branch }));
        onOpenChange(false);
        setName("");
      } else {
        // git is the one that knows which names are not allowed: it says so, we show it.
        toast.error(result.message || t("git.failed"));
      }
      await refreshRepoState(projectId);
    } finally {
      setCreating(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("git.newBranch")}</DialogTitle>
          <DialogDescription>{t("git.newBranchFrom")}</DialogDescription>
        </DialogHeader>
        <Input
          autoFocus
          value={name}
          placeholder={t("git.branchPlaceholder")}
          onChange={e => setName(e.target.value)}
          onKeyDown={e => {
            if (e.key === "Enter") void create();
          }}
        />
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button disabled={!name.trim() || creating} onClick={() => void create()}>{t("common.create")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The branch button of the project header, with the whole picture behind it: the branch block and
 * the open pull requests.
 */
export function GitBranchButton({ projectId }: { projectId: string }) {
  const t = useT();
  const repo = useAppStore(state => state.repoState[projectId]);
  const workspaceDir = useAppStore(state => state.config.projects.find(p => p.id === projectId)?.workspaceDir ?? "");
  const refreshRepoState = useAppStore(state => state.refreshRepoState);
  const [refreshing, setRefreshing] = useState(false);
  // The dialog lives outside the popover: opening it closes the popover, which would take a dialog
  // rendered inside with it.
  const [popoverOpen, setPopoverOpen] = useState(false);
  const [newBranchOpen, setNewBranchOpen] = useState(false);
  const [openPrOpen, setOpenPrOpen] = useState(false);

  if (!repo?.isRepo || !repo.status) return null;
  const status = repo.status;
  const prs = repo.pullRequests;
  const unavailable = unavailableText(t, repo.prsUnavailable);
  const canOpenPr = repo.prsUnavailable !== "no-remote";

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshRepoState(projectId);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <>
    <Popover open={popoverOpen} onOpenChange={setPopoverOpen}>
      <PopoverTrigger asChild>
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="h-7 min-w-0 gap-1.5 px-2 text-xs font-normal"
          title={t("git.repoStatus")}
        >
          <GitBranch className="h-3.5 w-3.5" />
          {/* In a narrow bar (the dock takes half of it) only the icon is left; the popover has
              all of this anyway. */}
          <span className="hidden max-w-[140px] truncate @2xl:inline">{status.branch ?? t("git.noBranch")}</span>
          <span className="hidden @3xl:contents"><Signals repo={repo} /></span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">{t("git.repoStatus")}</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7 gap-1.5 px-2 text-xs"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /> {t("git.refresh")}
          </Button>
        </div>

        <RepoActions
          projectId={projectId}
          workspaceDir={workspaceDir}
          status={status}
          onCreateBranch={() => {
            setPopoverOpen(false);
            setNewBranchOpen(true);
          }}
          canOpenPr={canOpenPr}
          onOpenPr={() => {
            setPopoverOpen(false);
            setOpenPrOpen(true);
          }}
        />

        <div className="mt-2 flex flex-col gap-1 rounded-md border border-border p-2">
          <Detail label={t("git.branch")} value={status.branch ?? t("git.detachedHead")} />
          <Detail label={t("git.remote")} value={status.upstream ?? t("git.noRemote")} />
          <Detail
            label={t("git.uncommitted")}
            value={
              status.dirty === 0
                ? t("git.none")
                : plural(status.dirty, t("git.files.one", { n: status.dirty }), t("git.files.other", { n: status.dirty }))
            }
          />
          <Detail
            label={t("git.aheadBehind")}
            value={
              status.ahead === 0 && status.behind === 0
                ? t("git.upToDate")
                : t("git.aheadBehindValue", { ahead: status.ahead, behind: status.behind })
            }
          />
        </div>

        <div className="mt-3 flex flex-col gap-1">
          <span className="px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            {t("git.openPullRequests")}
          </span>
          {prs.length > 0 ? (
            <div className="max-h-64 overflow-y-auto">
              {prs.map(pr => (
                <PullRequestRow key={pr.number} pr={pr} />
              ))}
            </div>
          ) : (
            <p className="px-2 text-xs text-muted-foreground">
              {unavailable ?? t("git.noOpenPullRequests")}
            </p>
          )}
          {repo.prsUnavailable === "no-gh" && (
            <code className="mx-2 rounded bg-muted px-1.5 py-1 font-mono text-[10px]">
              winget install GitHub.cli
            </code>
          )}
        </div>
      </PopoverContent>
    </Popover>
    <NewBranchDialog
      projectId={projectId}
      workspaceDir={workspaceDir}
      open={newBranchOpen}
      onOpenChange={setNewBranchOpen}
    />
    <OpenPrDialog
      projectId={projectId}
      open={openPrOpen}
      onOpenChange={setOpenPrOpen}
    />
    </>
  );
}
