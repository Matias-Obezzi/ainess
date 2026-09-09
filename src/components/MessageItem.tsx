import { memo, useState } from "react";
import { CommMessage } from "@/types";
import { useAppStore, selectAllAgents } from "@/store";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { kindLabelKey } from "@/lib/labels";
import { useT } from "@/i18n/useT";
import { cn } from "@/lib/utils";
import { FileText } from "lucide-react";
import { MessageDetailDialog } from "./MessageDetailDialog";
import { ErrorMessage } from "./ErrorMessage";
import { Markdown } from "@/components/shell/Markdown";

export const MessageItem = memo(function MessageItem({ message }: { message: CommMessage }) {
  const t = useT();
  const agents = useAppStore(selectAllAgents);
  
  const fromAgent = message.fromAgentId === "user" ? null : agents.find(a => a.id === message.fromAgentId);
  const toAgent = message.toAgentId === "user" ? null : agents.find(a => a.id === message.toAgentId);
  
  const fromName = message.fromAgentId === "user" ? t("label.kind.user") : (fromAgent?.name || message.fromAgentId);
  const fromColor = fromAgent?.color || "#888";
  
  const toName = message.toAgentId === "user" ? t("label.kind.user") : (toAgent?.name || message.toAgentId);
  const toColor = toAgent?.color || "#888";

  const date = new Date(message.ts);
  const timeStr = `${date.getHours().toString().padStart(2, '0')}:${date.getMinutes().toString().padStart(2, '0')}:${date.getSeconds().toString().padStart(2, '0')}`;

  const isMono = message.kind === "tool" || message.kind === "stderr";
  const isDelegation = message.kind === "delegation";

  /**
   * What an agent wrote, rendered the way it meant it.
   *
   * Only what is prose. A tool line is a machine's, and markdown would read
   * `src/lib/__tests__/x.ts` as an instruction to make part of it bold — the same for stderr, and
   * for what the user typed, which is shown back as it was typed, like the chat does.
   */
  const isProse = message.kind === "text"
    || message.kind === "delegation"
    || message.kind === "result"
    || message.kind === "note";

  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <>
      <div 
        className={cn("flex flex-col gap-1 p-3 text-sm border-b border-border min-w-0", isDelegation && "border-l-4")}
        style={isDelegation ? { borderLeftColor: toColor } : undefined}
      >
        {/*
          The dock is narrow and two agent names, a time, a badge and a button do not fit in it by
          right. Everything that must keep its size says so; the names are what gives, because a
          name cut short still tells you who, and a row that cannot shrink pushes the panel wider
          than the space it has.
        */}
        <div className="flex items-center gap-2 min-w-0">
          <div className="w-3 h-3 shrink-0 rounded-full" style={{ backgroundColor: fromColor }} />
          <span className="font-semibold truncate">{fromName}</span>
          {message.toAgentId && (
            <>
              <span className="text-muted-foreground shrink-0">→</span>
              <span className="font-semibold truncate">{toName}</span>
            </>
          )}
          <span className="text-xs text-muted-foreground ml-auto shrink-0">{timeStr}</span>
          <Badge variant="outline" className="shrink-0">{t(kindLabelKey[message.kind]) || message.kind}</Badge>
          <Tooltip>
            <TooltipTrigger asChild>
              <Button
                variant="ghost"
                size="icon"
                className="h-5 w-5 ml-1 text-muted-foreground"
                aria-label={t("messageDetail.viewRaw")}
                onClick={() => setDetailOpen(true)}
              >
                <FileText className="h-3.5 w-3.5" />
              </Button>
            </TooltipTrigger>
            <TooltipContent side="bottom">
              {t("messageDetail.viewRaw")}
            </TooltipContent>
          </Tooltip>
        </div>
        {message.kind === "error" ? (
          <ErrorMessage text={message.text} className="mt-1" />
        ) : isProse ? (
          <Markdown text={message.text} className="mt-1" />
        ) : (
          <div
            className={cn(
              "mt-1 whitespace-pre-wrap break-words",
              isMono && "font-mono text-xs",
              message.kind === "tool" && message.meta?.failed ? "text-amber-600 dark:text-amber-400" : (isMono ? "text-muted-foreground" : "")
            )}
            title={message.kind === "tool" && message.meta?.failed && message.meta?.error ? message.meta.error : undefined}
          >
            {message.text}
          </div>
        )}
      </div>
      <MessageDetailDialog
        message={message}
        open={detailOpen}
        onOpenChange={setDetailOpen}
      />
    </>
  );
});
