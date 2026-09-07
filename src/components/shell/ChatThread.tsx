import { useEffect, useRef, useState } from "react";
import { AgentAvatar } from "@/components/ProviderLogo";
import { useAppStore, selectAllAgents } from "@/store";
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
import { useT, useLocale } from "@/i18n/useT";
import { copyText } from "@/lib/clipboard";
import { hasMarkdown, toPlainText } from "@/lib/text";
import { createTaskFromMessage } from "@/lib/task-from-message";
import type { ChatMessage } from "@/types";
import { Copy, FileCode, FileText, ListTodo, MessageSquare, Pencil, Trash2 } from "lucide-react";

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

  const chat = chats.find(c => c.id === chatId);
  const messages: ChatMessage[] = chatMessages[chatId] || [];

  useEffect(() => {
    void loadChatMessages(chatId);
  }, [chatId, loadChatMessages]);

  // Opening a chat (or finishing its load) lands on the last message, instantly.
  useEffect(() => {
    if (chatLoading) return;
    const id = requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }));
    return () => cancelAnimationFrame(id);
  }, [chatId, chatLoading]);

  useEffect(() => {
    endRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, messages[messages.length - 1]?.text]);

  // While an agent answers, its activity grows inside the bubble: follow the bottom on a timer
  // instead of reacting to every streamed delta.
  const answering = messages.some(m => m.status === "pending");
  useEffect(() => {
    if (!answering) return;
    const interval = setInterval(() => {
      requestAnimationFrame(() => endRef.current?.scrollIntoView({ block: "end" }));
    }, 150);
    return () => clearInterval(interval);
  }, [answering]);

  if (!chat) {
    return (
      <div className="h-full flex items-center justify-center text-muted-foreground text-sm">
        {t("chat.gone")}
      </div>
    );
  }

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
    <div className="flex flex-col h-full overflow-hidden">
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

      <div className="flex-1 overflow-y-auto p-4">
        <div className="flex flex-col gap-3 max-w-3xl mx-auto">
          {chatLoading ? (
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
          <div ref={endRef} />
        </div>
      </div>

      {editOpen && (
        <ChatDialog key={chatId} open={editOpen} onOpenChange={setEditOpen} editChatId={chatId} />
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
              message.text
            ) : (
              <Markdown text={message.text} />
            )}
          </div>
          <RunDetailDialog runId={message.runId || null} open={detailOpen} onOpenChange={setDetailOpen} />
        </div>
      </ContextMenuTrigger>
      <ContextMenuContent className="w-52">
        <ContextActionItems actions={messageActions} />
      </ContextMenuContent>
    </ContextMenu>
  );
}
