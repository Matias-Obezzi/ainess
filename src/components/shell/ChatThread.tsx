import { useEffect, useMemo, useRef, useState } from "react";
import { AgentAvatar } from "@/components/ProviderLogo";
import { stickToBottom as stick, resetScrolledAncestors } from "@/lib/stick-to-bottom";
import { useAppStore, selectAllAgents } from "@/store";
import { QueuedMessages } from "./QueuedMessages";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Skeleton } from "@/components/ui/skeleton";
import { EmptyState } from "@/components/ui/empty-state";
import { ChatDialog } from "@/components/ChatDialog";
import { Markdown } from "@/components/shell/Markdown";
import { RunActivity } from "@/components/shell/RunActivity";
import { ErrorMessage } from "@/components/ErrorMessage";
import { RunDetailDialog } from "@/components/RunDetailDialog";
import { ContextActionItems, type MenuAction } from "@/components/menu-actions";
import { ContextMenu, ContextMenuContent, ContextMenuTrigger } from "@/components/ui/context-menu";
import { formatClock } from "@/lib/format";
import { confirm } from "@/lib/confirm";
import { isNearBottom } from "@/lib/feed-window";
import { plural } from "@/i18n";
import { useT, useLocale } from "@/i18n/useT";
import { copyText } from "@/lib/clipboard";
import { hasMarkdown, toPlainText } from "@/lib/text";
import { createTaskFromMessage } from "@/lib/task-from-message";
import { rewindRemoves } from "@/lib/chat-rewind";
import { EditMessageDialog } from "@/components/EditMessageDialog";
import type { ChatMessage } from "@/types";
import { ArrowDown, Copy, FileCode, FileText, ListTodo, MessageSquare, Pencil, PencilLine, RotateCcw, Trash2 } from "lucide-react";

