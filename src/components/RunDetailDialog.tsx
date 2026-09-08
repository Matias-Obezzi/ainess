import { useState } from "react";
import { useAppStore, selectAllAgents } from "@/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { useT, useLocale } from "@/i18n/useT";
import { parseResult } from "@/lib/providers";

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
              {run.rawLines?.join("\n") || t("runDetail.noLogs")}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
