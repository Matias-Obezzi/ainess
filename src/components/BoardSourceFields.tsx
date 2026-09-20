// Everything a project needs to point at a board that is not on this machine: which board, and
// which column over there is which column here.
//
// It is its own file rather than more rows inside ProjectDialog because it is the only part of that
// dialog that talks to the network — the "Conectar" button resolves the board so the six selects
// have real options to offer — and because the column mapping is six rows on its own.
//
// Two platforms share it, and the split is one `PLATFORMS` entry each rather than a component per
// platform: what actually differs is three things — the fields that name the board, whether they
// are filled in, and which client answers "connect" — and all three fit in a value. Everything
// around them (the button and its spinner, the error line, the six selects, the warning that the
// mapping is incomplete) is identical, so it is written once below. If a third platform needs more
// than these three, that is the moment to split this into a component each.
//
// The mapping is asked for and never guessed. Matching our column names against the platform's
// would work on a board made from GitHub's template and quietly break on any board somebody
// renamed, filing cards in the wrong column without saying so.
import { useState, type ReactNode } from "react";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { TASK_STATUSES } from "@/lib/tasks";
import { taskStatusMeta } from "@/components/tasks/task-meta";
import { GhBoardError, resolveProject } from "@/lib/board/github-client";
import { TrelloBoardError, parseBoardId, resolveBoard } from "@/lib/board/trello-client";
import { useT } from "@/i18n/useT";
import type { BoardProviderId, TaskStatus } from "@/types";

/** What the dialog holds while it is being typed into: the number is still text. */
export interface BoardSourceDraft {
  owner: string;
  number: string;
  /** The platform's own handle for the board. Trello's board URL, as pasted. */
  externalId: string;
  columns: Partial<Record<TaskStatus, string>>;
}

export const EMPTY_BOARD_SOURCE: BoardSourceDraft = { owner: "", number: "", externalId: "", columns: {} };

/** The board number as a number, or undefined while what is typed is not one. */
export function boardNumber(draft: BoardSourceDraft): number | undefined {
  const n = Number.parseInt(draft.number, 10);
  return Number.isFinite(n) && n > 0 ? n : undefined;
}

/**
 * The board id inside what was typed, which for Trello is a whole URL. What is written to the
 * config is this and not the URL: the provider addresses the board with it on every request, and
 * re-parsing a pasted link on each one is work the dialog already did.
 */
export function boardExternalId(draft: BoardSourceDraft): string {
  return parseBoardId(draft.externalId);
}

/** One column of the other side: what a select offers. */
interface RemoteColumn {
  id: string;
  name: string;
}

/** What one platform does differently. Everything else about this form is shared. */
interface Platform {
  /** The i18n prefix of its own strings: the heading, the field labels, the hints, the errors. */
  keys: string;
  /** Whether the fields that name the board are filled in well enough to try. */
  addressable(draft: BoardSourceDraft): boolean;
  /** The fields that name the board. */
  fields(draft: BoardSourceDraft, onChange: (draft: BoardSourceDraft) => void, t: ReturnType<typeof useT>): ReactNode;
  /** Asks the platform for the board, so the six selects have real columns to offer. */
  connect(draft: BoardSourceDraft): Promise<{ title: string; columns: RemoteColumn[] }>;
  /** The kind of a failure of its own client, for `<keys>.error.<kind>`. */
  errorKind(e: unknown): string;
}

const PLATFORMS: Partial<Record<BoardProviderId, Platform>> = {
  "github-projects": {
    keys: "board.github",
    addressable: draft => !!draft.owner.trim() && boardNumber(draft) !== undefined,
    fields: (draft, onChange, t) => (
      <div className="grid grid-cols-[1fr_7rem] gap-2">
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t("board.github.owner")}</span>
          <Input
            value={draft.owner}
            onChange={e => onChange({ ...draft, owner: e.target.value })}
            placeholder={t("board.github.ownerPlaceholder")}
          />
        </div>
        <div className="grid gap-1">
          <span className="text-xs text-muted-foreground">{t("board.github.number")}</span>
          <Input
            type="number"
            min="1"
            step="1"
            value={draft.number}
            onChange={e => onChange({ ...draft, number: e.target.value })}
            placeholder="1"
          />
        </div>
      </div>
    ),
    connect: async draft => {
      const project = await resolveProject({ owner: draft.owner.trim(), number: boardNumber(draft) as number });
      return { title: project.title, columns: project.statusOptions };
    },
    errorKind: e => (e instanceof GhBoardError ? e.kind : "network"),
  },

  trello: {
    keys: "board.trello",
    // Not "is it empty": a URL that is not a board URL cannot be connected to, and `parseBoardId`
    // is the same reader the provider uses, so the button greys out on exactly what would fail.
    addressable: draft => !!boardExternalId(draft),
    fields: (draft, onChange, t) => (
      <div className="grid gap-1">
        <span className="text-xs text-muted-foreground">{t("board.trello.board")}</span>
        <Input
          value={draft.externalId}
          onChange={e => onChange({ ...draft, externalId: e.target.value })}
          placeholder={t("board.trello.boardPlaceholder")}
        />
      </div>
    ),
    connect: async draft => {
      const board = await resolveBoard(draft.externalId);
      return { title: board.name, columns: board.lists };
    },
    errorKind: e => (e instanceof TrelloBoardError ? e.kind : "network"),
  },
};

