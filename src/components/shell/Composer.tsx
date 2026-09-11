import { useEffect, useRef, useMemo, useState } from "react";
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
import { UsageDialog } from "@/components/UsageDialog";
import { COMMANDS, compactProject, parseCommand, type ChatCommand } from "@/lib/commands";
import { activeCompletion, applyCompletion } from "@/lib/completion";
import { TEMPLATE_VARS } from "@/lib/template-vars";
import { fenceRegions, insideFence, lineIndent } from "@/lib/fences";
import { getTransport } from "@/lib/transport";
import { confirm } from "@/lib/confirm";
import { roleLabelKey } from "@/lib/labels";
import { useT } from "@/i18n/useT";
import { FileText, Paperclip, Send, SlidersHorizontal, Square, X } from "lucide-react";
import { QuestionGroup } from "@/components/InlineQuestion";
import { questionsForComposer } from "@/lib/pending-question";
import { ghostFor, ghostTakesPlaceholder } from "@/lib/ghost-suggestion";
import { toast } from "@/components/ui/toast";
import { Typewriter } from "@/components/ui/typewriter";
import { cn } from "@/lib/utils";
import {
  MAX_ATTACHMENT_BYTES,
  attachmentsBlock,
  humanSize,
  isImage,
  saveAttachments,
} from "@/lib/attachments";

/** Prompts sent in this session, newest last. Kept out of the store: it is UI-only scratch. */
const sentHistory: string[] = [];

/** One row of the completion menu, whatever it is completing. */
interface MenuOption {
  id: string;
  label: string;
  hint: string;
  /** What `applyCompletion` inserts. Unused by a preset or a command, which act instead. */
  value: string;
  preset?: Preset;
  command?: ChatCommand;
}

/**
 * The two dropdowns of the bottom bar, dressed like the paperclip beside them: no border, no fill,
 * and the same grey under the pointer. They sit next to the box all day and pick something you
 * rarely change — a framed control for that is a frame around nothing.
 */
const FLAT_SELECT = "h-8 border-0 bg-transparent text-xs shadow-none hover:bg-accent dark:bg-transparent dark:hover:bg-accent";

