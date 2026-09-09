import { useState } from "react";
import type { CommMessage } from "@/types";
import { useAppStore, selectAllAgents } from "@/store";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
  DialogFooter,
} from "@/components/ui/dialog";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { kindLabelKey } from "@/lib/labels";
import { useT, useLocale } from "@/i18n/useT";
import { messageRawText } from "@/lib/message-raw";
import { copyText } from "@/lib/clipboard";
import { cn } from "@/lib/utils";
import { Copy, FileText } from "lucide-react";
import { RunDetailDialog } from "./RunDetailDialog";

function formatMetaInput(input: unknown): string {
  try {
    return typeof input === "string" ? input : JSON.stringify(input, null, 2);
  } catch {
    return "[Could not serialize input]";
  }
}

export function MessageDetailDialog({
  message,
  open,
  onOpenChange,
}: {
  message: CommMessage | null;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const locale = useLocale();
  const agents = useAppStore(selectAllAgents);
  const [runDetailOpen, setRunDetailOpen] = useState(false);

  if (!message) {
    return null;
  }

  const fromAgent = message.fromAgentId === "user" ? null : agents.find(a => a.id === message.fromAgentId);
  const toAgent = message.toAgentId === "user" ? null : agents.find(a => a.id === message.toAgentId);

  const fromName = message.fromAgentId === "user" ? t("label.kind.user") : (fromAgent?.name || message.fromAgentId);
  const toName = message.toAgentId === "user" ? t("label.kind.user") : (toAgent?.name || message.toAgentId);

  const isMono = message.kind === "tool" || message.kind === "stderr";
  const date = new Date(message.ts);
  const fullTimeStr = date.toLocaleString(locale);

  const handleCopy = () => {
    const raw = messageRawText(message, {
      from: fromName,
      to: message.toAgentId ? toName : undefined,
    });
    void copyText(raw, t("messageDetail.copied"));
  };

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="max-w-4xl h-[80vh] flex flex-col">
          <DialogHeader>
            <DialogTitle>{t("messageDetail.title")}</DialogTitle>
            <DialogDescription className="flex gap-2 items-center flex-wrap">
              <Badge>{fromName}</Badge>
              {message.toAgentId && (
                <>
                  <span className="text-muted-foreground text-xs">→</span>
                  <Badge>{toName}</Badge>
                </>
              )}
              <Badge variant="outline">{t(kindLabelKey[message.kind]) || message.kind}</Badge>
              <span className="text-xs text-muted-foreground">{fullTimeStr}</span>
            </DialogDescription>
          </DialogHeader>

          <div className="flex-1 overflow-y-auto pr-2 space-y-4">
            <div
              className={cn(
                "whitespace-pre-wrap break-words border p-3 rounded bg-background select-text max-h-[50vh] overflow-auto",
                isMono && "font-mono text-xs text-muted-foreground"
              )}
            >
              {message.text}
            </div>

            {message.meta && (
              <div className="space-y-3 border p-3 rounded bg-muted/30">
                <div className="flex items-center gap-2 text-sm">
                  <span className="font-semibold">{t("messageDetail.tool")}:</span>
                  <code className="text-xs bg-muted px-1.5 py-0.5 rounded font-mono font-medium">
                    {message.meta.tool}
                  </code>
                </div>

                {message.meta.summary && (
                  <div className="text-sm text-muted-foreground">
                    {message.meta.summary}
                  </div>
                )}

                {message.meta.input !== undefined && (
                  <div>
                    <h4 className="font-semibold text-xs mb-1 text-muted-foreground">
                      {t("messageDetail.toolInput")}
                    </h4>
                    <pre className="p-2 rounded bg-background border overflow-auto max-h-60 font-mono text-xs whitespace-pre-wrap break-words">
                      {formatMetaInput(message.meta.input)}
                    </pre>
                  </div>
                )}

                {message.meta.failed && (
                  <div className="text-xs text-amber-600 dark:text-amber-400">
                    <span className="font-semibold">{t("messageDetail.error")}: </span>
                    <span>{message.meta.error || t("label.status.error")}</span>
                  </div>
                )}
              </div>
            )}
          </div>

          <DialogFooter className="flex items-center justify-between sm:justify-between border-t pt-3 mt-auto">
            <div>
              {message.runId && (
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setRunDetailOpen(true)}
                >
                  <FileText className="h-4 w-4 mr-1.5" />
                  {t("messageDetail.openRun")}
                </Button>
              )}
            </div>
            <Button
              variant="outline"
              size="sm"
              onClick={handleCopy}
            >
              <Copy className="h-4 w-4 mr-1.5" />
              {t("common.copy")}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/*
        Mounted only once it is asked for, not merely because the message has a run behind it. This
        dialog hangs off every row of the feed, and `RunDetailDialog` subscribes to `runs` — which
        is rewritten on every token an agent writes. Rendering it closed put the whole visible feed
        through a re-render twelve times a second for a dialog nobody had opened.
      */}
      {message.runId && runDetailOpen && (
        <RunDetailDialog
          runId={message.runId}
          open
          onOpenChange={setRunDetailOpen}
        />
      )}
    </>
  );
}
