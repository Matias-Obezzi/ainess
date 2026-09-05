import { useEffect, useState } from "react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROVIDERS } from "@/lib/providers";
import { isChatActive } from "@/lib/chat";
import { Send, Square } from "lucide-react";

/** Prompts sent in this session, newest last. Kept out of the store: it is UI-only scratch. */
const sentHistory: string[] = [];

/** The input pinned at the bottom of the project screen: orchestrator prompt or chat message. */
export function Composer() {
  const config = useAppStore(state => state.config);
  const binaries = useAppStore(state => state.binaries);
  const runtime = useAppStore(state => state.runtime);
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const currentChatId = useAppStore(state => state.currentChatId);
  const submitPrompt = useAppStore(state => state.submitPrompt);
  const sendChatMessage = useAppStore(state => state.sendChatMessage);
  const stopChat = useAppStore(state => state.stopChat);
  const stopAll = useAppStore(state => state.stopAll);

  const [text, setText] = useState("");
  const [historyIndex, setHistoryIndex] = useState<number | null>(null);

  const roots = config.agents.filter(a => a.parentId === null);
  const defaultAgent = roots.find(a => a.role === "planner") || roots[0];
  const [targetId, setTargetId] = useState<string>(defaultAgent?.id || "");
  const [targetModel, setTargetModel] = useState<string>("none");
  const [customModel, setCustomModel] = useState("");

  // Agents can be created or deleted from Settings; keep the target pointing at something real.
  useEffect(() => {
    if (!config.agents.some(a => a.id === targetId)) {
      setTargetId(defaultAgent?.id || "");
    }
  }, [config.agents, targetId, defaultAgent?.id]);

  // Chat activity lives outside the store, so poll it while a chat is open.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!currentChatId) return;
    const interval = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(interval);
  }, [currentChatId]);

  const chat = currentChatId ? config.chats.find(c => c.id === currentChatId) : undefined;
  const chatMode = !!currentChatId;
  const chatBusy = currentChatId ? isChatActive(currentChatId) : false;

  const targetAgent = config.agents.find(a => a.id === targetId);
  const targetRuntime = targetAgent && currentProjectId ? runtime[currentProjectId]?.[targetId] : undefined;
  const targetWorking = targetRuntime?.status === "working" || targetRuntime?.status === "waiting";
  const binaryInfo = targetAgent ? binaries[targetAgent.provider] : undefined;
  const modelOptions = targetAgent ? (PROVIDERS[targetAgent.provider]?.defaultModels || []) : [];

  const busy = chatMode ? chatBusy : targetWorking;
  const canSend = !!text.trim() && !busy && (chatMode
    ? !!currentChatId
    : !!targetId && !!currentProjectId && !(targetModel === "custom" && !customModel.trim()));

  const handleSend = () => {
    if (!canSend) return;
    const value = text.trim();
    sentHistory.push(value);
    setHistoryIndex(null);
    if (chatMode && currentChatId) {
      void sendChatMessage(currentChatId, value);
    } else if (currentProjectId) {
      const model = targetModel === "none" ? undefined : targetModel === "custom" ? customModel : targetModel;
      void submitPrompt(value, targetId, currentProjectId, { model });
    }
    setText("");
  };

  const handleStop = () => {
    if (chatMode && currentChatId) void stopChat(currentChatId);
    else if (currentProjectId) void stopAll(currentProjectId);
  };

  // Escape stops the running turn/task from anywhere in the project screen (dialogs keep it).
  useEffect(() => {
    if (!busy) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== "Escape") return;
      // Escape belongs to the shell running in a terminal, and to open dialogs.
      if ((e.target as HTMLElement | null)?.closest?.("[role=dialog], .xterm")) return;
      e.preventDefault();
      handleStop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, chatMode, currentChatId, currentProjectId]);

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      handleSend();
      return;
    }
    if (e.key === "Escape" && busy) {
      e.preventDefault();
      handleStop();
      return;
    }
    // Arrow up on an empty box walks back through the prompts sent in this session.
    if (e.key === "ArrowUp" && sentHistory.length > 0 && (text === "" || historyIndex !== null)) {
      e.preventDefault();
      const next = historyIndex === null ? sentHistory.length - 1 : Math.max(0, historyIndex - 1);
      setHistoryIndex(next);
      setText(sentHistory[next]);
      return;
    }
    if (e.key === "ArrowDown" && historyIndex !== null) {
      e.preventDefault();
      const next = historyIndex + 1;
      if (next >= sentHistory.length) {
        setHistoryIndex(null);
        setText("");
      } else {
        setHistoryIndex(next);
        setText(sentHistory[next]);
      }
    }
  };

  const placeholder = chatMode
    ? `Mensaje para ${chat?.name ?? "el chat"}…  (Ctrl+Enter para enviar)`
    : "Pedile algo al equipo… (Ctrl+Enter para enviar)";

  return (
    <div className="border-t border-border p-3 shrink-0 bg-background">
      <div className="max-w-3xl mx-auto flex flex-col gap-2">
        {!chatMode && targetAgent && binaryInfo === null && (
          <Alert variant="destructive" className="text-xs py-2">
            No se detectó el CLI de {PROVIDERS[targetAgent.provider]?.label ?? targetAgent.provider}.
            Configuralo en Configuración → Agentes.
          </Alert>
        )}

        {/* `field-sizing-content` (from the base Textarea) grows the box between these bounds. */}
        <Textarea
          value={text}
          onChange={e => { setText(e.target.value); setHistoryIndex(null); }}
          onKeyDown={handleKeyDown}
          placeholder={placeholder}
          rows={2}
          className="resize-none min-h-[60px] max-h-[200px] overflow-y-auto"
        />

        <div className="flex gap-2 items-center flex-wrap">
          {!chatMode && (
            <>
              <Select value={targetId} onValueChange={setTargetId}>
                <SelectTrigger className="w-[150px] h-8 text-xs">
                  <SelectValue placeholder="Destino" />
                </SelectTrigger>
                <SelectContent>
                  {config.agents.map(a => (
                    <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Select value={targetModel} onValueChange={setTargetModel}>
                <SelectTrigger className="w-[170px] h-8 text-xs">
                  <SelectValue placeholder="Modelo" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Modelo por defecto</SelectItem>
                  {modelOptions.map(m => (
                    <SelectItem key={m} value={m}>{m}</SelectItem>
                  ))}
                  <SelectItem value="custom">Otro…</SelectItem>
                </SelectContent>
              </Select>

              {targetModel === "custom" && (
                <Input
                  className="h-8 w-[150px] text-xs"
                  placeholder="Escribí el modelo…"
                  value={customModel}
                  onChange={e => setCustomModel(e.target.value)}
                />
              )}

              <Select
                value="none"
                onValueChange={val => {
                  if (val === "none") return;
                  const preset = config.presets?.find(p => p.id === val);
                  if (!preset) return;
                  setText(prev => prev + (prev && preset.prompt ? "\n" : "") + preset.prompt);
                  if (preset.agentId) setTargetId(preset.agentId);
                  if (preset.model) {
                    setTargetModel(preset.model);
                    setCustomModel("");
                  }
                }}
              >
                <SelectTrigger className="w-[170px] h-8 text-xs">
                  <SelectValue placeholder="Órdenes predefinidas" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="none">Seleccionar orden…</SelectItem>
                  {config.presets?.map(p => (
                    <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </>
          )}

          <div className="ml-auto">
            {busy ? (
              <Button variant="destructive" size="sm" onClick={handleStop}>
                <Square className="h-4 w-4" /> Detener
              </Button>
            ) : (
              <Button size="sm" onClick={handleSend} disabled={!canSend}>
                <Send className="h-4 w-4" /> Enviar
              </Button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
