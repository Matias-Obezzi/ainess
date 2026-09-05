import { useState } from "react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Card } from "@/components/ui/card";
import { Alert } from "@/components/ui/alert";
import { StatusDot } from "./StatusDot";

export function PromptPanel() {
  const [prompt, setPrompt] = useState("");
  
  const config = useAppStore(state => state.config);
  const runtime = useAppStore(state => state.runtime);
  const binaries = useAppStore(state => state.binaries);
  const submitPrompt = useAppStore(state => state.submitPrompt);
  const activeTaskRunId = useAppStore(state => state.activeTaskRunId);
  const runs = useAppStore(state => state.runs);
  const messages = useAppStore(state => state.messages);

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

  const activeRun = activeTaskRunId ? runs[activeTaskRunId] : null;

  const history = messages
    .filter(m => m.kind === "user")
    .slice(-10)
    .reverse();

  return (
    <div className="p-4 flex flex-col gap-4 h-full">
      <div className="flex flex-col gap-2">
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
        <Alert variant="destructive">No se detectó el CLI de {targetAgent.provider}</Alert>
      )}

      {activeRun && (
        <Card className="p-4">
          <h3 className="font-semibold mb-2">Tarea Activa (Ronda {activeRun.round + 1})</h3>
          <div className="flex flex-col gap-2">
            {config.agents.map(a => {
              const r = runtime[a.id];
              if (!r || r.status === "idle") return null;
              return (
                <div key={a.id} className="flex items-center gap-2 text-sm">
                  <StatusDot status={r.status} />
                  <span className="font-medium">{a.name}:</span>
                  <span className="truncate text-muted-foreground">{r.currentTask || r.status}</span>
                </div>
              );
            })}
          </div>
        </Card>
      )}

      <div className="flex-1 overflow-auto">
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
