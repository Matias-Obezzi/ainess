import { useState, useRef, useEffect, useLayoutEffect, useMemo } from "react";
import { useAppStore, selectProjectAgents } from "@/store";
import { windowOf, isNearBottom } from "@/lib/feed-window";
import { MessageItem } from "./MessageItem";
import { plural } from "@/i18n";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuCheckboxItem } from "@/components/ui/dropdown-menu";
import { EmptyState } from "@/components/ui/empty-state";
import { MessageKind } from "@/types";
import { kindLabelKey } from "@/lib/labels";
import { confirm } from "@/lib/confirm";
import { useT } from "@/i18n/useT";
import { ArrowDown, Radio, Trash2 } from "lucide-react";

/**
 * Every kind the filter can turn off, the user's own first.
 *
 * These two used to be exempt: they were the spine of the feed, so they were shown whatever the
 * filter said. Which left a filter that could not empty its own view — it read "Tipos (0/8)" and
 * kept showing things. Now off means off, and anyone who wants the prompts back checks two boxes.
 */
const allKinds: MessageKind[] = ["user", "instruction", "text", "tool", "delegation", "result", "error", "system", "note", "stderr"];

export function CommunicationPanel() {
  const t = useT();
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
  
  const [limit, setLimit] = useState(200);

  useEffect(() => {
    setLimit(200);
  }, [currentProjectId, filterAgent, filterKinds]);

  const [stickToBottom, setStickToBottom] = useState(true);
  const [newCount, setNewCount] = useState(0);
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const bottomRef = useRef<HTMLDivElement>(null);
  const prevScrollHeightRef = useRef<number | null>(null);

  const prevMessagesLength = useRef(messages.length);

  // Opening the panel lands on the newest line, the way the conversation does. Without this it
  // opened at the oldest message of the project and you had to scroll a history to see what just
  // happened. A frame later, so the list is laid out and `scrollIntoView` has somewhere to go.
  useEffect(() => {
    setStickToBottom(true);
    const id = requestAnimationFrame(() => bottomRef.current?.scrollIntoView({ block: "end" }));
    return () => cancelAnimationFrame(id);
  }, [currentProjectId]);

  useEffect(() => {
    if (messages.length > prevMessagesLength.current) {
      if (stickToBottom) {
        bottomRef.current?.scrollIntoView();
      } else {
        setNewCount(n => n + (messages.length - prevMessagesLength.current));
      }
    }
    prevMessagesLength.current = messages.length;
  }, [messages.length, stickToBottom]);

  const onScroll = () => {
    if (!scrollContainerRef.current) return;
    const isAtBottom = isNearBottom(scrollContainerRef.current);
    setStickToBottom(isAtBottom);
    if (isAtBottom) {
      setNewCount(0);
    }
  };

  const scrollToBottom = () => {
    setStickToBottom(true);
    setNewCount(0);
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
    if (!filterKinds.has(m.kind)) {
      return false;
    }
    return true;
  });

  const { shown, hidden } = windowOf(filteredMessages, limit);

  const handleShowOlder = () => {
    if (scrollContainerRef.current) {
      prevScrollHeightRef.current = scrollContainerRef.current.scrollHeight;
    }
    setLimit(l => l + 200);
  };

  useLayoutEffect(() => {
    if (prevScrollHeightRef.current !== null && scrollContainerRef.current) {
      const newScrollHeight = scrollContainerRef.current.scrollHeight;
      scrollContainerRef.current.scrollTop += (newScrollHeight - prevScrollHeightRef.current);
      prevScrollHeightRef.current = null;
    }
  }, [shown.length]);

  return (
    <div className="flex flex-col h-full overflow-hidden relative">
      {/*
        `min-w-0` on the row and on the agent select, `shrink-0` on what must keep its size. The
        kinds button is "Tipos" until you deselect one and then "Tipos (7/8)", and a flex item that
        cannot shrink below its content pushed the whole row out of a narrow dock the moment it
        grew.
      */}
      <div className="p-2 border-b border-border flex shrink-0 items-center gap-2 min-w-0">
        <Select value={filterAgent} onValueChange={setFilterAgent}>
          <SelectTrigger className="flex-1 min-w-0 h-8 text-xs">
            <SelectValue placeholder={t("common.all")} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">{t("common.all")}</SelectItem>
            {agents.map(a => (
              <SelectItem key={a.id} value={a.id}>{a.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>

        <DropdownMenu>
          <DropdownMenuTrigger asChild>
            <Button variant="outline" size="sm" className="h-8 shrink-0 whitespace-nowrap text-xs">
              {filterKinds.size === allKinds.length ? t("comm.kinds") : t("comm.kindsSome", { n: filterKinds.size, total: allKinds.length })}
            </Button>
          </DropdownMenuTrigger>
          <DropdownMenuContent align="end">
            {allKinds.map(kind => (
              <DropdownMenuCheckboxItem
                key={kind}
                checked={filterKinds.has(kind)}
                onCheckedChange={() => toggleKind(kind)}
                // Picking one kind is not finishing with the menu: closing after every click made
                // narrowing the feed to two kinds a matter of opening this five times.
                onSelect={e => e.preventDefault()}
              >
                {t(kindLabelKey[kind])}
              </DropdownMenuCheckboxItem>
            ))}
          </DropdownMenuContent>
        </DropdownMenu>

        <Button variant="ghost" size="icon" className="h-8 w-8 shrink-0" onClick={async () => {
          const ok = await confirm({ title: t("comm.clear.title"), description: t("comm.clear.body"), destructive: true, confirmText: t("common.delete") });
          if (ok) clearMessages(currentProjectId || undefined);
        }} title={t("comm.clear")}>
          <Trash2 className="h-4 w-4" />
        </Button>
      </div>

      <div 
        ref={scrollContainerRef}
        onScroll={onScroll}
        className="flex-1 overflow-y-auto"
      >
        {filteredMessages.length === 0 ? (
          // "No activity yet" is a lie when there is plenty and the filter is hiding all of it.
          <EmptyState
            icon={Radio}
            title={messages.length > 0 ? t("comm.emptyFiltered.title") : t("comm.empty.title")}
            description={messages.length > 0 ? t("comm.emptyFiltered.body") : t("comm.empty.body")}
            className="h-full"
          />
        ) : (
          <div className="flex flex-col relative">
            {hidden > 0 && (
              <div className="flex justify-center py-2">
                <Button variant="ghost" size="sm" className="text-xs" onClick={handleShowOlder}>
                  {t("comm.showOlder", { n: hidden })}
                </Button>
              </div>
            )}
            {shown.map(m => (
              <MessageItem key={m.id} message={m} />
            ))}
            <div ref={bottomRef} />
          </div>
        )}
      </div>

      {!stickToBottom && newCount > 0 && (
        <Button
          size="sm"
          className="absolute bottom-4 right-4 rounded-full shadow-md z-10 gap-2"
          onClick={scrollToBottom}
        >
          <ArrowDown className="h-4 w-4" />
          {plural(newCount, t("thread.newMessages.one", { n: newCount }), t("thread.newMessages.other", { n: newCount }))}
        </Button>
      )}
    </div>
  );
}
