// The screen that installs the managed ACP runtime, and the host that answers `ensureAcpRuntime()`.
//
// Mounted once near the root of the app; nobody renders it to ask for something. It shows the phases
// Rust emits over `acp-setup` (src-tauri/src/acp_setup.rs) and, when an attempt fails, hands retry or
// cancel back to whoever is waiting — see src/lib/acp-setup.ts for the two halves of that.
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAppStore } from "@/store";
import { getTransport } from "@/lib/transport";
import { useT } from "@/i18n/useT";
import type { AcpSetupPhase } from "@/types";
import {
  abortAcpSetup,
  registerAcpSetupHost,
  type AcpSetupDecision,
  type AcpSetupQuestion,
} from "@/lib/acp-setup";

/**
 * One key per phase, written out. A phase renamed on the Rust side then breaks the typecheck here
 * instead of quietly showing the key itself on screen.
 */
const PHASE_KEY: Record<AcpSetupPhase, string> = {
  "runtime-download": "acpSetup.phase.runtime-download",
  "runtime-verify": "acpSetup.phase.runtime-verify",
  "runtime-extract": "acpSetup.phase.runtime-extract",
  "adapter-install": "acpSetup.phase.adapter-install",
  ready: "acpSetup.phase.ready",
  error: "acpSetup.phase.error",
};

export function AcpSetupDialog() {
  const t = useT();
  const acpSetup = useAppStore(state => state.acpSetup);
  const [question, setQuestion] = useState<AcpSetupQuestion | null>(null);

  // On every render, not once on mount: a hot reload re-runs the lib module with an empty
  // registration while this component keeps its effects, and a failed install would then have
  // nowhere to ask what to do next.
  useEffect(() => registerAcpSetupHost(setQuestion));

  const failed = acpSetup.phase === "error";

  const decide = (decision: AcpSetupDecision) => {
    const pending = question;
    setQuestion(null);
    if (pending) pending.resolve(decision);
    // Nothing was waiting on this screen (an event put it on the error face on its own): there is no
    // install to cancel and nobody to answer, so cancel just puts it away.
    else if (decision === "cancel") useAppStore.getState().setAcpSetup({ open: false });
  };

  const handleOpenChange = (open: boolean) => {
    if (open) return;
    // While something is installing the screen is not dismissible: the cancel button is the way out,
    // because it is the one that also tells the install on the other side to stop.
    if (!failed) return;
    decide("cancel");
  };

  const percent = acpSetup.total && acpSetup.received ? (acpSetup.received / acpSetup.total) * 100 : undefined;

  return (
    <Dialog open={acpSetup.open} onOpenChange={handleOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("acpSetup.title")}</DialogTitle>
          <DialogDescription>
            {t("acpSetup.description")}
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-4">
          {acpSetup.phase && !failed && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">
                {t(PHASE_KEY[acpSetup.phase])}
              </span>
              <Progress value={acpSetup.phase === "adapter-install" ? undefined : percent} />
              {acpSetup.phase === "adapter-install" && acpSetup.message && (
                <span className="text-xs text-muted-foreground font-mono truncate">
                  {acpSetup.message}
                </span>
              )}
            </div>
          )}

          {failed && (
            <div className="flex flex-col gap-2">
              <span className="text-sm text-destructive">{acpSetup.message}</span>
              <span className="text-sm text-muted-foreground">{t("acpSetup.retryNotice")}</span>
              <Button variant="outline" size="sm" onClick={() => void getTransport().openLogsDir()}>
                {t("about.openLogs")}
              </Button>
            </div>
          )}
        </div>

        <DialogFooter>
          {failed ? (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => decide("cancel")}>{t("acpSetup.cancel")}</Button>
              <Button onClick={() => decide("retry")}>{t("acpSetup.retry")}</Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={abortAcpSetup}>
              {t("acpSetup.cancel")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
