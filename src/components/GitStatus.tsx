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

const CHECKS_LABEL: Record<PullRequestChecks, string> = {
  passing: "CI en verde",
  failing: "CI con fallas",
  pending: "CI en curso",
  none: "Sin CI",
};

const REVIEW_LABEL: Record<PullRequestReview, string> = {
  approved: "Aprobado",
  "changes-requested": "Cambios pedidos",
  pending: "Revisión pendiente",
  none: "Sin revisión",
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
function unavailableText(reason: RepoState["prsUnavailable"]): string | null {
  switch (reason) {
    case "no-gh":
      return "Instalá la CLI de GitHub para ver los pull requests:";
    case "no-auth":
      return "Iniciá sesión con `gh auth login` para ver los pull requests.";
    case "no-remote":
      return "Este repo no tiene un remoto de GitHub, así que no hay pull requests para mostrar.";
    default:
      return null;
  }
}

/** Sentences for the sidebar tooltip: one per number actually shown. */
function statusSentences(repo: RepoState): string[] {
  const lines: string[] = [];
  const status = repo.status;
  if (status?.branch) lines.push(`Rama ${status.branch}`);
  if (status?.upstream) lines.push(`Sigue a ${status.upstream}`);
  if (status && status.dirty > 0) {
    lines.push(`${status.dirty} archivo${status.dirty === 1 ? "" : "s"} con cambios sin commitear`);
  }
  if (status && status.ahead > 0) {
    lines.push(`${status.ahead} commit${status.ahead === 1 ? "" : "s"} por subir`);
  }
  if (status && status.behind > 0) {
    lines.push(`${status.behind} commit${status.behind === 1 ? "" : "s"} por bajar`);
  }
  const prs = repo.pullRequests;
  if (prs.length > 0) {
    const failing = prs.filter(pr => pr.checks === "failing").length;
    const waiting = prs.filter(pr => pr.review === "pending" || pr.review === "changes-requested").length;
    let detail = "todo en verde";
    if (failing > 0) detail = `${failing} con el CI en rojo`;
    else if (waiting > 0) detail = `${waiting} esperando revisión`;
    lines.push(`${prs.length} pull request${prs.length === 1 ? "" : "s"} abierto${prs.length === 1 ? "" : "s"}: ${detail}`);
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
          {statusSentences(repo).map(line => (
            <span key={line}>{line}</span>
          ))}
        </div>
      </TooltipContent>
    </Tooltip>
  );
}

/** One open pull request inside the header popover. Clicking it opens the PR in the browser. */
function PullRequestRow({ pr }: { pr: PullRequest }) {
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
        <span className="truncate font-medium">{pr.title || "(sin título)"}</span>
        {pr.state === "draft" && (
          <span className="shrink-0 rounded-full border border-border px-1.5 text-[10px] text-muted-foreground">
            Borrador
          </span>
        )}
      </span>
      <span className="flex items-center gap-1.5 pl-5 text-[10px]">
        <span className="truncate text-muted-foreground">{pr.head}</span>
        <span className={cn("ml-auto shrink-0 rounded-full border px-1.5", TONE_CHIP[checksTone(pr.checks)])}>
          {CHECKS_LABEL[pr.checks]}
        </span>
        <span className={cn("shrink-0 rounded-full border px-1.5", TONE_CHIP[reviewTone(pr.review)])}>
          {REVIEW_LABEL[pr.review]}
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
  const repo = useAppStore(state => state.repoState[projectId]);
  const refreshRepoState = useAppStore(state => state.refreshRepoState);
  const [refreshing, setRefreshing] = useState(false);

  if (!repo?.isRepo || !repo.status) return null;
  const status = repo.status;
  const prs = repo.pullRequests;
  const unavailable = unavailableText(repo.prsUnavailable);

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
          className="h-7 shrink-0 gap-1.5 px-2 text-xs font-normal"
          title="Estado del repositorio"
        >
          <GitBranch className="h-3.5 w-3.5" />
          <span className="max-w-[140px] truncate">{status.branch ?? "sin rama"}</span>
          <Signals repo={repo} />
        </Button>
      </PopoverTrigger>
      <PopoverContent align="start" className="w-96 p-3">
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold">Estado del repositorio</span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="ml-auto h-7 gap-1.5 px-2 text-xs"
            disabled={refreshing}
            onClick={() => void refresh()}
          >
            <RefreshCw className={cn("h-3.5 w-3.5", refreshing && "animate-spin")} /> Actualizar
          </Button>
        </div>

        <div className="mt-2 flex flex-col gap-1 rounded-md border border-border p-2">
          <Detail label="Rama" value={status.branch ?? "HEAD suelto"} />
          <Detail label="Remoto" value={status.upstream ?? "sin remoto"} />
          <Detail
            label="Cambios sin commitear"
            value={status.dirty === 0 ? "ninguno" : `${status.dirty} archivo${status.dirty === 1 ? "" : "s"}`}
          />
          <Detail
            label="Adelante / atrás"
            value={
              status.ahead === 0 && status.behind === 0
                ? "al día"
                : `${status.ahead} por subir · ${status.behind} por bajar`
            }
          />
        </div>

        <div className="mt-3 flex flex-col gap-1">
          <span className="px-2 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
            Pull requests abiertos
          </span>
          {prs.length > 0 ? (
            <div className="max-h-64 overflow-y-auto">
              {prs.map(pr => (
                <PullRequestRow key={pr.number} pr={pr} />
              ))}
            </div>
          ) : (
            <p className="px-2 text-xs text-muted-foreground">
              {unavailable ?? "No hay pull requests abiertos."}
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
