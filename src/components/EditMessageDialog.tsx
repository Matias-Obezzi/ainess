// Rewriting a message you already sent, and asking again from there.
//
// It is a dialog rather than an inline field on purpose: this does not only change some text, it
// throws away every answer that came after it and starts the agent's session over. That is worth a
// screen that says so before the button.
import { useEffect, useState } from "react";
import { useAppStore } from "@/store";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { useT } from "@/i18n/useT";
import type { ChatMessage } from "@/types";

export function EditMessageDialog({ message, open, onOpenChange }: {
  message: ChatMessage;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}) {
  const t = useT();
  const editChatMessage = useAppStore(state => state.editChatMessage);
  const [text, setText] = useState(message.text);
  const [sending, setSending] = useState(false);

  // Re-seeded on each open: the message may have been edited since, and a stale draft would send
  // back the version the user already replaced.
  useEffect(() => {
    if (open) setText(message.text);
  }, [open, message.text]);

  const send = async () => {
    const next = text.trim();
    if (!next || sending) return;
    setSending(true);
    try {
      onOpenChange(false);
      await editChatMessage(message.chatId, message.id, next);
    } finally {
      setSending(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{t("chat.edit.title")}</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3">
          <Textarea
            className="min-h-32"
            value={text}
            onChange={e => setText(e.target.value)}
            onKeyDown={e => {
              // Enter sends, as in the composer; Shift+Enter is a new line.
              if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
                e.preventDefault();
                void send();
              }
            }}
            autoFocus
          />
          <p className="text-xs text-muted-foreground">{t("chat.edit.body")}</p>
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={() => void send()} disabled={!text.trim() || sending}>{t("chat.edit.send")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
