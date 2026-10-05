import { useEffect, useMemo, useState } from "react";
import { Bot, FolderOpen, Keyboard, ListTodo, MessageCircle, Plus, Settings2, Users } from "lucide-react";
import { useAppStore, selectAllAgents, selectProjectOfAgent, selectTasks } from "@/store";
import { CommandDialog, CommandEmpty, CommandGroup, CommandInput, CommandItem, CommandList } from "@/components/ui/command";
import { useT } from "@/i18n/useT";
// Single source of truth for section metadata — no component imports, bundle-safe.
import { SETTINGS_SECTIONS_META } from "@/components/settings/sections";
import { normalize, searchMessages } from "@/lib/message-search";

type Group = "projects" | "tasks" | "chats" | "agents" | "settings" | "actions" | "messages";

const GROUP_LABEL_KEY: Record<Group, string> = {
  projects: "search.group.projects",
  tasks: "search.group.tasks",
  chats: "search.group.chats",
  agents: "search.group.agents",
  settings: "search.group.settings",
  actions: "search.group.actions",
  messages: "search.group.messages",
};

interface Result {
  key: string;
  group: Group;
  label: string;
  hint?: string;
  icon: typeof Bot;
  run(): void;
}

/** Per group cap, so an empty query still shows a useful preview instead of everything. */
const PER_GROUP = 8;

/** Searching inside the conversations shows nothing else, so the eight-per-group cap is wasted. */
const MESSAGES_ONLY = 40;

/** Lands on the project's board with one task's detail open. */
function openTaskOnBoard(projectId: string, taskId: string): void {
  const state = useAppStore.getState();
  state.openProject(projectId, null);
  state.setProjectMode("tasks");
  state.focusTask(taskId);
}

/** Lands on the project with chat mode active. */
function openProjectFeed(projectId: string): void {
  const state = useAppStore.getState();
  state.openProject(projectId, null);
  state.setProjectMode("chat");
}

