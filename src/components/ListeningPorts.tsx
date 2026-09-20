// The ports something is listening on here, next to the "N working" indicator, with a button to
// free each one.
//
// Why it exists: an agent's `npm run dev` outlives the run that started it. Three of them left
// 3000, 3001 and 3002 taken with nothing in the app able to show it, let alone free it. The list
// says who has each port; the kill is always the user's call — see `src-tauri/src/ports.rs` for
// why the "who started it" label is a hint and not a filter.
//
// Reads: one when the component mounts (so the counter says something before it is clicked), one
// when the popover opens, one per press of the refresh button. No timer, no watcher, and all three
// go through the same in-flight guard as `refreshRepoStatus` — an answer already on its way is the
// answer to whatever asked again.
import { useCallback, useEffect, useRef, useState } from "react";
import { Plug, RefreshCw, Trash2 } from "lucide-react";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { toast } from "@/components/ui/toast";
import { confirm } from "@/lib/confirm";
import { getTransport } from "@/lib/transport";
import { useAppStore } from "@/store";
import { useT } from "@/i18n/useT";
import type { ListeningPort } from "@/types";

/** The tail of a path is what tells two projects apart; the drive letter never does. */
function folderName(path: string): string {
  const parts = path.replace(/[\\/]+$/, "").split(/[\\/]/);
  return parts[parts.length - 1] || path;
}

export function ListeningPorts() {
  const t = useT();
  const projects = useAppStore(s => s.config.projects);
  const [ports, setPorts] = useState<ListeningPort[]>([]);
  const [busy, setBusy] = useState(false);
  const inFlight = useRef<Promise<void> | null>(null);

  const read = useCallback(() => {
    // One read at a time, whatever asked for it.
    if (inFlight.current) return inFlight.current;
    setBusy(true);
    const roots = projects.map(p => p.workspaceDir).filter((d): d is string => !!d);
    const run = getTransport()
      .listeningPorts(roots)
      .then(list => {
        setPorts([...list].sort((a, b) => a.port - b.port));
      })
      .catch(() => {
        /* nothing to read is shown as nothing, not as an error */
      })
      .finally(() => {
        inFlight.current = null;
        setBusy(false);
      });
    inFlight.current = run;
    return run;
  }, [projects]);

  useEffect(() => {
    void read();
    // Deliberately once, with no dependency on `read`: the project list changing is not a reason
    // to go count ports again, and a dependency on it is how this turns into the loop that took
    // the app down.
  }, []); // eslint-disable-line react-hooks/exhaustive-deps

  const free = useCallback(
    async (entry: ListeningPort) => {
      const ok = await confirm({
        title: t("ports.freeTitle", { port: entry.port }),
        description: t("ports.freeBody", { name: entry.name || entry.pid, pid: entry.pid }),
        destructive: true,
        confirmText: t("ports.freeConfirm"),
      });
      if (!ok) return;
      try {
        await getTransport().killPortProcess(entry.pid);
        toast.success(t("ports.freed", { port: entry.port }));
      } catch {
        toast.error(t("ports.freeFailed", { pid: entry.pid }));
      }
      // Either way: what the list says now is out of date.
      await read();
    },
    [read, t],
  );

  return (
    <Popover onOpenChange={open => open && void read()}>
      <PopoverTrigger asChild>
        <button
          type="button"
          className="inline-flex items-center gap-1.5 rounded px-1.5 py-0.5 transition-colors hover:bg-accent hover:text-foreground cursor-pointer"
          aria-label={t("ports.label", { n: ports.length })}
        >
          <Plug className="h-3 w-3 shrink-0" />
          <span className="tabular-nums font-medium">{t("ports.label", { n: ports.length })}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="start" side="top" className="w-96 p-3">
        <div className="flex items-center justify-between gap-2 border-b border-border pb-2">
          <span className="text-xs font-semibold">{t("ports.title")}</span>
          <button
            type="button"
            className="inline-flex items-center gap-1 rounded px-1 py-0.5 text-[10px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground cursor-pointer disabled:opacity-50"
            onClick={() => void read()}
            disabled={busy}
            aria-label={t("ports.refresh")}
          >
            <RefreshCw className={`h-3 w-3 ${busy ? "animate-spin" : ""}`} />
            <span className="tabular-nums">{ports.length}</span>
          </button>
        </div>
        <div className="mt-2 flex flex-col gap-1 max-h-72 overflow-y-auto">
          {ports.length === 0 ? (
            <p className="text-xs text-muted-foreground py-2 text-center">{t("ports.none")}</p>
          ) : (
            ports.map(entry => (
              <div
                key={`${entry.port}-${entry.pid}`}
                className="flex items-start gap-2 rounded-md p-1.5 transition-colors hover:bg-accent/60 group"
              >
                <span className="mt-0.5 shrink-0 tabular-nums text-xs font-semibold text-foreground w-12">
                  {entry.port}
                </span>
                <div className="min-w-0 flex-1">
                  <div className="flex items-center gap-1.5">
                    <span className="truncate text-xs text-foreground">{entry.name}</span>
                    <span className="shrink-0 text-[10px] text-muted-foreground tabular-nums">
                      {t("ports.pid", { pid: entry.pid })}
                    </span>
                    {entry.project && (
                      <span className="shrink-0 truncate rounded bg-muted px-1 text-[10px] text-muted-foreground">
                        {t("ports.inProject", { name: folderName(entry.project) })}
                      </span>
                    )}
                    {!entry.project && entry.descendant && (
                      <span className="shrink-0 rounded bg-muted px-1 text-[10px] text-muted-foreground">
                        {t("ports.descendant")}
                      </span>
                    )}
                  </div>
                  {entry.command && (
                    <p
                      className="mt-0.5 text-[11px] leading-snug text-muted-foreground line-clamp-2 break-all"
                      title={entry.command}
                    >
                      {entry.command}
                    </p>
                  )}
                </div>
                <button
                  type="button"
                  className="mt-0.5 shrink-0 rounded p-1 text-muted-foreground transition-colors hover:bg-destructive/10 hover:text-destructive cursor-pointer"
                  onClick={() => void free(entry)}
                  aria-label={t("ports.free", { port: entry.port })}
                  title={t("ports.free", { port: entry.port })}
                >
                  <Trash2 className="h-3.5 w-3.5" />
                </button>
              </div>
            ))
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
}
