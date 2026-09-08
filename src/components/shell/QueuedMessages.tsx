// What was written while somebody was busy. A run is a process that has already been given its
// prompt, so a message sent mid-answer cannot reach it: it waits for the next turn. That waiting
// used to be invisible — the message showed up in Comunicación and nowhere else, which read as
// the app having swallowed it.
import { Clock, X, Zap } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/useT";

export interface QueuedMessage {
  text: string;
  /** Who it is waiting for. Left out when there is only one possible recipient (a chat). */
  to?: string;
  onCancel(): void;
  /** Cuts the turn that is running short and hands this over now. */
  onSendNow(): void;
}

export function QueuedMessages({ messages }: { messages: QueuedMessage[] }) {
  const t = useT();
  if (messages.length === 0) return null;

  return (
    <div className="flex flex-col gap-2">
      {messages.map((message, i) => (
        <div key={i} className="flex flex-col items-end gap-1">
          <div className="flex max-w-[85%] items-start gap-2 rounded-lg border border-dashed border-border bg-muted/40 px-3 py-2">
            <Clock className="mt-0.5 h-3.5 w-3.5 shrink-0 text-muted-foreground" />
            <span className="whitespace-pre-wrap break-words text-sm text-muted-foreground">{message.text}</span>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="h-6 w-6 shrink-0"
              onClick={message.onSendNow}
              title={t("queued.sendNowHint")}
              aria-label={t("queued.sendNow")}
            >
              <Zap className="h-3.5 w-3.5" />
            </Button>
            <Button
              type="button"
              variant="ghost"
              size="icon"
              className="-mr-1 h-6 w-6 shrink-0"
              onClick={message.onCancel}
              title={t("queued.cancel")}
              aria-label={t("queued.cancel")}
            >
              <X className="h-3.5 w-3.5" />
            </Button>
          </div>
          <span className="text-[10px] text-muted-foreground">
            {message.to ? t("queued.waitingFor", { name: message.to }) : t("queued.waiting")}
          </span>
        </div>
      ))}
    </div>
  );
}
