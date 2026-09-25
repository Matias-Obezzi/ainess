// What was written while somebody was busy. A run is a process that has already been given its
// prompt, so a message sent mid-answer cannot reach it: it waits for the next turn. That waiting
// used to be invisible — the message showed up in Comunicación and nowhere else, which read as
// the app having swallowed it.
//
// Everything waiting for the same agent is drawn as one block, because that is what it now is: one
// message (see `lib/queued-prompt`). Each line can still be taken back on its own; sending, which
// is the thing that stopped being per-line, is one button for the block.
import { useState } from "react";
import { Clock, Pencil, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/useT";
import { plural } from "@/i18n";

export interface QueuedLine {
  text: string;
  onCancel(): void;
  onEdit(next: string): void;
}

export interface QueuedGroup {
  /** Who they are waiting for. Left out when there is only one possible recipient (a chat). */
  to?: string;
  lines: QueuedLine[];
  /** Cuts the turn that is running short and hands the whole block over now. */
  onSendNow(): void;
}

export function QueuedMessages({ groups }: { groups: QueuedGroup[] }) {
  const t = useT();
  const [editing, setEditing] = useState<{ key: string; original: string; draft: string } | null>(null);

  const shown = groups.filter(group => group.lines.length > 0);
  if (shown.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {shown.map((group, g) => {
        const n = group.lines.length;
        const groupKey = group.to ?? String(g);
        return (
          <div key={groupKey} className="flex flex-col items-end gap-1">
            <div className="flex max-w-[85%] flex-col gap-1.5 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2">
              {group.lines.map((line, i) => {
                const lineKey = `${groupKey}:${i}`;
                // The queue can drain or shift while the editor is open (a turn ended, a line was
                // sent). Keying only on position would then reattach a stale draft to whatever new
                // line landed at that index, so the original text has to still match too.
                const isEditing = editing?.key === lineKey && editing.original === line.text;

                if (isEditing) {
                  return (
                    <div key={i} className="flex flex-col gap-1.5 py-0.5">
                      <Textarea
                        value={editing.draft}
                        onChange={e => setEditing({ key: lineKey, original: editing.original, draft: e.target.value })}
                        onKeyDown={e => {
                          if (e.key === "Enter" && !e.shiftKey) {
                            e.preventDefault();
                            line.onEdit(editing.draft);
                            setEditing(null);
                          } else if (e.key === "Escape") {
                            e.preventDefault();
                            setEditing(null);
                          }
                        }}
                        autoFocus
                        className="min-h-12 bg-background/80 text-sm"
                      />
                      <div className="flex justify-end gap-1">
                        <Button
                          type="button"
                          variant="ghost"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => setEditing(null)}
                        >
                          {t("common.cancel")}
                        </Button>
                        <Button
                          type="button"
                          variant="secondary"
                          size="sm"
                          className="h-6 px-2 text-[11px]"
                          onClick={() => {
                            line.onEdit(editing.draft);
                            setEditing(null);
                          }}
                        >
                          {t("common.save")}
                        </Button>
                      </div>
                    </div>
                  );
                }

                return (
                  <div key={i} className="flex items-start gap-2">
                    <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
                    <span className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{line.text}</span>
                    <div className="-mr-1 ml-auto flex shrink-0 items-center">
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={() => setEditing({ key: lineKey, original: line.text, draft: line.text })}
                        title={t("common.edit")}
                        aria-label={t("common.edit")}
                      >
                        <Pencil className="h-3.5 w-3.5" />
                      </Button>
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6 shrink-0"
                        onClick={line.onCancel}
                        title={t("queued.cancel")}
                        aria-label={t("queued.cancel")}
                      >
                        <X className="h-3.5 w-3.5" />
                      </Button>
                    </div>
                  </div>
                );
              })}

              {/* One button for the block: what it sends is the block, whichever line you are
                  looking at. Per line it read as a promise the queue no longer makes.
                  While a line is being edited, send-now keeps working: it merges the CURRENT queue,
                  so an unsaved edit is simply not part of it. */}
              <Button
                type="button"
                variant="ghost"
                size="sm"
                className="-mb-1 -mr-1 h-6 self-end px-2 text-[11px] text-muted-foreground"
                onClick={group.onSendNow}
                title={t("queued.sendNowHint")}
              >
                <Zap className="mr-1 h-3.5 w-3.5" />
                {t("queued.sendNow")}
              </Button>
            </div>
            <span className="text-[10px] text-muted-foreground">
              {group.to
                ? plural(n, t("queued.waitingFor.one", { name: group.to }), t("queued.waitingFor.other", { name: group.to }))
                : plural(n, t("queued.waiting.one"), t("queued.waiting.other"))}
            </span>
          </div>
        );
      })}
    </div>
  );
}