/** One chat's message thread. The chat list lives in the sidebar and the input in the Composer. */
export function ChatThread({ chatId }: { chatId: string }) {
  const t = useT();
  const chats = useAppStore(state => state.config.chats);
  const agents = useAppStore(selectAllAgents);
  const chatMessages = useAppStore(state => state.chatMessages);
  const chatLoading = useAppStore(state => state.chatLoading[chatId]);
  const loadChatMessages = useAppStore(state => state.loadChatMessages);
  const removeChat = useAppStore(state => state.removeChat);
  const openProject = useAppStore(state => state.openProject);

  const [editOpen, setEditOpen] = useState(false);
  const endRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  
  const [stickToBottom, setStickToBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const prevMessagesLength = useRef(0);

  const chat = chats.find(c => c.id === chatId);
  const messages: ChatMessage[] = chatMessages[chatId] || [];

  // Sent while the chat was mid-answer: it waits its turn, and says so.
  const chatQueue = useAppStore(state => state.chatQueues[chatId]);
  const unqueueChatMessage = useAppStore(state => state.unqueueChatMessage);
  const sendChatNow = useAppStore(state => state.sendChatNow);
  // One block: they go over as a single message, so there is one "send now" for the lot.
  const queued = useMemo(
    () => [{
      lines: (chatQueue ?? []).map((text, index) => ({
        text,
        onCancel: () => unqueueChatMessage(chatId, index),
      })),
      onSendNow: () => void sendChatNow(chatId),
    }],
    [chatQueue, chatId, unqueueChatMessage, sendChatNow],
  );

  useEffect(() => {
    void loadChatMessages(chatId);
  }, [chatId, loadChatMessages]);

  // Opening a chat (or finishing its load) lands on the last message, instantly.
  useEffect(() => {
    if (chatLoading) return;
    const id = requestAnimationFrame(() => stick(scrollRef.current));
    return () => cancelAnimationFrame(id);
  }, [chatId, chatLoading]);

  // Another conversation is another bottom: what the last one had counted, and how many messages it
  // had, mean nothing here.
  useEffect(() => {
    setStickToBottom(true);
    setNewCount(0);
    prevMessagesLength.current = 0;
  }, [chatId]);

  useEffect(() => {
    if (messages.length > prevMessagesLength.current) {
      if (stickToBottom) {
        stick(scrollRef.current, "smooth");
      } else {
        setNewCount(n => n + (messages.length - prevMessagesLength.current));
      }
    } else if (stickToBottom) {
      // The last message growing as it is written: follow it, but only from the bottom.
      stick(scrollRef.current, "smooth");
    }
    prevMessagesLength.current = messages.length;
  }, [messages.length, messages[messages.length - 1]?.text, stickToBottom]);

  // While an agent answers, its activity grows inside the bubble: follow the bottom on a timer
  // instead of reacting to every streamed delta.
  //
  // `stick` and not `scrollIntoView`: this loop runs for as long as an answer is being written, and
  // `scrollIntoView` scrolls every scroll container above the element too — including the
  // `overflow: hidden` ones, which have no scrollbar to put back. See `lib/stick-to-bottom.ts`.
  const answering = messages.some(m => m.status === "pending");
  useEffect(() => {
    if (!answering || !stickToBottom) return;
    const interval = setInterval(() => {
      requestAnimationFrame(() => {
        const el = scrollRef.current;
        if (!el) return;
        stick(el);
        // Nothing above a chat is meant to scroll, so if something did, this is where it shows.
        resetScrolledAncestors(el, "chat");
      });
    }, 150);
    return () => clearInterval(interval);
  }, [answering, stickToBottom]);

  if (!chat) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        {t("chat.gone")}
      </div>
    );
  }

  const onScroll = () => {
    if (!scrollRef.current) return;
    const isAtBottom = isNearBottom(scrollRef.current);
    setStickToBottom(isAtBottom);
    if (isAtBottom) setNewCount(0);
  };

  const scrollToBottom = () => {
    setStickToBottom(true);
    setNewCount(0);
    stick(scrollRef.current, "smooth");
  };

  const handleRemove = async () => {
    const confirmed = await confirm({
      title: t("sidebar.deleteChat.title"),
      description: t("sidebar.deleteChat.body", { name: chat.name }),
      destructive: true,
    });
    if (!confirmed) return;
    const projectId = chat.projectId;
    removeChat(chatId);
    openProject(projectId, null);
  };

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      <div className="px-4 py-2 border-b border-border flex items-center gap-2 shrink-0">
        <span className="font-semibold text-sm truncate">{chat.name}</span>
        <Badge variant="outline" className="text-[10px]">
          {chat.mode === "shared" ? t("chat.shared") : t("chat.individual")}
        </Badge>
        <span className="text-xs text-muted-foreground truncate">
          {chat.participants.map(p => `${agents.find(a => a.id === p.agentId)?.name ?? "?"} (${p.role})`).join(" · ")}
        </span>
        <div className="ml-auto flex gap-1">
          <Button variant="ghost" size="icon" className="h-7 w-7" title={t("chat.edit")} onClick={() => setEditOpen(true)}>
            <Pencil className="h-3.5 w-3.5" />
          </Button>
          <Button variant="ghost" size="icon" className="h-7 w-7" title={t("chat.delete")} onClick={() => void handleRemove()}>
            <Trash2 className="h-3.5 w-3.5" />
          </Button>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto p-4" ref={scrollRef} onScroll={onScroll}>
        <div className="flex flex-col gap-3 max-w-3xl mx-auto">
          {/* Skeletons only over an empty thread. A reload that happens while the history is
              already on screen used to replace it with three grey blocks, which reads as the
              conversation having been lost. */}
          {chatLoading && messages.length === 0 ? (
            <>
              <BubbleSkeleton align="start" />
              <BubbleSkeleton align="end" />
              <BubbleSkeleton align="start" />
            </>
          ) : messages.length === 0 ? (
            <EmptyState
              icon={MessageSquare}
              title={t("chat.empty.title")}
              description={t("chat.empty.body")}
            />
          ) : (
            messages.map(msg => <ChatBubble key={msg.id} message={msg} projectId={chat?.projectId} />)
          )}
          {/* Written while the chat was answering: it goes when this turn ends. */}
          <QueuedMessages groups={queued} />
          <div ref={endRef} />
        </div>
      </div>

      {editOpen && (
        <ChatDialog key={chatId} open={editOpen} onOpenChange={setEditOpen} editChatId={chatId} />
      )}
      {!stickToBottom && newCount > 0 && (
        <Button size="sm" className="absolute bottom-4 right-4 rounded-full shadow-md z-10 gap-2" onClick={scrollToBottom}>
          <ArrowDown className="h-4 w-4" /> {plural(newCount, t("thread.newMessages.one", { n: newCount }), t("thread.newMessages.other", { n: newCount }))}
        </Button>
      )}
    </div>
  );
}

function BubbleSkeleton({ align }: { align: "start" | "end" }) {
  return (
    <div className={`flex flex-col gap-1 ${align === "end" ? "items-end" : "items-start"}`}>
      <Skeleton className="h-3 w-20" />
      <Skeleton className="h-10 w-56 rounded-lg" />

    </div>
  );
}

