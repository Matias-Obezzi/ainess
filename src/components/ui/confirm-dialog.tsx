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

interface Registry {
  /** Set while a host is mounted; `askInDialog` only reaches the dialog through it. */
  open: ((pending: Pending) => void) | null;
  /** Asked before a host registered. Held, never dropped: a question has to reach somebody. */
  waiting: Pending[];
}

/**
 * On `globalThis`, not in this module's scope. A hot reload during development gives the module a
 * second copy, and the mounted host would be registered in one while whoever asks reads the other:
 * the question then reached nobody.
 */
const registry: Registry = ((globalThis as unknown as { __aisConfirm?: Registry }).__aisConfirm ??= {
  open: null,
  waiting: [],
});

export function askInDialog(request: ConfirmRequest): Promise<boolean> {
  return new Promise<boolean>(resolve => {
    const pending: Pending = { ...request, resolve };
    if (registry.open) registry.open(pending);
    else registry.waiting.push(pending);
  });
}

/** Mount once, near the root of the desktop app. */
export function ConfirmDialogHost() {
  const t = useT();
  const [pending, setPending] = useState<Pending | null>(null);

  // On every render, not once on mount: a hot reload re-runs this module with an empty
  // registration while the mounted component keeps its effects, and the app would then have no
  // way to ask anything.
  useEffect(() => {
    registry.open = setPending;
    const held = registry.waiting.shift();
    if (held) setPending(held);
    return () => {
      // Only if it is still ours: a second host taking over must not be unregistered by the first.
      if (registry.open === setPending) registry.open = null;
    };
  });

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
