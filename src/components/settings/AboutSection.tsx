import { useEffect, useState } from "react";
import { useAppStore } from "@/store";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Progress } from "@/components/ui/progress";
import { toast } from "@/components/ui/toast";
import { isTauri } from "@/lib/tauri";
import { appVersion, checkForUpdate, type UpdateCheck } from "@/lib/updates";
import { getRecentLogs, log } from "@/lib/logger";
import { getTransport } from "@/lib/transport";
import { openExternal } from "@/lib/open-external";
import { ChangelogDialog } from "@/components/settings/ChangelogDialog";
import { Logo } from "@/components/Logo";
import { ClipboardCopy, Download, ExternalLink, FolderOpen, Loader2, RefreshCw, ScrollText } from "lucide-react";
import { useT } from "@/i18n/useT";

const REPO_URL = "https://github.com/Matias-Obezzi/ainess";
const AUTHOR_URL = "https://github.com/Matias-Obezzi";
const TECHNOLOGIES = ["Tauri 2", "React 19", "TypeScript", "Tailwind 4", "Rust"];

/** Configuración > Acerca de: versión, actualizaciones, carpeta de logs y diagnóstico. */
export function AboutSection() {
  const [changelogOpen, setChangelogOpen] = useState(false);
  const t = useT();
  const binaries = useAppStore(state => state.binaries);
  const [version, setVersion] = useState("");
  const [checking, setChecking] = useState(false);
  const [result, setResult] = useState<UpdateCheck | null>(null);
  const [installing, setInstalling] = useState(false);
  const [progress, setProgress] = useState(0);

  useEffect(() => {
    void appVersion().then(setVersion);
  }, []);

  const check = async () => {
    setChecking(true);
    setResult(null);
    try {
      setResult(await checkForUpdate());
    } finally {
      setChecking(false);
    }
  };

  const install = async () => {
    if (!result?.install) return;
    setInstalling(true);
    setProgress(0);
    try {
      await result.install(setProgress);
    } catch (e) {
      toast.error(t("about.installFailed", { error: e instanceof Error ? e.message : String(e) }));
      setInstalling(false);
    }
  };

  const openLogs = async () => {
    try {
      await getTransport().openLogsDir();
    } catch (e) {
      toast.error(t("about.openFolderFailed", { error: e instanceof Error ? e.message : String(e) }));
    }
  };

  const copyDiagnostics = async () => {
    const detected = Object.entries(binaries)
      .map(([id, info]) => `  ${id}: ${info?.path ?? t("about.diag.notFound")}${info?.version ? ` (${info.version})` : ""}`)
      .join("\n");
    const text = [
      `ainess ${version}`,
      t("about.diag.environment", { env: isTauri() ? "app (Tauri)" : "browser", agent: navigator.userAgent }),
      t("about.diag.binaries"),
      detected || `  ${t("about.diag.none")}`,
      "",
      t("about.diag.lastLogLines"),
      ...getRecentLogs(50),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success(t("about.diagCopied"));
    } catch {
      toast.error(t("about.copyFailed"));
    }
  };

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Logo size={24} />
            ainess {version && <Badge variant="secondary">v{version}</Badge>}
          </CardTitle>
          <CardDescription>{t("about.tagline")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            {t("about.createdBy")}{" "}
            <button
              type="button"
              className="cursor-pointer font-medium text-foreground underline underline-offset-2"
              onClick={() => void openExternal(AUTHOR_URL)}
            >
              Matías Obezzi
            </button>
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TECHNOLOGIES.map(tech => (
              <Badge key={tech} variant="outline">{tech}</Badge>
            ))}
          </div>
          <div className="flex flex-wrap gap-1.5">
            <Button variant="ghost" size="sm" onClick={() => setChangelogOpen(true)}>
              <ScrollText className="mr-1 h-4 w-4" /> {t("changelog.open")}
            </Button>
            <Button variant="ghost" size="sm" onClick={() => void openExternal(REPO_URL)}>
              <ExternalLink className="mr-1 h-4 w-4" /> {t("settings.option.about.repository")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("about.updatesTitle")}</CardTitle>
          <CardDescription>{t("about.updatesDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button variant="outline" size="sm" className="self-start" disabled={checking || installing} onClick={() => void check()}>
            {checking ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
            {t("settings.option.about.checkUpdates")}
          </Button>

          {result?.unsupported && (
            <p className="text-sm text-muted-foreground">{t("about.unsupported")}</p>
          )}
          {result?.error && <p className="text-sm text-destructive">{t("about.checkFailed", { error: result.error })}</p>}
          {result && !result.available && !result.error && !result.unsupported && (
            <p className="text-sm text-muted-foreground">{t("about.upToDate", { version })}</p>
          )}
          {result?.available && (
            <div className="flex flex-col gap-2 rounded-md border border-border p-3">
              <span className="text-sm font-semibold">{t("about.newVersion", { version: result.version ?? "" })}</span>
              {result.body && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{result.body}</p>}
              {installing ? (
                <div className="flex flex-col gap-1">
                  <Progress value={progress} />
                  <span className="text-xs text-muted-foreground">
                    {progress >= 100 ? t("about.installing") : t("about.downloading", { progress })}
                  </span>
                </div>
              ) : (
                <Button size="sm" className="self-start" onClick={() => void install()}>
                  <Download className="mr-1 h-4 w-4" /> {t("about.downloadAndInstall")}
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("about.diagnosticsTitle")}</CardTitle>
          <CardDescription>{t("about.diagnosticsDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!isTauri()} onClick={() => void openLogs()}>
            <FolderOpen className="mr-1 h-4 w-4" /> {t("about.openLogs")}
          </Button>
          <Button variant="outline" size="sm" onClick={() => void copyDiagnostics()}>
            <ClipboardCopy className="mr-1 h-4 w-4" /> {t("settings.option.about.copyDiagnostics")}
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { log.info("about", "prueba de log desde Acerca de"); toast.success(t("about.testLineWritten")); }}>
            {t("about.writeTestLine")}
          </Button>
        </CardContent>
      </Card>
      <ChangelogDialog open={changelogOpen} onOpenChange={setChangelogOpen} />
    </div>
  );
}
