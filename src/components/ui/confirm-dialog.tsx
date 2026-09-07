// The desktop half of `confirm()` (see src/lib/confirm.ts): one dialog, mounted once, that any
// code can open and await. Callers never render it — they ask a question and get an answer, the
// same shape the island gives on the phone, so a component shared by both builds stays unaware of
// which one it is in.
import { useEffect, useState } from "react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useT } from "@/i18n/useT";

export interface ConfirmRequest {
  title: string;
  description?: string;
  confirmText?: string;
  cancelText?: string;
  destructive?: boolean;
}

interface Pending extends ConfirmRequest {
  resolve: (answer: boolean) => void;
}

/** Set while the host is mounted; `askInDialog` is only reachable through it. */
let openRequest: ((pending: Pending) => void) | null = null;

/** Whether a dialog host is around to answer. `confirm()` needs to know before it picks. */
export function dialogAvailable(): boolean {
  return openRequest !== null;
}

export function askInDialog(request: ConfirmRequest): Promise<boolean> {
  const open = openRequest;
  if (!open) return Promise.resolve(false);
  return new Promise<boolean>(resolve => open({ ...request, resolve }));
}

/** Mount once, near the root of the desktop app. */
export function ConfirmDialogHost() {
  const t = useT();
  const [pending, setPending] = useState<Pending | null>(null);

  useEffect(() => {
    openRequest = setPending;
    return () => {
      openRequest = null;
    };
  }, []);

  // Closing by any means — Escape, the overlay, the cancel button — is a no.
  const answer = (value: boolean) => {
    pending?.resolve(value);
    setPending(null);
  };

  return (
    <Dialog open={!!pending} onOpenChange={open => !open && answer(false)}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{pending?.title}</DialogTitle>
          {pending?.description && <DialogDescription>{pending.description}</DialogDescription>}
        </DialogHeader>
        <DialogFooter>
          <Button variant="outline" onClick={() => answer(false)}>
            {pending?.cancelText ?? t("common.cancel")}
          </Button>
          {/* Focused on open, so Enter answers and Escape refuses without touching the mouse. */}
          <Button
            autoFocus
            variant={pending?.destructive ? "destructive" : "default"}
            onClick={() => answer(true)}
          >
            {pending?.confirmText ?? t("common.accept")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
