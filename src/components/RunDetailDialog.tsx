import { useState, useSyncExternalStore } from "react";
import { useAppStore, selectAllAgents } from "@/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useT, useLocale } from "@/i18n/useT";
import { parseResult } from "@/lib/providers";
import { DiffPanel } from "@/components/DiffPanel";
import { rawLinesOf, rawLinesVersion, subscribeRawLines } from "@/lib/raw-lines";
import { RevertRunButton } from "@/components/RevertRunButton";

export function RunDetailDialog({ runId, open, onOpenChange }: { runId: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const locale = useLocale();
  const runs = useAppStore(state => state.runs);
  const agents = useAppStore(selectAllAgents);

  const run = runId ? runs[runId] : null;
  const agent = run ? agents.find(a => a.id === run.agentId) : null;

  const [promptOpen, setPromptOpen] = useState(false);

  if (!run) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent>
          <DialogHeader><DialogTitle>{t("runDetail.notFound")}</DialogTitle></DialogHeader>
        </DialogContent>
      </Dialog>
    );
  }

  const duration = run.endedAt ? ((run.endedAt - run.startedAt) / 1000).toFixed(1) + "s" : "-";
  const startStr = new Date(run.startedAt).toLocaleTimeString(locale);
  const endStr = run.endedAt ? new Date(run.endedAt).toLocaleTimeString(locale) : "-";
  const parsedRes = run ? parseResult(run.output) : null;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
        <DialogHeader>
          <DialogTitle>{t("runDetail.title")}</DialogTitle>
          <DialogDescription className="flex gap-2 items-center flex-wrap">
            <Badge>{agent?.name || run.agentId}</Badge>
            <Badge variant="outline">{run.status}</Badge>
            <span className="text-xs">{t("thread.round", { n: run.round })}</span>
            <span className="text-xs text-muted-foreground">
              {startStr} - {endStr} ({duration})
            </span>
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto pr-2 space-y-4">
          <div>
            <div 
              className="font-semibold text-sm mb-1 cursor-pointer flex justify-between items-center bg-muted p-2 rounded"
              onClick={() => setPromptOpen(!promptOpen)}
            >
              <span>{t("runDetail.prompt")}</span>
              <span>{promptOpen ? t("runDetail.hide") : t("runDetail.show")}</span>
            </div>
            {promptOpen && (
              <div className="whitespace-pre-wrap text-sm border p-2 rounded bg-background">
                {run.prompt}
              </div>
            )}
          </div>

          <div>
            <h4 className="font-semibold text-sm mb-1">{t("runDetail.finalOutput")}</h4>
            <div className="whitespace-pre-wrap text-sm border p-2 rounded bg-background">
              {run.output || t("thread.noOutput")}
            </div>
            {parsedRes && (
              <div className="mt-2 text-sm border p-2 rounded bg-muted">
                <div className="flex flex-col gap-1">
                  <div><strong>{t("result.files")}:</strong> {parsedRes.files.length ? parsedRes.files.join(", ") : "-"}</div>
                  <div><strong>{t("result.verified")}:</strong> {parsedRes.verified.length ? parsedRes.verified.join(", ") : "-"}</div>
                  <div><strong>{t("result.blocked")}:</strong> {parsedRes.blocked.length ? parsedRes.blocked.join(", ") : "-"}</div>
                </div>
              </div>
            )}
          </div>

          <div className="flex-1 min-h-[200px] flex flex-col">
            <h4 className="font-semibold text-sm mb-1">{t("runDetail.rawOutput")}</h4>
            <div className="flex-1 border p-2 rounded bg-muted overflow-auto font-mono text-xs whitespace-pre-wrap">
              <RawOutput runId={run.id} finished={run.rawLines} empty={t("runDetail.noLogs")} />
            </div>
          </div>

          <div>
            <div className="flex items-center justify-between mb-1">
              <h4 className="font-semibold text-sm">{t("diff.taskTitle")}</h4>
              <RevertRunButton run={run} />
            </div>
            {/* A real height, not a max: the panel is `h-full` and scrolls its own list under a
                header that stays put. Against an auto-height box that header scrolls away. */}
            <div className="h-[50vh] overflow-hidden border rounded bg-background">
              <DiffPanel run={{ cwd: run.cwd, baseSha: run.baseSha }} />
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * The run's raw output: live while it runs, and off the run once it has ended.
 *
 * While a run is alive its lines are in `lib/raw-lines` rather than in the store — keeping them in
 * the store re-rendered every component watching `runs` twelve times a second, for a buffer only
 * this box ever reads. So this box is the one thing that subscribes to them, while it is open.
 */
function RawOutput({ runId, finished, empty }: { runId: string; finished: string[] | undefined; empty: string }) {
  // The version, not the array: the buffer is appended to in place, so its identity never moves.
  useSyncExternalStore(
    onChange => subscribeRawLines(runId, onChange),
    () => rawLinesVersion(runId),
    () => 0,
  );
  const lines = rawLinesOf(runId) ?? finished;
  return <>{lines?.length ? lines.join("\n") : empty}</>;
}
