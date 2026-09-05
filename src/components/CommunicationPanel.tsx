import { useState, useRef, useEffect } from "react";
import { useAppStore } from "@/store";
import { MessageItem } from "./MessageItem";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { MessageKind } from "@/types";
import { kindLabel } from "@/lib/labels";

const allKinds: MessageKind[] = ["text", "tool", "delegation", "result", "error", "system", "stderr"];

export function CommunicationPanel() {
  const messages = useAppStore(state => state.messages);
  const agents = useAppStore(state => state.config.agents);
  const clearMessages = useAppStore(state => state.clearMessages);
  
  const [filterAgent, setFilterAgent] = useState<string>("all");
  const [filterKinds, setFilterKinds] = useState<Set<MessageKind>>(new Set(allKinds));
  
  const scrollRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (scrollRef.current) {
      scrollRef.current.scrollIntoView();
    }
  }, [messages.length]);

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
    <div className="flex flex-col h-full overflow-hidden">
      <div className="p-2 border-b border-border flex items-center gap-2 flex-wrap">
        <Select value={filterAgent} onValueChange={setFilterAgent}>
          <SelectTrigger className="w-[150px] h-8 text-xs">
            <SelectValue placeholder="Todos" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">Todos</SelectItem>
            {agents.map(a => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <div className="flex gap-1 flex-wrap flex-1">
          {allKinds.map(kind => (
            <Badge
              key={kind}
              variant={filterKinds.has(kind) ? "default" : "outline"}
              className="cursor-pointer text-xs"
              onClick={() => toggleKind(kind)}
            >
              {kindLabel[kind]}
            </Badge>
          ))}
        </div>

        <Button variant="ghost" size="sm" onClick={() => clearMessages()}>Limpiar</Button>
      </div>

      <ScrollArea className="flex-1">
        <div className="flex flex-col">
          {filteredMessages.map(m => (
            <MessageItem key={m.id} message={m} />
          ))}
          <div ref={scrollRef} />
        </div>
      </ScrollArea>
    </div>
  );
}
