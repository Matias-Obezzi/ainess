// What the repo of a project looks like right now, in the two places the user asks for it: a
// compact line under the project in the sidebar, and a branch button with the full breakdown in
// the project header. Both read `store.repoState`, which `useRepoSync` keeps fresh; nothing here
// runs a command of its own, and nothing ever writes to the repo.
import { useState } from "react";
import { GitBranch, GitPullRequest, RefreshCw } from "lucide-react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { openExternal } from "@/lib/open-external";
import { cn } from "@/lib/utils";
import type { PullRequest, PullRequestChecks, PullRequestReview } from "@/lib/git";
import type { RepoState } from "@/lib/git-repo";
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

/**
 * The branch button of the project header, with the whole picture behind it: the branch block and
 * the open pull requests.
 */
export function GitBranchButton({ projectId }: { projectId: string }) {
  const t = useT();
  const repo = useAppStore(state => state.repoState[projectId]);
  const refreshRepoState = useAppStore(state => state.refreshRepoState);
  const [refreshing, setRefreshing] = useState(false);

  if (!repo?.isRepo || !repo.status) return null;
  const status = repo.status;
  const prs = repo.pullRequests;
  const unavailable = unavailableText(t, repo.prsUnavailable);

  const refresh = async () => {
    setRefreshing(true);
    try {
      await refreshRepoState(projectId);
    } finally {
      setRefreshing(false);
    }
  };

  return (
    <Popover>
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
  );
}