function ChatBubble({ message, projectId }: { message: ChatMessage; projectId?: string }) {
  const t = useT();
  const locale = useLocale();
  const agents = useAppStore(selectAllAgents);
  const isUser = message.from === "user";
  const agent = !isUser ? agents.find(a => a.id === message.from) : undefined;
  const name = isUser ? t("chat.you") : (agent?.name || message.from);
  const color = agent?.color || "#888";
  const isPending = message.status === "pending";
  // A pending bubble left behind by a closed app has no run to stream from.
  const hasRun = useAppStore(state => (message.runId ? !!state.runs[message.runId] : false));
  const [detailOpen, setDetailOpen] = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const rewindChat = useAppStore(state => state.rewindChat);
  // How much a rewind would take with it. Reverting to the last message removes nothing, and a menu
  // item that does nothing has no business asking for confirmation.
  const afterThis = useAppStore(state => rewindRemoves(state.chatMessages[message.chatId] ?? [], message.id, true));
  const doRewind = async () => {
    const confirmed = await confirm({
      title: t("chat.rewind.title"),
      description: t("chat.rewind.body", { n: afterThis }),
      destructive: true,
    });
    if (!confirmed) return;
    await rewindChat(message.chatId, message.id, true);
  };

  const messageActions: MenuAction[] = [
    {
      key: "copy",
      label: t("message.copyText"),
      icon: Copy,
      disabled: !message.text,
      onSelect: () => void copyText(toPlainText(message.text), t("message.textCopied")),
    },
    {
      key: "copy-markdown",
      label: t("message.copyMarkdown"),
      icon: FileCode,
      disabled: !message.text || !hasMarkdown(message.text),
      onSelect: () => void copyText(message.text, t("message.markdownCopied")),
    },
    // A chat outside a project has no board to put the card on.
    ...(projectId
      ? [
          {
            key: "task",
            label: t("message.createTask"),
            icon: ListTodo,
            separatorBefore: true,
            disabled: !message.text,
            onSelect: () =>
              createTaskFromMessage({
                projectId,
                text: message.text,
                agentId: isUser ? undefined : message.from,
                runId: message.runId,
              }),
          } satisfies MenuAction,
        ]
      : []),
    // Only an agent's turn comes from a run, so only it has a detail to show.
    ...(isUser
      ? []
      : [
          {
            key: "detail",
            label: t("message.viewDetail"),
            icon: FileText,
            disabled: !message.runId || !hasRun,
            onSelect: () => setDetailOpen(true),
          } satisfies MenuAction,
        ]),
    // Rewriting only makes sense for what you wrote: an agent's answer is a record of what it said,
    // and editing that would be putting words in its mouth in its own transcript.
    ...(isUser
      ? [
          {
            key: "edit",
            label: t("message.editAndResend"),
            icon: PencilLine,
            separatorBefore: true,
            disabled: isPending,
            onSelect: () => setEditOpen(true),
          } satisfies MenuAction,
        ]
      : []),
    {
      key: "rewind",
      label: t("message.rewind"),
      icon: RotateCcw,
      separatorBefore: !isUser,
      destructive: true,
      disabled: afterThis === 0,
      onSelect: () => void doRewind(),
    },
  ];

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
          <div className="flex items-center gap-1.5 mb-1">
            {!isUser && (agent ? <AgentAvatar provider={agent.provider} color={color} size={22} /> : <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />)}
            <span className="text-xs font-medium">{name}</span>
            <span className="text-xs text-muted-foreground">{formatClock(message.ts, locale)}</span>
            {message.status === "error" && <Badge variant="destructive" className="text-[9px]">error</Badge>}
          </div>
          {/* The user's turn is a bubble; the agent's answer reads like a document under its name. */}
          <div
            className={`text-sm break-words ${
              isUser
                ? "rounded-xl px-3.5 py-2 max-w-[80%] bg-muted whitespace-pre-wrap"
                : message.status === "error"
                  ? "rounded-lg px-3 py-2 max-w-[90%] bg-destructive/10 text-destructive border border-destructive/20 whitespace-pre-wrap"
                  : "pl-[18px] w-full"
            }`}
          >
            {isPending ? (
              // Live: what the agent is writing plus every tool it uses, with its own footer.
              message.runId && hasRun
                ? <RunActivity runId={message.runId} />
                : <span className="text-muted-foreground">…</span>
            ) : message.status === "error" ? (
              <ErrorMessage text={message.text} />
            ) : isUser ? (
              // As you wrote it, unless you wrote markdown: a list is a list here too.
              hasMarkdown(message.text) ? <Markdown text={message.text} /> : message.text
            ) : (
              <Markdown text={message.text} />
            )}
          </div>
          <RunDetailDialog runId={message.runId || null} open={detailOpen} onOpenChange={setDetailOpen} />
          {isUser && <EditMessageDialog message={message} open={editOpen} onOpenChange={setEditOpen} />}
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextActionItems actions={messageActions} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
