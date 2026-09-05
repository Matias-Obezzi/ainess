import { useState, useEffect } from "react";
import { useAppStore } from "@/store";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";

/** "Segundo plano" (tray/notifications) and "Orquestación" (maxRounds, approvals, model auto-selection). */
export function GeneralSection() {
  const config = useAppStore(state => state.config);
  const updateConfig = useAppStore(state => state.updateConfig);
  const setMaxRounds = useAppStore(state => state.setMaxRounds);

  const [maxRoundsText, setMaxRoundsText] = useState(String(config.maxRounds));
  useEffect(() => {
    setMaxRoundsText(String(config.maxRounds));
  }, [config.maxRounds]);

  const commitMaxRounds = (value: string) => {
    const n = parseInt(value, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 20) {
      setMaxRounds(n);
    } else {
      setMaxRoundsText(String(config.maxRounds));
    }
  };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>Segundo plano</CardTitle>
          <CardDescription>Con esto apagado, cerrar la ventana cierra la app.</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={config.tray.enabled}
              onCheckedChange={(checked) => updateConfig({ tray: { ...config.tray, enabled: checked } })}
            />
            <div className="flex flex-col">
              <label className="text-sm font-semibold">Seguir en la bandeja al cerrar la ventana</label>
              <span className="text-sm text-muted-foreground">La app queda corriendo en segundo plano y se puede volver a abrir desde el icono de la bandeja.</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={config.tray.notifyApprovals}
              onCheckedChange={(checked) => updateConfig({ tray: { ...config.tray, notifyApprovals: checked } })}
            />
            <div className="flex flex-col">
              <label className="text-sm font-semibold">Notificar cuando un agente necesita permiso</label>
              <span className="text-sm text-muted-foreground">Una notificación del sistema cuando queda una delegación esperando tu aprobación.</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={config.tray.notifyResults}
              onCheckedChange={(checked) => updateConfig({ tray: { ...config.tray, notifyResults: checked } })}
            />
            <div className="flex flex-col">
              <label className="text-sm font-semibold">Notificar cuando termina una tarea</label>
              <span className="text-sm text-muted-foreground">Una notificación del sistema cuando un agente termina de responder al usuario.</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>Orquestación</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold">Rondas máximas por tarea</label>
            <Input
              type="number"
              min={1}
              max={20}
              className="w-24"
              value={maxRoundsText}
              onChange={e => setMaxRoundsText(e.target.value)}
              onBlur={e => commitMaxRounds(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">Cuántas continuaciones automáticas puede encadenar el planificador para una misma tarea del usuario.</span>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t">
            <Switch
              checked={config.autoModel}
              onCheckedChange={(checked) => updateConfig({ autoModel: checked })}
            />
            <div className="flex flex-col">
              <label className="text-sm font-semibold">Auto-selección de modelos por el Orquestador</label>
              <span className="text-sm text-muted-foreground">Si está activo, el planificador elegirá automáticamente el modelo adecuado (flash, pro, etc) para cada tarea delegada a los agentes.</span>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t">
            <Switch
              checked={config.approveDelegations}
              onCheckedChange={(checked) => updateConfig({ approveDelegations: checked })}
            />
            <div className="flex flex-col">
              <label className="text-sm font-semibold">Aprobar todas las delegaciones</label>
              <span className="text-sm text-muted-foreground">Cada tarea que el planificador delegue queda en espera hasta que la apruebes desde la app, el CLI o el celular.</span>
            </div>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