/**
 * Whether this project can be saved. A remote board with a half-finished mapping is not a board
 * that works badly, it is one whose cards land in the wrong column: the provider refuses to run
 * without the six, so the dialog refuses to write it.
 */
export function isBoardSourceComplete(provider: BoardProviderId, draft: BoardSourceDraft): boolean {
  if (provider === "local") return true;
  const platform = PLATFORMS[provider];
  // A provider with no form here is one that is declared and not built: nothing can be filled in
  // for it, so nothing about it is complete.
  if (!platform || !platform.addressable(draft)) return false;
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
  const [options, setOptions] = useState<RemoteColumn[]>([]);
  const [title, setTitle] = useState("");
  const [connecting, setConnecting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const platform = PLATFORMS[provider];
  const canConnect = !!platform && platform.addressable(value) && !connecting;

  const connect = async () => {
    if (!platform) return;
    setConnecting(true);
    setError(null);
    try {
      const board = await platform.connect(value);
      setOptions(board.columns);
      setTitle(board.title);
      // A board with no columns cannot be mapped at all, and an empty list of selects would read
      // as "it worked" while nothing can be picked.
      if (board.columns.length === 0) setError(t(`${platform.keys}.error.not-found`));
    } catch (e) {
      setOptions([]);
      setTitle("");
      // The kind, not the message: what the platform says is an English sentence that changes, and
      // the user needs to know whether this is their token or the network.
      setError(t(`${platform.keys}.error.${platform.errorKind(e)}`));
    } finally {
      setConnecting(false);
    }
  };

  const setColumn = (status: TaskStatus, optionId: string) => {
    onChange({ ...value, columns: { ...value.columns, [status]: optionId } });
  };

  if (!platform) return null;

  return (
    <div className="grid gap-2 rounded-md border border-border p-3">
      <Label>{t(`${platform.keys}.heading`)}</Label>

      {platform.fields(value, onChange, t)}
      <p className="text-xs text-muted-foreground">{t(`${platform.keys}.urlHint`)}</p>

      <div className="flex items-center gap-2">
        <Button type="button" size="sm" variant="outline" disabled={!canConnect} onClick={() => void connect()}>
          {connecting ? t("board.connecting") : t("board.connect")}
        </Button>
        {title && !error && <span className="truncate text-xs text-muted-foreground">{t("board.connected", { name: title })}</span>}
      </div>

      {error && <p className="text-xs text-destructive">{error}</p>}

      {options.length > 0 ? (
        <div className="grid gap-2">
          <span className="text-xs text-muted-foreground">{t("board.columns")}</span>
          {TASK_STATUSES.map(status => (
            <div key={status} className="grid grid-cols-[9rem_1fr] items-center gap-2">
              <span className="truncate text-sm">{t(taskStatusMeta[status].labelKey)}</span>
              <Select value={value.columns[status] ?? ""} onValueChange={v => setColumn(status, v)}>
                <SelectTrigger className="w-full">
                  <SelectValue placeholder={t("board.columnPlaceholder")} />
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
        <p className="text-xs text-muted-foreground">{t("board.connectHint")}</p>
      )}

      {!isBoardSourceComplete(provider, value) && (
        <p className="text-xs text-amber-600 dark:text-amber-500">{t(`${platform.keys}.incomplete`)}</p>
      )}
      <p className="text-xs text-muted-foreground">{t(`${platform.keys}.localOnlyHint`)}</p>
    </div>
  );
}
