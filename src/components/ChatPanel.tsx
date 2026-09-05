import { useState, useRef, useEffect } from "react";
import { useAppStore } from "@/store";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Badge } from "@/components/ui/badge";
import { ChatDialog } from "./ChatDialog";
import { Plus, Trash2, Send, Square, MessageCircle } from "lucide-react";
import { isChatActive } from "@/lib/chat";
import type { ChatMessage } from "@/types";

export function ChatPanel() {
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const chats = useAppStore(state => state.config.chats);
  const agents = useAppStore(state => state.config.agents);
  const chatMessages = useAppStore(state => state.chatMessages);
  const currentChatId = useAppStore(state => state.currentChatId);
  const setCurrentChat = useAppStore(state => state.setCurrentChat);
  const removeChat = useAppStore(state => state.removeChat);
  const sendChatMessage = useAppStore(state => state.sendChatMessage);
  const stopChat = useAppStore(state => state.stopChat);
  const loadChatMessages = useAppStore(state => state.loadChatMessages);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [inputText, setInputText] = useState("");
  const messagesEndRef = useRef<HTMLDivElement>(null);

  const projectChats = chats.filter(c => c.projectId === currentProjectId);
  const currentChat = currentChatId ? chats.find(c => c.id === currentChatId) : undefined;
  const messages: ChatMessage[] = currentChatId ? (chatMessages[currentChatId] || []) : [];

  // Force re-render on active turn changes
  const [, setTick] = useState(0);
  useEffect(() => {
    const interval = setInterval(() => setTick(t => t + 1), 500);
    return () => clearInterval(interval);
  }, []);

  const isActive = currentChatId ? isChatActive(currentChatId) : false;

  // Load messages when chat is selected
  useEffect(() => {
    if (currentChatId) {
      void loadChatMessages(currentChatId);
    }
  }, [currentChatId, loadChatMessages]);

  // Auto-scroll to bottom
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: "smooth" });
  }, [messages.length, messages[messages.length - 1]?.text]);

  const handleSend = () => {
    if (!inputText.trim() || !currentChatId || isActive) return;
    void sendChatMessage(currentChatId, inputText.trim());
    setInputText("");
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "Enter" && e.ctrlKey) {
      e.preventDefault();
      handleSend();
    }
  };

  return (
    <div className="flex h-full overflow-hidden">
      {/* Sidebar: chat list */}
      <div className="w-[240px] border-r border-border flex flex-col">
        <div className="p-2 border-b border-border">
          <Button size="sm" className="w-full" onClick={() => setDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-1" /> Nuevo chat
          </Button>
        </div>
        <div className="flex-1 overflow-y-auto">
          {projectChats.length === 0 && (
            <div className="p-4 text-sm text-muted-foreground text-center">
              No hay chats. Creá uno para empezar.
            </div>
          )}
          {projectChats.map(chat => {
            const isSelected = chat.id === currentChatId;
            const participantNames = chat.participants.map(p => {
              const a = agents.find(x => x.id === p.agentId);
              return a?.name || "?";
            }).join(", ");

            return (
              <div
                key={chat.id}
                className={`p-3 cursor-pointer border-b border-border hover:bg-muted/50 ${isSelected ? "bg-muted" : ""}`}
                onClick={() => setCurrentChat(chat.id)}
              >
                <div className="flex items-center justify-between">
                  <span className="font-medium text-sm truncate">{chat.name}</span>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-5 w-5 text-muted-foreground"
                    onClick={(e) => { e.stopPropagation(); removeChat(chat.id); }}
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                  </Button>
                </div>
                <div className="text-xs text-muted-foreground mt-1 flex items-center gap-1">
                  <Badge variant="outline" className="text-[10px]">{chat.mode === "shared" ? "Compartido" : "Individual"}</Badge>
                  <span className="truncate">{participantNames}</span>
                </div>
              </div>
            );
          })}
        </div>
      </div>

      {/* Main chat area */}
      <div className="flex-1 flex flex-col overflow-hidden">
        {!currentChat ? (
          <div className="flex-1 flex items-center justify-center text-muted-foreground">
            <div className="text-center">
              <MessageCircle className="h-12 w-12 mx-auto mb-4 opacity-50" />
              <p>Seleccioná o creá un chat para empezar</p>
            </div>
          </div>
        ) : (
          <>
            {/* Chat header */}
            <div className="p-3 border-b border-border flex items-center gap-2">
              <span className="font-semibold">{currentChat.name}</span>
              <Badge variant="outline" className="text-xs">
                {currentChat.mode === "shared" ? "Compartido" : "Individual"}
              </Badge>
              <div className="text-xs text-muted-foreground ml-auto">
                {currentChat.participants.map(p => {
                  const a = agents.find(x => x.id === p.agentId);
                  return `${a?.name || "?"} (${p.role})`;
                }).join(" · ")}
              </div>
            </div>

            {/* Messages */}
            <div className="flex-1 overflow-y-auto p-4">
              <div className="flex flex-col gap-3 max-w-3xl mx-auto">
                {messages.map((msg) => (
                  <ChatBubble key={msg.id} message={msg} />
                ))}
                {isActive && (
                  <div className="flex items-center gap-2 text-sm text-muted-foreground animate-pulse">
                    <div className="w-2 h-2 rounded-full bg-blue-400 animate-bounce" />
                    Escribiendo…
                  </div>
                )}
                <div ref={messagesEndRef} />
              </div>
            </div>

            {/* Input */}
            <div className="p-3 border-t border-border">
              <div className="flex gap-2 max-w-3xl mx-auto">
                <Textarea
                  value={inputText}
                  onChange={e => setInputText(e.target.value)}
                  onKeyDown={handleKeyDown}
                  placeholder="Escribí un mensaje... (Ctrl+Enter para enviar)"
                  className="flex-1 min-h-[60px] max-h-[150px] resize-none"
                  disabled={isActive}
                />
                <div className="flex flex-col gap-1">
                  {isActive ? (
                    <Button variant="destructive" size="icon" onClick={() => void stopChat(currentChatId!)}>
                      <Square className="h-4 w-4" />
                    </Button>
                  ) : (
                    <Button size="icon" onClick={handleSend} disabled={!inputText.trim()}>
                      <Send className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      <ChatDialog open={dialogOpen} onOpenChange={setDialogOpen} />
    </div>
  );
}

function ChatBubble({ message }: { message: ChatMessage }) {
  const agents = useAppStore(state => state.config.agents);
  const isUser = message.from === "user";
  const agent = !isUser ? agents.find(a => a.id === message.from) : undefined;
  const name = isUser ? "Vos" : (agent?.name || message.from);
  const color = agent?.color || "#888";

  const time = new Date(message.ts);
  const timeStr = `${time.getHours().toString().padStart(2, '0')}:${time.getMinutes().toString().padStart(2, '0')}`;

  return (
    <div className={`flex flex-col ${isUser ? "items-end" : "items-start"}`}>
      <div className="flex items-center gap-1.5 mb-1">
        {!isUser && <div className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: color }} />}
        <span className="text-xs font-medium">{name}</span>
        <span className="text-xs text-muted-foreground">{timeStr}</span>
        {message.status === "pending" && (
          <Badge variant="secondary" className="text-[9px] animate-pulse">escribiendo…</Badge>
        )}
        {message.status === "error" && (
          <Badge variant="destructive" className="text-[9px]">error</Badge>
        )}
      </div>
      <div
        className={`rounded-lg px-3 py-2 max-w-[80%] text-sm whitespace-pre-wrap break-words ${
          isUser
            ? "bg-primary text-primary-foreground"
            : message.status === "error"
              ? "bg-destructive/10 text-destructive border border-destructive/20"
              : "bg-muted"
        }`}
      >
        {message.status === "pending" && !message.text ? "…" : message.text}
      </div>
    </div>
  );
}
