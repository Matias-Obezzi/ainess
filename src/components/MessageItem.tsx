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

  const [detailOpen, setDetailOpen] = useState(false);

  return (
    <>
      <div 
        className={cn("flex flex-col gap-1 p-3 text-sm border-b border-border", isDelegation && "border-l-4")}
        style={isDelegation ? { borderLeftColor: toColor } : undefined}
      >
        <div className="flex items-center gap-2">
          <div className="w-3 h-3 rounded-full" style={{ backgroundColor: fromColor }} />
          <span className="font-semibold">{fromName}</span>
          {message.toAgentId && (
            <>
              <span className="text-muted-foreground">→</span>
              <span className="font-semibold">{toName}</span>
            </>
          )}
          <span className="text-xs text-muted-foreground ml-auto">{timeStr}</span>
          <Badge variant="outline">{t(kindLabelKey[message.kind]) || message.kind}</Badge>
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
