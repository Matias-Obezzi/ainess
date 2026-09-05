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
import { ClipboardCopy, Download, ExternalLink, FolderOpen, Loader2, RefreshCw } from "lucide-react";

const REPO_URL = "https://github.com/Matias-Obezzi/ainess";
const AUTHOR_URL = "https://github.com/Matias-Obezzi";
const TECHNOLOGIES = ["Tauri 2", "React 19", "TypeScript", "Tailwind 4", "Rust"];

async function openExternal(url: string): Promise<void> {
  if (isTauri()) {
    try {
      const { openUrl } = await import("@tauri-apps/plugin-opener");
      await openUrl(url);
      return;
    } catch {
      /* fall through to the browser */
    }
  }
  window.open(url, "_blank", "noopener");
}

/** Configuración > Acerca de: versión, actualizaciones, carpeta de logs y diagnóstico. */
export function AboutSection() {
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
      toast.error(`No se pudo instalar: ${e instanceof Error ? e.message : String(e)}`);
      setInstalling(false);
    }
  };

  const openLogs = async () => {
    try {
      await getTransport().openLogsDir();
    } catch (e) {
      toast.error(`No se pudo abrir la carpeta: ${e instanceof Error ? e.message : String(e)}`);
    }
  };

  const copyDiagnostics = async () => {
    const detected = Object.entries(binaries)
      .map(([id, info]) => `  ${id}: ${info?.path ?? "no detectado"}${info?.version ? ` (${info.version})` : ""}`)
      .join("\n");
    const text = [
      `ainess ${version}`,
      `Entorno: ${isTauri() ? "app (Tauri)" : "navegador"} — ${navigator.userAgent}`,
      "Binarios:",
      detected || "  (ninguno)",
      "",
      "Últimas líneas del log:",
      ...getRecentLogs(50),
    ].join("\n");
    try {
      await navigator.clipboard.writeText(text);
      toast.success("Diagnóstico copiado");
    } catch {
      toast.error("No se pudo copiar");
    }
  };

  return (
    <div className="flex max-w-2xl flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            ainess {version && <Badge variant="secondary">v{version}</Badge>}
          </CardTitle>
          <CardDescription>Orquestador local de agentes de IA.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <p className="text-sm text-muted-foreground">
            Creada por{" "}
            <button
              type="button"
              className="cursor-pointer font-medium text-foreground underline underline-offset-2"
              onClick={() => void openExternal(AUTHOR_URL)}
            >
              Matías Obezzi
            </button>
            .
          </p>
          <div className="flex flex-wrap gap-1.5">
            {TECHNOLOGIES.map(t => (
              <Badge key={t} variant="outline">{t}</Badge>
            ))}
          </div>
          <Button variant="ghost" size="sm" className="self-start" onClick={() => void openExternal(REPO_URL)}>
            <ExternalLink className="mr-1 h-4 w-4" /> Repositorio
          </Button>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Actualizaciones</CardTitle>
          <CardDescription>Las versiones nuevas se publican en GitHub y se instalan desde acá.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-3">
          <Button variant="outline" size="sm" className="self-start" disabled={checking || installing} onClick={() => void check()}>
            {checking ? <Loader2 className="mr-1 h-4 w-4 animate-spin" /> : <RefreshCw className="mr-1 h-4 w-4" />}
            Buscar actualizaciones
          </Button>

          {result?.unsupported && (
            <p className="text-sm text-muted-foreground">Las actualizaciones automáticas solo funcionan en la app instalada.</p>
          )}
          {result?.error && <p className="text-sm text-destructive">No se pudo consultar: {result.error}</p>}
          {result && !result.available && !result.error && !result.unsupported && (
            <p className="text-sm text-muted-foreground">Estás al día ({version}).</p>
          )}
          {result?.available && (
            <div className="flex flex-col gap-2 rounded-md border border-border p-3">
              <span className="text-sm font-semibold">Hay una versión nueva: {result.version}</span>
              {result.body && <p className="whitespace-pre-wrap text-xs text-muted-foreground">{result.body}</p>}
              {installing ? (
                <div className="flex flex-col gap-1">
                  <Progress value={progress} />
                  <span className="text-xs text-muted-foreground">
                    {progress >= 100 ? "Instalando y reiniciando…" : `Descargando… ${progress}%`}
                  </span>
                </div>
              ) : (
                <Button size="sm" className="self-start" onClick={() => void install()}>
                  <Download className="mr-1 h-4 w-4" /> Descargar e instalar
                </Button>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Diagnóstico</CardTitle>
          <CardDescription>
            Todo lo que pasa por la consola y los eventos del backend se guardan en archivos con rotación diaria
            (se borran solos a los 14 días).
          </CardDescription>
        </CardHeader>
        <CardContent className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" disabled={!isTauri()} onClick={() => void openLogs()}>
            <FolderOpen className="mr-1 h-4 w-4" /> Abrir carpeta de logs
          </Button>
          <Button variant="outline" size="sm" onClick={() => void copyDiagnostics()}>
            <ClipboardCopy className="mr-1 h-4 w-4" /> Copiar diagnóstico
          </Button>
          <Button variant="ghost" size="sm" onClick={() => { log.info("about", "prueba de log desde Acerca de"); toast.success("Línea de prueba escrita en el log"); }}>
            Escribir línea de prueba
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