/** The text of the box with each ``` region wrapped for a background — the fence highlight layer's content. */
function renderFenceHighlight(text: string, regions: Array<{ start: number; end: number }>) {
  if (regions.length === 0) return null;
  const nodes: React.ReactNode[] = [];
  let cursor = 0;
  regions.forEach((region, i) => {
    if (region.start > cursor) nodes.push(text.slice(cursor, region.start));
    nodes.push(
      // No `font-mono` here, tempting as it is: this layer only works while every character sits
      // exactly where the textarea puts it, and a different font would wrap at a different column
      // and slide every line after it out of place. The background is the whole of the signal.
      <span key={i} className="rounded bg-muted/50">
        {text.slice(region.start, region.end)}
      </span>
    );
    cursor = region.end;
  });
  if (cursor < text.length) nodes.push(text.slice(cursor));
  return nodes;
}

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
  const setProjectMode = useAppStore(state => state.setProjectMode);
  const toggleDiffPanel = useAppStore(state => state.toggleDiffPanel);
  const clearMessages = useAppStore(state => state.clearMessages);

  const [historyIndex, setHistoryIndex] = useState<number | null>(null);

  // What is going with the message. Kept as the files themselves until it is sent: nothing is
  // written into the user's repo for a message they may never send.
  const [attachments, setAttachments] = useState<File[]>([]);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  const highlightRef = useRef<HTMLDivElement>(null);

  // What this conversation has already said, for the grey suggestion below. Read from the
  // conversation on screen and from nowhere else: a message typed in another project has no
  // business appearing here, the same rule the shared context follows.
  const chatMessages = useAppStore(state => state.chatMessages);

  const questions = useAppStore(state => state.questions);
  const answerQuestion = useAppStore(state => state.answerQuestion);
  const answerQuestions = useAppStore(state => state.answerQuestions);
  const runs = useAppStore(state => state.runs);

  const chatMode = !!currentChatId;
  const chat = currentChatId ? config.chats.find(c => c.id === currentChatId) : undefined;

  const pendingQuestionData = useMemo(() => {
    const chatAgentIds = chat ? chat.participants.map(p => p.agentId) : [];
    return questionsForComposer(questions, runs, {
      projectId: currentProjectId,
      chatId: currentChatId,
      chatAgentIds,
    });
  }, [questions, runs, currentProjectId, currentChatId, chat]);

  /** The user's own messages here, newest first, and the agent's last word. */
  const conversation = useMemo(() => {
    if (currentChatId) {
      const rows = chatMessages[currentChatId] ?? [];
      const mine: string[] = [];
      let lastAgent: string | undefined;
      for (let i = rows.length - 1; i >= 0; i--) {
        const row = rows[i];
        if (row.from === "user") mine.push(row.text);
        else if (!lastAgent && row.status !== "pending" && row.text) lastAgent = row.text;
      }
      return { past: mine, lastAgent };
    }
    // The orchestrator's thread: a round-zero run with no parent is a prompt the user typed, and
    // its output is what came back.
    const own = Object.values(runs)
      .filter(r => r.projectId === currentProjectId && !r.parentRunId && r.round === 0)
      .sort((a, b) => b.startedAt - a.startedAt);
    return {
      past: own.map(r => r.prompt),
      lastAgent: own.find(r => r.status === "done" && r.output)?.output,
    };
  }, [currentChatId, chatMessages, runs, currentProjectId]);

  const pendingQuestionId = pendingQuestionData?.group[0]?.id;
  const [writeInstead, setWriteInstead] = useState(false);
  useEffect(() => {
    setWriteInstead(false);
  }, [pendingQuestionId]);

  const wasShowingQuestion = useRef(false);
  useEffect(() => {
    const isShowingQuestion = !!pendingQuestionData && !writeInstead;
    if (wasShowingQuestion.current && !isShowingQuestion) {
      textareaRef.current?.focus();
    }
    wasShowingQuestion.current = isShowingQuestion;
  }, [pendingQuestionData, writeInstead]);

  const roots = agents.filter(a => a.parentId === null);
  const defaultAgent = roots.find(a => a.role === "planner") || roots[0];
  const [targetId, setTargetId] = useState<string>(defaultAgent?.id || "");

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
  // Where the ``` regions are, for the highlight layer behind the box and for Enter/Tab above.
  const fenceHighlightRegions = useMemo(() => fenceRegions(text), [text]);

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

  // The model of this conversation, remembered next to its draft: picking one, going to the board
  // and coming back used to say "default model" again while the box below still held the prompt.
  // Which of the three the select shows follows from the stored value — one of the CLI's own, or
  // one typed by hand. The only thing it cannot say is "custom, nothing typed yet".
  const composerModel = useAppStore(state => state.composerModels[draftKey] ?? "");
  const setComposerModel = useAppStore(state => state.setComposerModel);
  const [wantsCustom, setWantsCustom] = useState(false);
  useEffect(() => { setWantsCustom(false); }, [draftKey]);
  const targetModel = wantsCustom
    ? "custom"
    : composerModel
      ? (modelOptions.includes(composerModel) ? composerModel : "custom")
      : "none";
  const setTargetModel = (value: string) => {
    setWantsCustom(value === "custom");
    // "Other…" starts from an empty box: the model picked before is not silently kept as its value.
    setComposerModel(draftKey, value === "custom" || value === "none" ? "" : value);
  };
  const customModel = composerModel;
  const setCustomModel = (value: string) => setComposerModel(draftKey, value);
  // An order bound to another agent would run somewhere else than what the composer says, so only
  // the ones for this target (and the ones bound to nobody) are offered.
  const presetsForTarget = (config.presets ?? []).filter(p => !p.agentId || p.agentId === targetId);
  // The `/` completion menu offers a preset regardless of who is currently selected: picking one is
  // what sets the agent, so a preset bound to a real agent of this project belongs there too.
  const presetsForMenu = (config.presets ?? []).filter(p => !p.agentId || agents.some(a => a.id === p.agentId));

  /**
   * Loads an order into the box, and follows the agent and model it was saved with. The strip
   * below the box appends it to whatever is already written; picked from the `/` completion menu
   * it replaces the box outright, since there the whole point was starting a new order.
   */
  const applyPreset = (preset: Preset, opts?: { replace?: boolean }) => {
    setText(prev => (opts?.replace ? preset.prompt : prev + (prev && preset.prompt ? "\n" : "") + preset.prompt));
    if (preset.agentId) setTargetId(preset.agentId);
    // One value now, so one call: the old pair set the model and then blanked it.
    if (preset.model) setComposerModel(draftKey, preset.model);
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

  /**
   * Files dropped on the box, the third way in beside the paperclip and Ctrl+V.
   *
   * Only for drags that carry files. A task card crosses this on its way between columns and must
   * not be caught: what it carries is `text/plain`, and taking its drop would move it nowhere and
   * attach nothing.
   *
   * `dragleave` fires every time the pointer crosses into a child, so counting entries and exits is
   * what keeps the box from flickering out from under a drag that never left it.
   */
  const [dropping, setDropping] = useState(false);
  const dragDepth = useRef(0);

  const carriesFiles = (e: React.DragEvent<HTMLElement>) => e.dataTransfer?.types?.includes("Files") ?? false;

  const onDragEnter = (e: React.DragEvent<HTMLElement>) => {
    if (!carriesFiles(e)) return;
    dragDepth.current += 1;
    setDropping(true);
  };

  const onDragOver = (e: React.DragEvent<HTMLElement>) => {
    if (!carriesFiles(e)) return;
    // Without this the drop never happens: the default is to refuse it.
    e.preventDefault();
    e.dataTransfer.dropEffect = "copy";
  };

  const onDragLeave = (e: React.DragEvent<HTMLElement>) => {
    if (!carriesFiles(e)) return;
    dragDepth.current = Math.max(0, dragDepth.current - 1);
    if (dragDepth.current === 0) setDropping(false);
  };

  const onDropFiles = (e: React.DragEvent<HTMLElement>) => {
    if (!carriesFiles(e)) return;
    e.preventDefault();
    dragDepth.current = 0;
    setDropping(false);
    const files = [...(e.dataTransfer.files ?? [])];
    if (files.length > 0) addFiles(files);
  };

  // ---- completion menu ----
  const [usageOpen, setUsageOpen] = useState(false);
  // Tracked by hand (click/keyup/change all update it) because the menu has to know where the
  // trigger is relative to the caret, not just whether one exists anywhere in the text. Its own
  // name (not `caret`) avoids shadowing the local of the same name used below, in the Enter/Tab
  // handling that predates the completion menu.
  const [menuCaret, setMenuCaret] = useState(0);
  const [menuIndex, setMenuIndex] = useState(0);
  // Escape closes the menu for the trigger under the caret without touching what was typed; typing
  // a new trigger (a different `start`/`kind`) is what brings a menu back.
  const [menuDismissed, setMenuDismissed] = useState(false);

  // `/` only opens the command list on the project's own thread: a chat keeps its sessions
  // somewhere else, and compacting one would be plain forgetting — there is no history file behind
  // it to read back. `{{`, `@` and `#` are not tied to that restriction.
  const completionReq = useMemo(() => {
    const req = activeCompletion(text, menuCaret);
    if (!req) return null;
    if (req.kind === "command" && (chatMode || !currentProjectId)) return null;
    return req;
  }, [text, menuCaret, chatMode, currentProjectId]);

  useEffect(() => { setMenuIndex(0); }, [completionReq?.kind, completionReq?.query, completionReq?.start]);
  useEffect(() => { setMenuDismissed(false); }, [completionReq?.kind, completionReq?.start]);

  // The project's files for `#`, asked for once and kept in a ref: they do not change while you
  // are typing, and a workspace with no git (or no git binary) just offers nothing — not an error.
  const workspaceFilesRef = useRef<string[] | null>(null);
  const [filesTick, bumpFilesTick] = useState(0);
  useEffect(() => { workspaceFilesRef.current = null; }, [workspaceDir]);
  useEffect(() => {
    if (completionReq?.kind !== "file" || workspaceFilesRef.current !== null || !workspaceDir) return;
    let cancelled = false;
    void getTransport().exec("git", ["ls-files"], workspaceDir, 10).then(res => {
      if (cancelled) return;
      workspaceFilesRef.current = res.code === 0 ? res.stdout.split(/\r?\n/).filter(Boolean) : [];
      bumpFilesTick(v => v + 1);
    });
    return () => { cancelled = true; };
  }, [completionReq?.kind, workspaceDir]);

  const menuOptions = useMemo<MenuOption[]>(() => {
    if (!completionReq) return [];
    const q = completionReq.query.toLowerCase();
    if (completionReq.kind === "command") {
      const cmds = COMMANDS.filter(c => c.name.startsWith(q))
        .map(c => ({ id: `cmd:${c.id}`, label: `/${c.name}`, hint: t(c.descriptionKey), value: c.name, command: c }));
      const presets = presetsForMenu.filter(p => p.name.toLowerCase().startsWith(q))
        .map(p => ({ id: `preset:${p.id}`, label: p.name, hint: p.prompt, value: "", preset: p }));
      return [...cmds, ...presets];
    }
    if (completionReq.kind === "agent") {
      return agents.filter(a => a.name.toLowerCase().startsWith(q))
        .map(a => ({ id: a.id, label: a.name, hint: t(roleLabelKey[a.role]), value: a.name }));
    }
    if (completionReq.kind === "file") {
      return (workspaceFilesRef.current ?? [])
        .filter(f => f.toLowerCase().includes(q))
        .slice(0, 20)
        .map(f => {
          const slash = f.lastIndexOf("/");
          return { id: f, label: slash === -1 ? f : f.slice(slash + 1), hint: slash === -1 ? "" : f.slice(0, slash), value: f };
        });
    }
    return TEMPLATE_VARS.filter(v => v.toLowerCase().startsWith(q))
      .map(v => ({ id: v, label: v, hint: t(`templateVar.${v}`), value: v }));
    // `filesTick` is read for its change, not its value: it is what tells this memo the ref content moved.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [completionReq, agents, presetsForMenu, filesTick, t]);

  const menuOpen = !menuDismissed && menuOptions.length > 0;

  /**
   * The grey text after the caret, and what Tab would take.
   *
   * Only with the caret at the very end and nothing selected: this is drawn by appending to the
   * layer behind the box, so anywhere else it would appear somewhere it does not belong. It also
   * stays out of the way of the `@`/`#`/`/` menu, which owns Tab while it is open, and of a
   * question with its own options on screen, which is a better answer than a guessed one.
   */
  const ghost = useMemo(() => {
    if (menuOpen || menuCaret !== text.length) return null;
    if (pendingQuestionData && !writeInstead) return null;
    return ghostFor({
      text,
      lastAgentMessage: conversation.lastAgent,
      past: conversation.past,
      affirmative: t("composer.ghostYes"),
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, menuCaret, menuOpen, conversation, pendingQuestionData, writeInstead, t]);

  const acceptGhost = () => {
    if (!ghost) return;
    const next = text + ghost.text;
    setText(next);
    // Same bookkeeping the box's own `onChange` does: what is in there is no longer a recalled
    // message, so the arrows start from the end of the history again rather than mid-walk.
    setHistoryIndex(null);
    setMenuCaret(next.length);
    requestAnimationFrame(() => textareaRef.current?.setSelectionRange(next.length, next.length));
  };

  /** Inserts the picked value in place of the trigger — or, for the two that act, acts. */
  const pickOption = (option: MenuOption) => {
    if (!completionReq) return;
    // Picking a command has always been the whole gesture: choose it and it runs. Which also
    // settles the one case that could loop — a completed `/compact` still starts with "compact",
    // so it would match its own trigger forever — because running it empties the box.
    if (option.command) {
      runCommand(option.command);
      return;
    }
    if (option.preset) {
      applyPreset(option.preset, { replace: true });
      return;
    }
    // A finished `@mention`, `#file` or `{{var}}` no longer matches its own trigger: the trailing
    // space, or the closing `}}`, breaks it. So the menu closes on its own next render.
    const { text: newText, caret: newCaret } = applyCompletion(text, completionReq, option.value);
    setText(newText);
    setMenuCaret(newCaret);
    requestAnimationFrame(() => textareaRef.current?.setSelectionRange(newCaret, newCaret));
  };

  /** Runs one and empties the box. Commands never reach an agent, so nothing is queued or sent. */
  const runCommand = (command: ChatCommand) => {
    if (!currentProjectId) return;
    setText("");
    setHistoryIndex(null);
    if (command.id === "compact") {
      const count = compactProject(currentProjectId);
      toast.success(t("command.compact.done", { count }));
    } else if (command.id === "cost") {
      setUsageOpen(true);
    } else if (command.id === "tasks") {
      setProjectMode("tasks");
    } else if (command.id === "chat") {
      setProjectMode("chat");
    } else if (command.id === "diff") {
      toggleDiffPanel(true);
    } else if (command.id === "stop") {
      handleStop();
    } else if (command.id === "clear") {
      // Same guard as the trash can in the communication panel: clearing it is not undoable.
      void (async () => {
        const ok = await confirm({ title: t("comm.clear.title"), description: t("comm.clear.body"), destructive: true, confirmText: t("common.delete") });
        if (ok) clearMessages(currentProjectId);
      })();
    }
  };

  const busy = chatMode ? chatBusy : targetWorking;
  const canSend = (!!text.trim() || attachments.length > 0) && (chatMode
    ? !!currentChatId
    : !!targetId && !!currentProjectId && !(targetModel === "custom" && !customModel.trim()));
  /**
   * Enter sends, Ctrl+Enter queues. Queueing is also what sending does while the agent is mid
   * answer: there is nothing to interrupt it with, so what you write waits its turn. No button says
   * this any more — while an agent works there is one button and it stops it — so the empty box
   * does (see `hint`).
   */
  const handleSend = (opts?: { queue?: boolean }) => {
    // An order to the app, not a message: it runs even with no team and nothing is sent anywhere.
    const command = currentProjectId && !chatMode ? parseCommand(text) : undefined;
    if (command) return runCommand(command);
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
    // An agent that asked something is stopped waiting for you, so whatever you type next is the
    // answer — whether you typed it in the question's own box or came out here to write it with the
    // model picker and the attachments. Starting a fresh run instead left that agent waiting for an
    // answer that never arrived, and left the question pending for good: back in the composer every
    // time you returned, and still in the bell, on Home and in `/status`.
    //
    // Queueing does not apply here. The agent is not busy, it is blocked on you.
    if (pendingQuestionData) {
      // Typed into the box instead of picked: it answers whatever is on top, and the rest of
      // the turn's questions stay where they are with their own tabs.
      answerQuestion(pendingQuestionData.group[0].id, [value]);
      return;
    }
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
    // The command list takes the keys it needs before anything else: while it is open, the arrows
    // are walking it rather than the prompts sent earlier.
    if (menuOpen) {
      if (e.key === "ArrowDown" || e.key === "ArrowUp") {
        e.preventDefault();
        const step = e.key === "ArrowDown" ? 1 : menuOptions.length - 1;
        setMenuIndex(i => (i + step) % menuOptions.length);
        return;
      }
      if (e.key === "Enter" || e.key === "Tab") {
        e.preventDefault();
        pickOption(menuOptions[menuIndex]);
        return;
      }
      if (e.key === "Escape") {
        e.preventDefault();
        // Only the menu closes: clearing the box here was fine back when the menu itself took up
        // the whole box (a bare `/command`), but now it would erase whatever else was typed around
        // the trigger.
        setMenuDismissed(true);
        return;
      }
    }
    // Enter sends, Shift+Enter is a line break, Ctrl+Enter queues for when the agent is free —
    // unless the caret sits in a ``` fence, where Enter has to stay a line break (see below).
    if (e.key === "Enter" && !e.shiftKey) {
      const caret = e.currentTarget.selectionStart;
      if (!e.ctrlKey && !e.metaKey) {
        // A line that is only a fence opener (```lang) with the fence still unclosed: Enter closes
        // it for you instead of sending, so you never have to remember the trailing ```.
        const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
        const nextBreak = text.indexOf("\n", caret);
        const lineEnd = nextBreak === -1 ? text.length : nextBreak;
        const line = text.slice(lineStart, lineEnd);
        if (/^\s*```[^`]*$/.test(line)) {
          const stillOpen = fenceRegions(text).some(r => r.start === lineStart && r.end === text.length);
          if (stillOpen) {
            e.preventDefault();
            const indent = lineIndent(text, caret);
            const before = text.slice(0, caret);
            const after = text.slice(e.currentTarget.selectionEnd);
            setText(before + "\n" + indent + "\n" + indent + "```" + after);
            const newCaret = caret + 1 + indent.length;
            requestAnimationFrame(() => textareaRef.current?.setSelectionRange(newCaret, newCaret));
            return;
          }
        }
      }
      if (insideFence(text, caret)) {
        e.preventDefault();
        // Ctrl/Cmd+Enter is the only way left to send from the keyboard here, since plain Enter is
        // a line break inside a fence — it sends immediately (or queues if busy) like the button.
        if (e.ctrlKey || e.metaKey) {
          handleSend();
          return;
        }
        const indent = lineIndent(text, caret);
        const before = text.slice(0, caret);
        const after = text.slice(e.currentTarget.selectionEnd);
        setText(before + "\n" + indent + after);
        const newCaret = caret + 1 + indent.length;
        requestAnimationFrame(() => textareaRef.current?.setSelectionRange(newCaret, newCaret));
        return;
      }
      e.preventDefault();
      handleSend({ queue: e.ctrlKey || e.metaKey });
      return;
    }
    if (e.key === "Tab" && insideFence(text, e.currentTarget.selectionStart)) {
      e.preventDefault();
      const caret = e.currentTarget.selectionStart;
      const before = text.slice(0, caret);
      const after = text.slice(e.currentTarget.selectionEnd);
      setText(before + "  " + after);
      const newCaret = caret + 2;
      requestAnimationFrame(() => textareaRef.current?.setSelectionRange(newCaret, newCaret));
      return;
    }
    // Tab, once the menu (which owns it while open) and a ``` fence (where it indents) are out of
    // the way. Enter is left alone: accepting and sending are two decisions, and joining them would
    // send a guess on one keystroke.
    if (e.key === "Tab" && ghost) {
      e.preventDefault();
      acceptGhost();
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
  // While an agent answers, the button by the box is the stop button and no longer says that what
  // you write will wait its turn. The empty box is where that has to be said instead.
  const hint = busy
    ? t("composer.placeholder.busy")
    : compact ? placeholder : `${placeholder} ${t("composer.sendShortcut")}`;

  /**
   * An empty box says the same thing forever, and what it says is the least it could: one of five
   * things to do with the team, typed and swapped every few seconds. The shortcut is one of them
   * rather than a permanent tail, which is how it stops being furniture and gets read once.
   *
   * Only where there is a team to talk to, and never on the phone: less movement, less battery, and
   * the box there is small enough that a moving line is in the way.
   */
  const rotating = !chatMode && !noTeam && !compact && !busy;

  // An empty box draws its placeholder where the layer behind it draws the grey suggestion, so both
  // of them landed in the same line of space and neither could be read. See `ghostTakesPlaceholder`.
  const ghostInstead = ghostTakesPlaceholder(text, ghost);
  const rotatingHints = useMemo(() => [
    t("composer.placeholder.team"),
    t("composer.placeholder.rotate1"),
    t("composer.placeholder.rotate2"),
    t("composer.placeholder.rotate3"),
    t("composer.placeholder.shortcut"),
  ], [t]);

  return (
    <div
      className="border-t border-border p-3 shrink-0 bg-background"
      onDragEnter={onDragEnter}
      onDragOver={onDragOver}
      onDragLeave={onDragLeave}
      onDrop={onDropFiles}
    >
      <div className={cn(
        "max-w-3xl mx-auto flex flex-col gap-2 rounded-lg transition-colors",
        // A dashed outline rather than a filled overlay: the box has to stay readable underneath,
        // since what you already wrote is going with the files.
        dropping && "outline-dashed outline-2 outline-offset-4 outline-primary/60",
      )}>
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
        {/* Out of the box and its question alike: the paperclip that opens it lives in the bar
            below, which is on screen either way, and a hidden input inside a branch that vanishes
            is a button that does nothing. */}
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

        {pendingQuestionData && !writeInstead ? (
          <div className="flex flex-col gap-1">
            {pendingQuestionData.pending > 1 && (
              <p className="text-xs text-muted-foreground">
                {t("questions.pending", { n: pendingQuestionData.pending })}
              </p>
            )}
            <QuestionGroup
              key={pendingQuestionData.group[0].id}
              questions={pendingQuestionData.group}
              size="md"
              onAnswer={answerQuestions}
            />
            <Button
              variant="ghost"
              size="sm"
              className="mt-1 self-start text-xs text-muted-foreground"
              onClick={() => setWriteInstead(true)}
            >
              {t("questions.writeInstead")}
            </Button>
          </div>
        ) : (
          <div className="relative">
            {menuOpen && (
              <div className="absolute bottom-full left-0 z-20 mb-1 w-full overflow-hidden rounded-md border border-border bg-popover shadow-md">
                {menuOptions.map((option, i) => (
                  <button
                    key={option.id}
                    type="button"
                    // The box keeps the focus: losing it would close the list before the click lands.
                    onMouseDown={e => { e.preventDefault(); pickOption(option); }}
                    onMouseEnter={() => setMenuIndex(i)}
                    className={`flex w-full min-w-0 items-baseline gap-2 px-3 py-1.5 text-left text-xs ${i === menuIndex ? "bg-accent text-accent-foreground" : ""}`}
                  >
                    <span className="shrink-0 font-mono">{option.label}</span>
                    {option.hint && <span className="min-w-0 flex-1 truncate text-xs text-muted-foreground">{option.hint}</span>}
                  </button>
                ))}
              </div>
            )}
            {/* The background behind ``` regions: same font metrics and padding as the textarea on
                top of it, so its text lines up exactly. Its own text is invisible (`text-transparent`)
                — only the span backgrounds show through — the textarea's text is what gets read. Kept
                mounted even with nothing to highlight, so there is no flash of misaligned layout. */}
            <div
              ref={highlightRef}
              aria-hidden
              className="pointer-events-none absolute inset-0 min-h-[60px] max-h-[200px] overflow-y-auto whitespace-pre-wrap break-words px-3 py-2 text-base text-transparent md:text-sm pr-12"
            >
              {/* `renderFenceHighlight` gives back nothing when there are no fences, which is fine
                  while this layer only paints backgrounds — but the grey text has to sit after what
                  is typed, so the typed text (still invisible) has to be here to push it there. */}
              {renderFenceHighlight(text, fenceHighlightRegions) ?? (ghost ? text : null)}
              {ghost && <span className="text-muted-foreground/70">{ghost.text}</span>}
              {"\n"}
            </div>
            {/* `field-sizing-content` (from the base Textarea) grows the box between these bounds. */}
            <Textarea
              ref={textareaRef}
              value={text}
              onChange={e => { setText(e.target.value); setHistoryIndex(null); setMenuCaret(e.target.selectionStart); }}
              onKeyDown={handleKeyDown}
              onKeyUp={e => setMenuCaret(e.currentTarget.selectionStart)}
              onClick={e => setMenuCaret(e.currentTarget.selectionStart)}
              onPaste={handlePaste}
              onScroll={e => { if (highlightRef.current) highlightRef.current.scrollTop = e.currentTarget.scrollTop; }}
              placeholder={rotating || ghostInstead ? "" : hint}
              aria-label={placeholder}
              rows={2}
              className="relative resize-none min-h-[60px] max-h-[200px] overflow-y-auto bg-transparent pr-12 dark:bg-transparent"
            />
            {/* The real placeholder of a textarea cannot move, so this sits on top of the empty box.
                Nothing to click through, nothing to read out: the label above is what is announced. */}
            {rotating && !text && !ghost && (
              <span
                aria-hidden
                className="pointer-events-none absolute left-3 top-2 max-w-[calc(100%-4rem)] truncate text-sm text-muted-foreground"
              >
                <Typewriter words={rotatingHints} typeSpeed={45} deleteSpeed={20} pause={3000} cursor={false} />
              </span>
            )}
            {/* One button, and it is whatever the moment calls for: while an agent is answering
                there is nothing to send that would not wait its turn anyway, and what you want at
                hand is the way to stop it. Sending while it works still exists — Enter queues, and
                the box says so — it just no longer needs a button of its own crowding the text. */}
            {/* No filled shape sitting on the text: the icon carries it, and the only colour is the
                grey the rest of the app uses to say "your pointer is here". A square and a paper
                plane are already two different things without painting one of them red. */}
            <div className="absolute bottom-2 right-2">
              {busy ? (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-foreground hover:bg-accent"
                  onClick={handleStop}
                  title={t("composer.stopHint")}
                  aria-label={t("composer.stop")}
                >
                  <Square className="h-4 w-4" />
                </Button>
              ) : (
                <Button
                  variant="ghost"
                  size="icon"
                  className="h-8 w-8 text-foreground hover:bg-accent"
                  onClick={() => handleSend()}
                  disabled={!canSend}
                  title={t("composer.sendHint")}
                  aria-label={t("composer.send")}
                >
                  <Send className="h-4 w-4" />
                </Button>
              )}
            </div>
          </div>
        )}

        {(!chatMode || quotaAgent || !compact) && (
          <div className="flex gap-2 items-center flex-wrap">
            {!compact && (
              <Button
                type="button"
                variant="ghost"
                size="icon"
                className="h-8 w-8 text-foreground hover:bg-accent"
                onClick={() => fileInputRef.current?.click()}
                title={t("attachments.attachHint")}
                aria-label={t("attachments.attach")}
              >
                <Paperclip className="h-4 w-4" />
              </Button>
            )}

            {/* Everything you set or watch lives at the right end: who answers, on which model,
                what is waiting for you and what is left to spend. The left is for the box itself. */}
            <div className="ml-auto flex items-center gap-2 flex-wrap">
              {!chatMode && (
                <>
                  <Select value={targetId} onValueChange={setTargetId}>
                    <SelectTrigger className={cn("w-[150px]", FLAT_SELECT)}>
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
                    <SelectTrigger className={cn("w-[170px]", FLAT_SELECT)}>
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

              <div className="flex items-center gap-1">
                <ApprovalsPill />
                {quotaAgent && <QuotaIndicator agent={quotaAgent} />}
              </div>
            </div>
          </div>
        )}

        {/* What `/cost` opens: the same panel as the button in the header, from the keyboard. */}
        {currentProjectId && (
          <UsageDialog projectId={currentProjectId} open={usageOpen} onOpenChange={setUsageOpen} />
        )}
      </div>
    </div>
  );
}
