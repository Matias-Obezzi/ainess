// Configuración → Diagnóstico: runs the checks of src/lib/diagnostics.ts and shows one row per
// check with its level, what it found and what to do about it. Read-only: nothing here fixes
// anything, and no token, authtoken or API key ever reaches the screen or the clipboard.
import { useCallback, useEffect, useState } from "react";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";
import {
  collectDiagnostics,
  formatDiagnosticsReport,
  type DiagnosticLevel,
  type DiagnosticResult,
} from "@/lib/diagnostics";
import { AlertTriangle, CheckCircle2, ClipboardCopy, Loader2, RefreshCw, XCircle } from "lucide-react";
import { useT } from "@/i18n/useT";

const LEVEL_ICON = { ok: CheckCircle2, warn: AlertTriangle, error: XCircle };
const LEVEL_COLOR: Record<DiagnosticLevel, string> = {
  ok: "text-emerald-600 dark:text-emerald-400",
  warn: "text-amber-600 dark:text-amber-400",
  error: "text-destructive",
};

export function DiagnosticsSection() {
  const t = useT();
  const [results, setResults] = useState<DiagnosticResult[] | null>(null);
  const [running, setRunning] = useState(false);

  const run = useCallback(async () => {
    setRunning(true);
    try {
      setResults(await collectDiagnostics(t, { refreshQuota: true }));
    } finally {
      setRunning(false);
    }
  }, [t]);

  useEffect(() => {
    void run();
  }, [run]);

  const copy = async () => {
    if (!results) return;
    const header = `${t("diagnostics.reportTitle")} — ${new Date().toISOString()}`;
    try {
      await navigator.clipboard.writeText(formatDiagnosticsReport(results, t, header));
      toast.success(t("diagnostics.copied"));
    } catch {
      toast.error(t("diagnostics.copyFailed"));
    }
  };

  const counts = {
    ok: results?.filter(r => r.level === "ok").length ?? 0,
    warn: results?.filter(r => r.level === "warn").length ?? 0,
    error: results?.filter(r => r.level === "error").length ?? 0,
  };

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2">
        <Button variant="outline" size="sm" disabled={running} onClick={() => void run()}>
          {running ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
          {t("settings.option.diagnostics.recheck")}
        </Button>
        <Button variant="outline" size="sm" disabled={!results} onClick={() => void copy()}>
          <ClipboardCopy className="mr-1 h-4 w-4" /> {t("settings.option.diagnostics.copy")}
        </Button>
        {results && (
          <span className="text-xs text-muted-foreground">{t("diagnostics.summary", counts)}</span>
        )}
      </div>

      <p className="text-xs text-muted-foreground">{t("diagnostics.description")}</p>

      {!results ? (
        <div className="flex flex-col gap-2">
          {[0, 1, 2, 3, 4, 5].map(i => (
            <Skeleton key={i} className="h-16 w-full" />
          ))}
        </div>
      ) : (
        <div className="flex flex-col gap-2">
          {results.map(result => {
            const Icon = LEVEL_ICON[result.level];
            return (
              <div key={result.id} className="flex gap-3 rounded-md border border-border p-3">
                <Icon className={cn("mt-0.5 h-4 w-4 shrink-0", LEVEL_COLOR[result.level])} />
                <div className="flex min-w-0 flex-col gap-1">
                  <span className="text-sm font-medium">{result.title}</span>
                  <span className="text-xs break-words text-muted-foreground">{result.detail}</span>
                  {result.hint && <span className="text-xs break-words text-foreground/80">→ {result.hint}</span>}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
