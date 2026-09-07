import { useEffect, useState } from "react";
import { ProviderLogo } from "@/components/ProviderLogo";
import { QuotaIndicator } from "@/components/QuotaIndicator";
import { ApprovalsPill } from "@/components/ApprovalsPill";
import { PresetStrip } from "@/components/shell/PresetStrip";
import type { Preset } from "@/types";
import { useAppStore, selectAllAgents, selectProjectAgents } from "@/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Alert } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROVIDERS } from "@/lib/providers";
import { isChatActive } from "@/lib/chat";
import { useT } from "@/i18n/useT";
import { Send, Square } from "lucide-react";

/** Prompts sent in this session, newest last. Kept out of the store: it is UI-only scratch. */
const sentHistory: string[] = [];

/** The input pinned at the bottom of the project screen: orchestrator prompt or chat message. */
export function Composer() {
  const t = useT();
  const config = useAppStore(state => state.config);
  const agents = useAppStore(state => selectProjectAgents(state, state.currentProjectId));
  // A chat can name an agent of another project, so its ring looks the roster up everywhere.
  const allAgents = useAppStore(selectAllAgents);
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

  const roots = agents.filter(a => a.parentId === null);
  const defaultAgent = roots.find(a => a.role === "planner") || roots[0];
  const [targetId, setTargetId] = useState<string>(defaultAgent?.id || "");
  const [targetModel, setTargetModel] = useState<string>("none");
  const [customModel, setCustomModel] = useState("");

  // Agents can be created or deleted from Settings; keep the target pointing at something real.
  useEffect(() => {
    if (!agents.some(a => a.id === targetId)) {
      setTargetId(defaultAgent?.id || "");
    }
  }, [agents, targetId, defaultAgent?.id]);

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

  const targetAgent = agents.find(a => a.id === targetId);
  const targetRuntime = targetAgent && currentProjectId ? runtime[currentProjectId]?.[targetId] : undefined;
  const targetWorking = targetRuntime?.status === "working" || targetRuntime?.status === "waiting";
  const binaryInfo = targetAgent ? binaries[targetAgent.provider] : undefined;
  const modelOptions = targetAgent ? (PROVIDERS[targetAgent.provider]?.defaultModels || []) : [];
  // An order bound to another agent would run somewhere else than what the composer says, so only
  // the ones for this target (and the ones bound to nobody) are offered.
  const presetsForTarget = (config.presets ?? []).filter(p => !p.agentId || p.agentId === targetId);

  /** Loads an order into the box, and follows the agent and model it was saved with. */
  const applyPreset = (preset: Preset) => {
    setText(prev => prev + (prev && preset.prompt ? "\n" : "") + preset.prompt);
    if (preset.agentId) setTargetId(preset.agentId);
    if (preset.model) {
      setTargetModel(preset.model);
      setCustomModel("");
    }
  };

  // Whose quota the ring shows: the agent of a one-on-one chat, or the one the prompt is aimed at
  // (the orchestrator unless the destination select says otherwise).
  const chatAgentId = chat?.participants.length === 1 ? chat.participants[0].agentId : undefined;
  const quotaAgent = chatMode
    ? allAgents.find(a => a.id === chatAgentId)
    : targetAgent || defaultAgent;

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
      // Escape belongs to the shell running in a terminal, to open dialogs and to the
      // hierarchy inspector (there it just closes the panel).
      if ((e.target as HTMLElement | null)?.closest?.("[role=dialog], [data-inspector], .xterm")) return;
      e.preventDefault();
      handleStop();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [busy, chatMode, currentChatId, currentProjectId]);

  // These keys belong to the composer, so they are handled here rather than by the window
  // listener in App.tsx, but they are still declared in src/lib/shortcuts.ts (group "composer"),
  // which is what the Ctrl+/ dialog documents. Adding one here means adding it there too.
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

  const noTeam = !chatMode && agents.length === 0;
  const placeholder = chatMode
    ? t("composer.placeholder.chat", { name: chat?.name ?? t("composer.theChat") })
    : noTeam
      ? t("composer.placeholder.noTeam")
      : t("composer.placeholder.team");

  return (
    <div className="border-t border-border p-3 shrink-0 bg-background">
      <div className="max-w-3xl mx-auto flex flex-col gap-2">
        {noTeam && (
          <Alert className="text-xs py-2">
            {t("composer.noTeamHint")}
          </Alert>
        )}

        {!chatMode && targetAgent && binaryInfo === null && (
          <Alert variant="destructive" className="text-xs py-2">
            {t("composer.missingCli", { provider: PROVIDERS[targetAgent.provider]?.label ?? targetAgent.provider })}
          </Alert>
        )}

        {/* The saved orders that apply to whoever is going to run this. */}
        <PresetStrip presets={presetsForTarget} onPick={applyPreset} />

        {/* The send button lives inside the box, so the text stops short of it (`pr-12`). */}
        <div className="relative">
          {/* `field-sizing-content` (from the base Textarea) grows the box between these bounds. */}
          <Textarea
            value={text}
            onChange={e => { setText(e.target.value); setHistoryIndex(null); }}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            rows={2}
            className="resize-none min-h-[60px] max-h-[200px] overflow-y-auto pr-12"
          />
          {busy ? (
            <Button
              variant="destructive"
              size="icon"
              className="absolute bottom-2 right-2 h-8 w-8"
              onClick={handleStop}
              title={t("composer.stopHint")}
              aria-label={t("composer.stop")}
            >
              <Square className="h-4 w-4" />
            </Button>
          ) : (
            <Button
              size="icon"
              className="absolute bottom-2 right-2 h-8 w-8"
              onClick={handleSend}
              disabled={!canSend}
              title={t("composer.sendHint")}
              aria-label={t("composer.send")}
            >
              <Send className="h-4 w-4" />
            </Button>
          )}
        </div>

        {(!chatMode || quotaAgent) && (
          <div className="flex gap-2 items-center flex-wrap">
            {!chatMode && (
              <>
                <Select value={targetId} onValueChange={setTargetId}>
                  <SelectTrigger className="w-[150px] h-8 text-xs">
                    <SelectValue placeholder={t("composer.target")} />
                  </SelectTrigger>
                  <SelectContent>
                    {agents.map(a => (
                      <SelectItem key={a.id} value={a.id}>
                        <span className="inline-flex items-center gap-1.5"><ProviderLogo provider={a.provider} size={14} />{a.name}</span>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={targetModel} onValueChange={setTargetModel}>
                  <SelectTrigger className="w-[170px] h-8 text-xs">
                    <SelectValue placeholder={t("common.model")} />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="none">{t("composer.defaultModel")}</SelectItem>
                    {modelOptions.map(m => (
                      <SelectItem key={m} value={m}>{m}</SelectItem>
                    ))}
                    <SelectItem value="custom">{t("composer.otherModel")}</SelectItem>
                  </SelectContent>
                </Select>

                {targetModel === "custom" && (
                  <Input
                    className="h-8 w-[150px] text-xs"
                    placeholder={t("composer.typeModel")}
                    value={customModel}
                    onChange={e => setCustomModel(e.target.value)}
                  />
                )}

              </>
            )}

            {/* Both live at the right end: what is waiting for you, and what is left to spend. */}
            <div className="ml-auto flex items-center gap-1">
              <ApprovalsPill />
              {quotaAgent && <QuotaIndicator agent={quotaAgent} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
