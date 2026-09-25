import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import { useAppStore } from "@/store";
import { getTransport } from "@/lib/transport";
import { useT } from "@/i18n/useT";

export function AcpSetupDialog() {
  const t = useT();
  const acpSetup = useAppStore((state) => state.acpSetup);

  // No se cierra al clickear afuera mientras está instalando.
  const handleOpenChange = (open: boolean) => {
    if (!open && acpSetup.phase !== "error") {
      // only allow closing if error, otherwise use Cancel button or programmatic close
      return;
    }
    if (!open) {
      useAppStore.getState().setAcpSetup({ open: false });
    }
  };

  const handleCancel = () => {
    void getTransport().acpManagedCancel();
  };

  const handleRetry = () => {
    // Retry basically just closes the dialog (or triggers managed ensure again).
    // The orchestrator handles the run starting, so retry from here would mean re-triggering ensure.
    // But since the dialog is opened by the orchestrator run interception,
    // if we just close it, they can click "Run" again.
    // Or we can call acpManagedEnsure here. Wait, orchestrator is waiting for the first acpManagedEnsure to resolve.
    // If we cancel, orchestrator will see it failed. So retry from here:
    // Actually, "reintentar empieza de nuevo, y eso hay que decirlo".
    // If they click retry, we can just call acpManagedEnsure() which will trigger the phase to go from error to download again.
    // But orchestrator is blocked on the first call.
    // Let's check how we handle retry. If they retry, it calls `acpManagedEnsure()` again.
    void getTransport().acpManagedEnsure();
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
          {acpSetup.phase && acpSetup.phase !== "error" && (
            <div className="flex flex-col gap-2">
              <span className="text-sm font-medium">
                {t(`acpSetup.phase.${acpSetup.phase}` as any)}
              </span>
              <Progress value={acpSetup.phase === "adapter-install" ? undefined : percent} />
              {acpSetup.phase === "adapter-install" && acpSetup.message && (
                <span className="text-xs text-muted-foreground font-mono truncate">
                  {acpSetup.message}
                </span>
              )}
            </div>
          )}

          {acpSetup.phase === "error" && (
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
          {acpSetup.phase === "error" ? (
            <div className="flex gap-2">
              <Button variant="ghost" onClick={handleCancel}>{t("acpSetup.cancel")}</Button>
              <Button onClick={handleRetry}>{t("acpSetup.retry")}</Button>
            </div>
          ) : (
            <Button variant="ghost" onClick={handleCancel}>
              {t("acpSetup.cancel")}
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
