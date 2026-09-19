// Everything a project needs to point at a board that is not on this machine: which board, and
// which column over there is which column here.
//
// It is its own file rather than more rows inside ProjectDialog because it is the only part of that
// dialog that talks to the network — the "Conectar" button resolves the project so the six selects
// have real options to offer — and because the column mapping is six rows on its own.
//
// The mapping is asked for and never guessed. Matching our column names against the platform's
// would work on a board made from GitHub's template and quietly break on any board somebody
// renamed, filing cards in the wrong column without saying so.
import { useState } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TASK_STATUSES } from "@/lib/tasks";
import { taskStatusMeta } from "@/components/tasks/task-meta";
import { GhBoardError, resolveProject } from "@/lib/board/github-client";
import { useT } from "@/i18n/useT";
import type { BoardProviderId, TaskStatus } from "@/types";

/** What the dialog holds while it is being typed into: the number is still text. */
export interface BoardSourceDraft {
  owner: string;
  number: string;
  columns: Partial<Record<TaskStatus, string>>;
}

export const EMPTY_BOARD_SOURCE: BoardSourceDraft = { owner: "", number: "", columns: {} };

/** The board number as a number, or undefined while what is typed is not one. */
export function boardNumber(draft: BoardSourceDraft): number | undefined {
  const n = Number.parseInt(draft.number, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * Whether this project can be saved. A remote board with a half-finished mapping is not a board
 * that works badly, it is one whose cards land in the wrong column: the provider refuses to run
 * without the six, so the dialog refuses to write it.
 */
export function isBoardSourceComplete(provider: BoardProviderId, draft: BoardSourceDraft): boolean {
  if (provider === "local") return true;
  if (!draft.owner.trim() || boardNumber(draft) === undefined) return false;
  return TASK_STATUSES.every(status => !!draft.columns[status]);
}

export function BoardSourceFields({
  provider,
  value,
  onChange,
}: {
  provider: BoardProviderId;
  value: BoardSourceDraft;
  onChange: (draft: BoardSourceDraft) => void;
}) {
  const t = useT();
  const [options, setOptions] = useState<Array<{ id: string; name: string }>>([]);
  const [title, setTitle] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const number = boardNumber(value);
  const canConnect = !!value.owner.trim() && number !== undefined && !connecting;

  const connect = async () => {
    if (number === undefined) return;
    setConnecting(true);
    setError(null);
    try {
      const project = await resolveProject({ owner: value.owner.trim(), number });
      setOptions(project.statusOptions);
      setTitle(project.title);
      // A project whose status field has no options cannot be mapped at all, and an empty list of
      // selects would read as "it worked" while nothing can be picked.
      if (project.statusOptions.length === 0) setError(t("board.github.error.not-found"));
    } catch (e) {
      setOptions([]);
      setTitle("");
      // The kind, not the message: what GitHub says is an English sentence that changes, and the
      // user needs to know whether this is their token or the network.
      setError(t(`board.github.error.${e instanceof GhBoardError ? e.kind : "network"}`));
    } finally {
      setConnecting(false);
    }
  };

  const setColumn = (status: TaskStatus, optionId: string) => {
    onChange({ ...value, columns: { ...value.columns, [status]: optionId } });
  };

  if (provider === "local") return null;

  return (
    <div className="grid gap-2 rounded-md border border-border p-3">
      <Label>{t("board.github.heading")}</Label>

      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t("board.github.owner")}</span>
          <Input
            value={value.owner}
            onChange={e => onChange({ ...value, owner: e.target.value })}
            placeholder={t("board.github.ownerPlaceholder")}
          />
        </div>
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t("board.github.number")}</span>
          <Input
            type="number"
            min="1"
            step="1"
            value={value.number}
            onChange={e => onChange({ ...value, number: e.target.value })}
            placeholder="1"
          />
        </div>
      </div>
      <p className="text-xs text-muted-foreground">{t("board.github.urlHint")}</p>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!canConnect} onClick={() => void connect()}>
          {connecting ? t("board.github.connecting") : t("board.github.connect")}
        </Button>
        {title && !error && <span className="truncate text-xs text-muted-foreground">{t("board.github.connected", { name: title })}</span>}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {options.length > 0 ? (
        <div className="grid gap-2">
          <span className="text-xs text-muted-foreground">{t("board.github.columns")}</span>
          {TASK_STATUSES.map(status => (
            <div key={status} className="grid grid-cols-[9rem_1fr] items-center gap-2">
              <span className="truncate text-sm">{t(taskStatusMeta[status].labelKey)}</span>
              <Select value={value.columns[status] ?? ""} onValueChange={v => setColumn(status, v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("board.github.columnPlaceholder")} />
                </SelectTrigger>
                <SelectContent>
                  {options.map(option => (
                    <SelectItem key={option.id} value={option.id}>{option.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          ))}
        </div>
      ) : (
        <p className="text-xs text-muted-foreground">{t("board.github.connectHint")}</p>
      )}

      {!isBoardSourceComplete(provider, value) && (
        <p className="text-xs text-amber-600 dark:text-amber-500">{t("board.github.incomplete")}</p>
      )}
      <p className="text-xs text-muted-foreground">{t("board.github.localOnlyHint")}</p>
    </div>
  );
}
