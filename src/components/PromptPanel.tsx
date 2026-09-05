import { useState, useEffect } from "react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { StatusDot } from "./StatusDot";

function formatTimeAgo(ts: number, now: number) {
  const diffSecs = Math.max(0, Math.floor((now - ts) / 1000));
  if (diffSecs < 60) return `hace ${diffSecs} seg`;
  const diffMins = Math.floor(diffSecs / 60);
  if (diffMins < 60) return `hace ${diffMins} min`;
  const diffHours = Math.floor(diffMins / 60);
  return `hace ${diffHours} h`;
}

function formatElapsed(secs: number) {
  const m = Math.floor(secs / 60);
  const s = secs % 60;
  return `${m}:${s.toString().padStart(2, '0')}`;
}

export function PromptPanel() {
  const [prompt, setPrompt] = useState("");
  const [now, setNow] = useState(Date.now());
  const [expandedLast, setExpandedLast] = useState(false);
  
  const config = useAppStore(state => state.config);
  const runtime = useAppStore(state => state.runtime);
  const binaries = useAppStore(state => state.binaries);
  const submitPrompt = useAppStore(state => state.submitPrompt);
  const activeTaskRunId = useAppStore(state => state.activeTaskRunId);
  const runs = useAppStore(state => state.runs);
  const messages = useAppStore(state => state.messages);
  const stopAll = useAppStore(state => state.stopAll);

  const roots = config.agents.filter(a => a.parentId === null);
  const defaultAgent = roots.find(a => a.role === "planner") || roots[0];
  const [targetId, setTargetId] = useState<string>(defaultAgent?.id || "");

  const targetAgent = config.agents.find(a => a.id === targetId);
  const targetRuntime = targetAgent ? runtime[targetId] : null;
  const isWorking = targetRuntime?.status === "working";
  const binaryInfo = targetAgent ? binaries[targetAgent.provider] : undefined;
  
  const handleSend = () => {
    if (!prompt.trim() || isWorking || !targetId) return;
    void submitPrompt(prompt, targetId);
    setPrompt("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      handleSend();
    }
  };

  useEffect(() => {
    const interval = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(interval);
  }, []);

  const activeRun = activeTaskRunId ? runs[activeTaskRunId] : null;
  
  let taskCard = null;
  if (activeRun) {
    const rootAgent = config.agents.find(a => a.id === activeRun.agentId);
    const taskRuns = Object.values(runs).filter(r => r.rootRunId === activeTaskRunId);
    const currentRound = Math.max(0, ...taskRuns.map(r => r.round));
    const runningCount = taskRuns.filter(r => r.status === "running").length;
    const elapsedSecs = Math.max(0, Math.floor((now - activeRun.startedAt) / 1000));

    taskCard = (
      <Card className="p-4 bg-muted/50 border-primary/20">
        <h3 className="font-semibold text-sm mb-2 text-primary">Tarea en curso</h3>
        <div className="flex flex-col gap-1 text-sm">
          <div><span className="font-medium">Agente raíz:</span> {rootAgent?.name || activeRun.agentId}</div>
          <div><span className="font-medium">Ronda actual:</span> {currentRound + 1}</div>
          <div><span className="font-medium">Tiempo transcurrido:</span> {formatElapsed(elapsedSecs)}</div>
          <div><span className="font-medium">Runs activos:</span> {runningCount}</div>
        </div>
        <Button variant="destructive" size="sm" className="mt-3 w-full" onClick={() => void stopAll()}>
          Detener tarea
        </Button>
      </Card>
    );
  } else {
    const lastResultMsg = messages.slice().reverse().find(m => m.kind === "result" && m.toAgentId === "user");
    if (lastResultMsg) {
      taskCard = (
        <Card className="p-4">
          <div className="flex justify-between items-center mb-2">
            <h3 className="font-semibold text-sm">Última tarea</h3>
            <span className="text-xs text-muted-foreground">{formatTimeAgo(lastResultMsg.ts, now)}</span>
          </div>
          <div 
            className={`text-sm bg-muted p-2 rounded cursor-pointer whitespace-pre-wrap ${expandedLast ? "" : "line-clamp-3"}`}
            onClick={() => setExpandedLast(!expandedLast)}
          >
            {lastResultMsg.text}
          </div>
        </Card>
      );
    }
  }

  const history = messages
    .filter(m => m.kind === "user")
    .slice(-10)
    .reverse();

  return (
    <div className="p-4 flex flex-col gap-4 h-full overflow-hidden">
      <div className="flex flex-col gap-2 shrink-0">
        <Textarea 
          placeholder="Escribí tu tarea aquí... (Ctrl+Enter para enviar)"
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          onKeyDown={handleKeyDown}
          className="min-h-[120px]"
        />
        <div className="flex gap-2 items-center">
          <Select value={targetId} onValueChange={setTargetId}>
            <SelectTrigger className="w-[250px]">
              <SelectValue placeholder="Destino" />
            </SelectTrigger>
            <SelectContent>
              {config.agents.map(a => (
                <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button onClick={handleSend} disabled={!prompt.trim() || isWorking || !targetId}>
            Enviar
          </Button>
        </div>
      </div>

      {targetAgent && binaryInfo === null && (
        <Alert variant="destructive" className="shrink-0">No se detectó el CLI de {targetAgent.provider}</Alert>
      )}

      {taskCard && <div className="shrink-0">{taskCard}</div>}

      <div className="flex-1 overflow-auto min-h-0">
        <h3 className="text-sm font-semibold mb-2">Historial</h3>
        <div className="flex flex-col gap-2">
          {history.map(m => (
            <div 
              key={m.id} 
              className="p-2 border border-border rounded cursor-pointer hover:bg-muted text-sm truncate"
              onClick={() => setPrompt(m.text)}
            >
              {m.text}
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
