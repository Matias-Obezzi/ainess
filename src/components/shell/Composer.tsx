import { useEffect, useRef, useState } from "react";
import { ProviderLogo } from "@/components/ProviderLogo";
import { QuotaIndicator } from "@/components/QuotaIndicator";
import { isRemoteBuild } from "@/lib/platform";
import { ApprovalsPill } from "@/components/ApprovalsPill";
import { PresetStrip } from "@/components/shell/PresetStrip";
import type { Preset } from "@/types";
import { useAppStore, selectAllAgents, selectProjectAgents } from "@/store";
import { instructAgent } from "@/lib/orchestrator";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Input } from "@/components/ui/input";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { PROVIDERS } from "@/lib/providers";
import { isChatActive } from "@/lib/chat";
import { useT } from "@/i18n/useT";
import { Clock, FileText, Paperclip, Send, SlidersHorizontal, Square, X } from "lucide-react";
import { toast } from "@/components/ui/toast";
import {
  MAX_ATTACHMENT_BYTES,
  attachmentsBlock,
  humanSize,
  isImage,
  saveAttachments,
} from "@/lib/attachments";

/** Prompts sent in this session, newest last. Kept out of the store: it is UI-only scratch. */
const sentHistory: string[] = [];

/** One attached file before it is sent: images show themselves, the rest show their name. */
function AttachmentChip({ file, onRemove }: { file: File; onRemove(): void }) {
  const t = useT();
  // The preview is a handle on memory, not a copy: it is given back when the chip goes.
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    if (!isImage(file)) return;
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  return (
    <div className="flex items-center gap-2 rounded-md border border-border bg-card py-1 pl-1 pr-1.5 text-xs">
      {url ? (
        <img src={url} alt={file.name} className="h-9 w-9 rounded object-cover" />
      ) : (
        <span className="flex h-9 w-9 items-center justify-center rounded bg-muted">
          <FileText className="h-4 w-4 text-muted-foreground" />
        </span>
      )}
      <span className="flex min-w-0 flex-col">
        <span className="max-w-[160px] truncate">{file.name}</span>
        <span className="text-[10px] text-muted-foreground">{humanSize(file.size)}</span>
      </span>
      <Button
        type="button"
        variant="ghost"
        size="icon"
        className="h-6 w-6"
        onClick={onRemove}
        title={t("attachments.remove")}
        aria-label={t("attachments.remove")}
      >
        <X className="h-3.5 w-3.5" />
      </Button>
    </div>
  );
}

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
  const queueChatMessage = useAppStore(state => state.queueChatMessage);
  const stopAll = useAppStore(state => state.stopAll);

  const [historyIndex, setHistoryIndex] = useState<number | null>(null);

  // What is going with the message. Kept as the files themselves until it is sent: nothing is
  // written into the user's repo for a message they may never send.
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);

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

  // What is typed lives in the store, by conversation: going to the board and back used to come
  // back to an empty box.
  const draftKey = chatMode && currentChatId ? `chat:${currentChatId}` : currentProjectId ? `project:${currentProjectId}` : "";
  const text = useAppStore(state => state.drafts[draftKey] ?? "");
  const setDraft = useAppStore(state => state.setDraft);
  const setText = (value: string | ((prev: string) => string)) => {
    const next = typeof value === "function" ? value(useAppStore.getState().drafts[draftKey] ?? "") : value;
    setDraft(draftKey, next);
  };
  const chatBusy = currentChatId ? isChatActive(currentChatId) : false;

  // Unlike what is typed, an attachment does not follow you to another conversation: it was picked
  // for the one you were in.
  useEffect(() => {
    setAttachments([]);
  }, [draftKey]);

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

  const workspaceDir = config.projects.find(p => p.id === currentProjectId)?.workspaceDir ?? "";

  /** Adds what was picked or pasted, minus what is too big to travel through the webview. */
  const addFiles = (incoming: FileList | File[]) => {
    const files = [...incoming];
    const tooBig = files.filter(f => f.size > MAX_ATTACHMENT_BYTES);
    for (const file of tooBig) {
      toast.error(t("attachments.tooBig", { name: file.name, max: humanSize(MAX_ATTACHMENT_BYTES) }));
    }
    const ok = files.filter(f => f.size <= MAX_ATTACHMENT_BYTES);
    if (ok.length > 0) setAttachments(prev => [...prev, ...ok]);
  };

  /** Ctrl+V with a screenshot or a file in the clipboard: text keeps pasting as text. */
  const handlePaste = (e: React.ClipboardEvent<HTMLTextAreaElement>) => {
    const files = [...(e.clipboardData?.files ?? [])];
    if (files.length === 0) return;
    e.preventDefault();
    addFiles(files);
  };

  const busy = chatMode ? chatBusy : targetWorking;
  const canSend = (!!text.trim() || attachments.length > 0) && (chatMode
    ? !!currentChatId
    : !!targetId && !!currentProjectId && !(targetModel === "custom" && !customModel.trim()));
  /** Sending now means "when this turn ends": the agent is mid-answer and cannot be interrupted. */
  const willQueue = busy && canSend;

  /**
   * Enter sends, Ctrl+Enter queues. Queueing is also what sending does while the agent is mid
   * answer: there is nothing to interrupt it with, so what you write waits its turn.
   */
  const handleSend = (opts?: { queue?: boolean }) => {
    if (!canSend) return;
    const queue = opts?.queue === true || busy;
    const files = attachments;
    const typed = text.trim();
    sentHistory.push(typed);
    setHistoryIndex(null);
    setText("");
    setAttachments([]);

    // The files are copied into the project first: what the agent gets is the paths, which is the
    // one thing every CLI can do with an attachment.
    void (async () => {
      let value = typed;
      if (files.length > 0) {
        const saved = await saveAttachments(files, workspaceDir);
        if (saved.length < files.length) toast.error(t("attachments.saveFailed"));
        value += attachmentsBlock(saved);
        value = value.trim();
      }
      if (!value) return;
      send(value, queue);
    })();
  };

  /** Hands the message over, now or when whoever it is for is free. */
  const send = (value: string, queue: boolean) => {
    if (chatMode && currentChatId) {
      // Mid-turn the chat takes it and sends it when the turn ends (see `flushQueue` in lib/chat).
      if (queue && busy) queueChatMessage(currentChatId, value);
      else void sendChatMessage(currentChatId, value);
    } else if (currentProjectId) {
      const model = targetModel === "none" ? undefined : targetModel === "custom" ? customModel : targetModel;
      // An agent that is working queues what it is told and picks it up when it is free; that is
      // what `instructAgent` has always done for the "instruct" action.
      // `instructAgent` runs it now when the agent is free and queues it when it is not, which is
      // exactly what both keys mean.
      if (queue) void instructAgent(targetId, value, currentProjectId, { model });
      else void submitPrompt(value, targetId, currentProjectId, { model });
    }
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
    // Enter sends, Shift+Enter is a line break, Ctrl+Enter queues for when the agent is free.
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      handleSend({ queue: e.ctrlKey || e.metaKey });
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
  // On a phone there is no Ctrl+Enter to mention, and the room the hint takes is room the thread
  // does not get. `compact` is the phone page (see lib/platform.ts), not a screen width.
  const compact = isRemoteBuild();
  const [showModel, setShowModel] = useState(false);
  const placeholder = chatMode
    ? t("composer.placeholder.chat", { name: chat?.name ?? t("composer.theChat") })
    : noTeam
      ? t("composer.placeholder.noTeam")
      : t("composer.placeholder.team");
  const hint = compact ? placeholder : `${placeholder} ${t("composer.sendShortcut")}`;

  return (
    <div className="border-t border-border p-3 shrink-0 bg-background">
      <div className="max-w-3xl mx-auto flex flex-col gap-2">
        {noTeam && (
          <Alert className="text-xs py-2">
            {/* `Alert` is a two-column grid whose first column is zero wide: a bare string lands
                in it and comes out one word per line. The text goes in the description. */}
            <AlertDescription className="text-xs">{t("composer.noTeamHint")}</AlertDescription>
          </Alert>
        )}

        {!chatMode && targetAgent && binaryInfo === null && (
          <Alert variant="destructive" className="text-xs py-2">
            <AlertDescription className="text-xs">
              {t("composer.missingCli", { provider: PROVIDERS[targetAgent.provider]?.label ?? targetAgent.provider })}
            </AlertDescription>
          </Alert>
        )}

        {/* The saved orders that apply to whoever is going to run this. */}
        <PresetStrip presets={presetsForTarget} onPick={applyPreset} />

        {/* What is going with the message, before it goes. */}
        {attachments.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {attachments.map((file, i) => (
              <AttachmentChip
                key={`${file.name}-${i}`}
                file={file}
                onRemove={() => setAttachments(prev => prev.filter((_, j) => j !== i))}
              />
            ))}
          </div>
        )}

        {/* The send button lives inside the box, so the text stops short of it (`pr-12`). */}
        <div className="relative">
          {/* `field-sizing-content` (from the base Textarea) grows the box between these bounds. */}
          <Textarea
            value={text}
            onChange={e => { setText(e.target.value); setHistoryIndex(null); }}
            onKeyDown={handleKeyDown}
            onPaste={handlePaste}
            placeholder={hint}
            rows={2}
            className="resize-none min-h-[60px] max-h-[200px] overflow-y-auto pr-12"
          />
          <input
            ref={fileInputRef}
            type="file"
            multiple
            hidden
            onChange={e => {
              if (e.target.files) addFiles(e.target.files);
              // Same file twice in a row fires no change unless the field is cleared.
              e.target.value = "";
            }}
          />
          <div className="absolute bottom-2 right-2 flex items-center gap-1">
            {!compact && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8"
                onClick={() => fileInputRef.current?.click()}
                title={t("attachments.attachHint")}
                aria-label={t("attachments.attach")}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            )}
            {busy && (
              <Button
                variant="destructive"
                size="icon"
                className="h-8 w-8"
                onClick={handleStop}
                title={t("composer.stopHint")}
                aria-label={t("composer.stop")}
              >
                <Square className="h-4 w-4" />
              </Button>
            )}
            {/* While something is running this queues instead of interrupting: the box no longer
                goes grey mid-answer, which is the moment you most want to add something. */}
            {(!busy || canSend) && (
              <Button
                size="icon"
                className="h-8 w-8"
                onClick={() => handleSend()}
                disabled={!canSend}
                title={willQueue ? t("composer.queueHint") : t("composer.sendHint")}
                aria-label={willQueue ? t("composer.queue") : t("composer.send")}
              >
                {willQueue ? <Clock className="h-4 w-4" /> : <Send className="h-4 w-4" />}
              </Button>
            )}
          </div>
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

                {compact && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    className="h-8 px-2 text-xs"
                    aria-label={t("composer.pickModel")}
                    onClick={() => setShowModel(v => !v)}
                  >
                    <SlidersHorizontal className="h-3.5 w-3.5" />
                  </Button>
                )}

                {(!compact || showModel) && (
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
                )}

                {targetModel === "custom" && (!compact || showModel) && (
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
