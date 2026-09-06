import { useState, useRef, useEffect, useMemo } from "react";
import { useAppStore, selectProjectAgents } from "@/store";
import { MessageItem } from "./MessageItem";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageKind } from "@/types";
import { kindLabel } from "@/lib/labels";
import { ArrowDown, Radio, Trash2 } from "lucide-react";

const allKinds: MessageKind[] = ["text", "tool", "delegation", "result", "error", "system", "stderr"];

export function CommunicationPanel() {
  const currentProjectId = useAppStore(state => state.currentProjectId);
  // Select the stable array and filter in useMemo: a selector that returns a fresh
  // array on every call makes useSyncExternalStore re-render forever.
  const allMessages = useAppStore(state => state.messages);
  const messages = useMemo(
    () => currentProjectId
      ? allMessages.filter(m => m.projectId === currentProjectId || (!m.projectId && m.kind === "system"))
      : [],
    [allMessages, currentProjectId],
  );
  const agents = useAppStore(state => selectProjectAgents(state, state.currentProjectId));
  const clearMessages = useAppStore(state => state.clearMessages);
  
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [filterKinds, setFilterKinds] = useState<Set<MessageKind>>(new Set(allKinds));
  
  const [stickToBottom, setStickToBottom] = useState(true);
  const [hasNewMessages, setHasNewMessages] = useState(false);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);

  const prevMessagesLength = useRef(messages.length);

  useEffect(() => {
    if (messages.length > prevMessagesLength.current) {
      if (stickToBottom) {
        bottomRef.current?.scrollIntoView();
      } else {
        setHasNewMessages(true);
      }
    }
    prevMessagesLength.current = messages.length;
  }, [messages.length, stickToBottom]);

  const onScroll = () => {
    if (!scrollContainerRef.current) return;
    const { scrollHeight, scrollTop, clientHeight } = scrollContainerRef.current;
    const isAtBottom = scrollHeight - scrollTop - clientHeight < 40;
    setStickToBottom(isAtBottom);
    if (isAtBottom) {
      setHasNewMessages(false);
    }
  };

  const scrollToBottom = () => {
    setStickToBottom(true);
    setHasNewMessages(false);
    bottomRef.current?.scrollIntoView({ behavior: "smooth" });
  };

  const toggleKind = (kind: MessageKind) => {
    setFilterKinds(prev => {
      const next = new Set(prev);
      if (next.has(kind)) next.delete(kind);
      else next.add(kind);
      return next;
    });
  };

  const filteredMessages = messages.filter(m => {
    if (filterAgent !== "all" && m.fromAgentId !== filterAgent && m.toAgentId !== filterAgent) {
      return false;
    }
    if (m.kind !== "user" && m.kind !== "instruction" && !filterKinds.has(m.kind)) {
      return false;
    }
    return true;
  });

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      <div className="p-2 border-b border-border flex items-center gap-2">
        <Select value={filterAgent} onValueChange={setFilterAgent}>
          <SelectTrigger className="flex-1 h-8 text-xs">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {agents.map(a => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 text-xs">
              {filterKinds.size === allKinds.length ? "Tipos" : `Tipos (${filterKinds.size}/${allKinds.length})`}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {allKinds.map(kind => (
              <DropdownMenuCheckboxItem
                key={kind}
                checked={filterKinds.has(kind)}
                onCheckedChange={() => toggleKind(kind)}
              >
                {kindLabel[kind]}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => clearMessages(currentProjectId || undefined)} title="Limpiar">
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div 
        ref={scrollContainerRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto"
      >
        {filteredMessages.length === 0 ? (
          <EmptyState
            icon={Radio}
            title="Todavía no hay actividad"
            description="Acá vas a ver lo que se dicen los agentes entre sí a medida que trabajan."
            className="h-full"
          />
        ) : (
          <div className="flex flex-col relative">
            {filteredMessages.map(m => (
              <MessageItem key={m.id} message={m} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {!stickToBottom && hasNewMessages && (
        <Button
          size="sm"
          className="absolute bottom-4 right-4 rounded-full shadow-md z-10 gap-2"
          onClick={scrollToBottom}
        >
          <ArrowDown className="h-4 w-4" />
          Ir al final
        </Button>
      )}
    </div>
  );
}
