// The screen that logs Claude Code in, and the host that answers `ensureClaudeAuth()`.
//
// Mounted once near the root of the app; nobody renders it to ask for something. It comes up when a
// run has already failed for want of a session — see src/lib/claude-auth.ts for the two halves of
// that — and it goes away again as soon as it has an answer, because the login itself happens in a
// terminal in this same window and a modal would be in the way.
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { useAppStore } from "@/store";
import { useT } from "@/i18n/useT";
import {
  registerClaudeAuthHost,
  type ClaudeAuthDecision,
  type ClaudeAuthQuestion,
} from "@/lib/claude-auth";

export function ClaudeAuthDialog() {
  const t = useT();
  const claudeAuth = useAppStore(state => state.claudeAuth);
  const [question, setQuestion] = useState<ClaudeAuthQuestion | null>(null);

  // On every render, not once on mount, for the same reason as the setup screen: a hot reload
  // re-runs the lib module with an empty registration while this component keeps its effects.
  useEffect(() => registerClaudeAuthHost(setQuestion));

  const decide = (decision: ClaudeAuthDecision) => {
    const pending = question;
    setQuestion(null);
    if (pending) pending.resolve(decision);
    // Nobody is waiting on it (the screen was left open by something that already gave up): there
    // is no answer to give, so the only thing left to do is put it away.
    else if (decision === "cancel") useAppStore.getState().setClaudeAuth({ open: false });
  };

  const handleOpenChange = (open: boolean) => {
    if (!open) decide("cancel");
  };

  return (
    <Dialog open={claudeAuth.open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("claudeAuth.title")}</DialogTitle>
          <DialogDescription>
            {claudeAuth.hasEngine ? t("claudeAuth.description") : t("claudeAuth.noEngineDescription")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-2 py-2">
          {claudeAuth.failed && (
            <span className="text-sm text-destructive">{t("claudeAuth.failed")}</span>
          )}
          <span className="text-sm text-muted-foreground">{t("claudeAuth.sharedCredentials")}</span>
        </div>

        <DialogFooter>
          <div className="flex gap-2">
            <Button variant="ghost" onClick={() => decide("cancel")}>{t("claudeAuth.cancel")}</Button>
            {claudeAuth.hasEngine ? (
              <Button onClick={() => decide("login")}>{t("claudeAuth.login")}</Button>
            ) : (
              <Button onClick={() => decide("install")}>{t("claudeAuth.install")}</Button>
            )}
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