export function SearchPalette() {
  const t = useT();
  const searchOpen = useAppStore(state => state.searchOpen);
  const searchInitialGroup = useAppStore(state => state.searchInitialGroup);
  const toggleSearch = useAppStore(state => state.toggleSearch);
  const projects = useAppStore(state => state.config.projects);
  const chats = useAppStore(state => state.config.chats);
  const agents = useAppStore(selectAllAgents);
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const tasks = useAppStore(state => selectTasks(state, state.currentProjectId));
  const openProject = useAppStore(state => state.openProject);
  const openSettings = useAppStore(state => state.openSettings);
  const addTask = useAppStore(state => state.addTask);
  const focusTask = useAppStore(state => state.focusTask);
  const focusMessage = useAppStore(state => state.focusMessage);
  const toggleShortcuts = useAppStore(state => state.toggleShortcuts);

  /** Ctrl+F opens the palette on the conversations alone: only messages, and more of them. */
  const messagesOnly = searchInitialGroup === "messages";

  const [query, setQuery] = useState("");

  useEffect(() => {
    if (searchOpen) setQuery("");
  }, [searchOpen]);

  const results = useMemo<Result[]>(() => {
    const q = normalize(query.trim());
    const matches = (text: string) => q === "" || normalize(text).includes(q);
    const out: Result[] = [];

    for (const p of projects.filter(p => matches(p.name) || matches(p.workspaceDir)).slice(0, PER_GROUP)) {
      out.push({
        key: `project:${p.id}`,
        group: "projects",
        label: p.name,
        hint: p.workspaceDir,
        icon: FolderOpen,
        run: () => openProject(p.id, null),
      });
    }

    // Only the current project's board: a task title says nothing about which project it is in.
    const liveTasks = tasks.filter(t => !t.archived);
    for (const task of liveTasks.filter(t => matches(t.title)).slice(0, PER_GROUP)) {
      out.push({
        key: `task:${task.id}`,
        group: "tasks",
        label: task.title,
        icon: ListTodo,
        run: () => openTaskOnBoard(task.projectId, task.id),
      });
    }

    for (const c of chats.filter(c => matches(c.name)).slice(0, PER_GROUP)) {
      const project = projects.find(p => p.id === c.projectId);
      out.push({
        key: `chat:${c.id}`,
        group: "chats",
        label: c.name,
        hint: project?.name,
        icon: c.mode === "shared" ? Users : MessageCircle,
        run: () => openProject(c.projectId, c.id),
      });
    }

    for (const a of agents.filter(a => matches(a.name) || matches(a.provider)).slice(0, PER_GROUP)) {
      const project = projects.find(p => (p.agents ?? []).some(x => x.id === a.id));
      out.push({
        key: `agent:${a.id}`,
        group: "agents",
        label: a.name,
        hint: project ? `${project.name} · ${a.provider}` : a.provider,
        icon: Bot,
        // The team lives in the project's hierarchy board, so that is where an agent opens.
        run: () => {
          const target = project ?? selectProjectOfAgent(useAppStore.getState(), a.id);
          if (!target) return;
          openProject(target.id, null);
          useAppStore.getState().setProjectMode("graph");
        },
      });
    }

    // "conf" should also find every settings section, not only its own label.
    for (const s of SETTINGS_SECTIONS_META.filter(s => matches(`${t("settings.title")} ${t(s.labelKey)}`))) {
      out.push({
        key: `section:${s.id}`,
        group: "settings",
        label: t(s.labelKey),
        icon: Settings2,
        run: () => openSettings(s.id),
      });
    }

    const typed = query.trim();
    // Offering to create what already exists would only duplicate a card.
    const exact = liveTasks.some(task => normalize(task.title) === normalize(typed));
    if (typed !== "" && currentProjectId && !exact) {
      out.push({
        key: "action:new-task",
        group: "actions",
        label: t("search.action.createTask", { query: typed }),
        icon: Plus,
        run: () => {
          const task = addTask(currentProjectId, { title: typed, status: "backlog" });
          openTaskOnBoard(currentProjectId, task.id);
        },
      });
    }

    if (matches(t("search.action.shortcuts"))) {
      out.push({
        key: "action:shortcuts",
        group: "actions",
        label: t("search.action.shortcuts"),
        icon: Keyboard,
        run: () => toggleShortcuts(true),
      });
    }

    // Read rather than subscribe: the feed is rewritten every time a token arrives, and a palette
    // that is not on screen has no business re-rendering — let alone re-searching — eighty times a
    // second while an agent talks. A snapshot taken as you type is what you are looking at anyway.
    const feed = searchOpen ? useAppStore.getState() : undefined;
    const chatSources = feed ? chats.map(c => ({ id: c.id, messages: feed.chatMessages[c.id] ?? [] })) : [];
    const messageHits = feed
      ? searchMessages(query, { messages: feed.messages, chats: chatSources }, messagesOnly ? MESSAGES_ONLY : PER_GROUP)
      : [];
    for (const hit of messageHits) {
      const who = hit.from === "user" ? t("common.you") : (agents.find(a => a.id === hit.from)?.name ?? hit.from);
      const source = hit.source;
      let where = "";
      if (source.kind === "chat") {
        const chat = chats.find(c => c.id === source.chatId);
        where = chat?.name ?? "";
      } else {
        const project = projects.find(p => p.id === source.projectId);
        where = project?.name ?? "";
      }
      const hint = where ? `${who} · ${where}` : who;

      out.push({
        key: `message:${source.kind}:${hit.id}`,
        group: "messages",
        label: hit.excerpt,
        hint,
        icon: MessageCircle,
        // The thread is asked for the message before it is opened, so that it mounts already
        // knowing which one to scroll to. The project feed draws runs and not single messages,
        // so there the run that produced it is what can actually be reached.
        run: () => {
          if (source.kind === "chat") {
            focusMessage(hit.id);
            const chat = chats.find(c => c.id === source.chatId);
            if (chat) {
              openProject(chat.projectId, chat.id);
              useAppStore.getState().setProjectMode("chat");
            }
          } else {
            focusMessage(source.runId ?? hit.id);
            openProjectFeed(source.projectId);
          }
        },
      });
    }

    // Ctrl+F is "search in the conversations": the projects and the settings are not an answer to it.
    return messagesOnly ? out.filter(r => r.group === "messages") : out;
  }, [query, projects, chats, agents, tasks, currentProjectId, searchOpen, messagesOnly, openProject, openSettings, addTask, focusTask, focusMessage, toggleShortcuts, t]);

  const choose = (result: Result | undefined) => {
    if (!result) return;
    toggleSearch(false);
    result.run();
  };

  // Groups in the order their first result came, each keeping its results in order.
  const groups = new Map<Group, Result[]>();
  for (const r of results) groups.set(r.group, [...(groups.get(r.group) ?? []), r]);

  return (
    // The results are already filtered (accent-blind, capped per group, messages searched apart),
    // so the command menu only draws them and moves the cursor.
    <CommandDialog
      open={searchOpen}
      onOpenChange={toggleSearch}
      title={t("common.search")}
      description={messagesOnly ? t("search.placeholderMessages") : t("search.placeholder")}
      contentClassName="sm:max-w-xl"
      shouldFilter={false}
      value={query}
      onValueChange={setQuery}
    >
      <CommandInput autoFocus placeholder={messagesOnly ? t("search.placeholderMessages") : t("search.placeholder")} />
      <CommandList className="max-h-[50vh] p-2">
        <CommandEmpty>
          {messagesOnly ? t("search.noMessages", { query: query.trim() }) : t("search.noResults", { query: query.trim() })}
        </CommandEmpty>
        {[...groups].map(([group, items]) => (
          <CommandGroup key={group} heading={t(GROUP_LABEL_KEY[group])} className="p-0">
            {items.map(r => {
              const Icon = r.icon;
              return (
                <CommandItem key={r.key} value={r.key} onSelect={() => choose(r)}>
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{r.label}</span>
                  {r.hint && <span className="ml-auto truncate text-xs text-muted-foreground">{r.hint}</span>}
                </CommandItem>
              );
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
}
