import { useEffect, useMemo, useRef, useState } from "react";
import { Bot, FolderOpen, MessageCircle, Settings2, Users } from "lucide-react";
import { useAppStore, selectAllAgents, selectProjectOfAgent } from "@/store";
import type { SettingsSection } from "@/store";
import { Dialog, DialogContent, DialogTitle } from "@/components/ui/dialog";
import { Input } from "@/components/ui/input";
import { useT } from "@/i18n/useT";

/** Mirrors the sections of SettingsDialog (that file is owned by another change, so it is not imported). */
const SETTINGS_SECTIONS: Array<{ id: SettingsSection; labelKey: string }> = [
  { id: "general", labelKey: "settings.section.general" },
  { id: "agents", labelKey: "settings.section.agents" },
  { id: "profile", labelKey: "settings.section.profile" },
  { id: "presets", labelKey: "settings.section.presets" },
  { id: "skills", labelKey: "settings.section.skills" },
  { id: "mcp", labelKey: "settings.section.mcp" },
  { id: "hooks", labelKey: "settings.section.hooks" },
  { id: "context", labelKey: "settings.section.context" },
  { id: "remote", labelKey: "settings.section.remote" },
  { id: "about", labelKey: "settings.section.about" },
];

/** Lowercases and strips accents so "orquestacion" matches "Orquestación". */
function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

type Group = "projects" | "chats" | "agents" | "settings";

const GROUP_LABEL_KEY: Record<Group, string> = {
  projects: "search.group.projects",
  chats: "search.group.chats",
  agents: "search.group.agents",
  settings: "search.group.settings",
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

export function SearchPalette() {
  const t = useT();
  const searchOpen = useAppStore(state => state.searchOpen);
  const toggleSearch = useAppStore(state => state.toggleSearch);
  const projects = useAppStore(state => state.config.projects);
  const chats = useAppStore(state => state.config.chats);
  const agents = useAppStore(selectAllAgents);
  const openProject = useAppStore(state => state.openProject);
  const openSettings = useAppStore(state => state.openSettings);

  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState(0);
  const listRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (searchOpen) {
      setQuery("");
      setSelected(0);
    }
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
    for (const s of SETTINGS_SECTIONS.filter(s => matches(`${t("settings.title")} ${t(s.labelKey)}`))) {
      out.push({
        key: `section:${s.id}`,
        group: "settings",
        label: t(s.labelKey),
        icon: Settings2,
        run: () => openSettings(s.id),
      });
    }

    return out;
  }, [query, projects, chats, agents, openProject, openSettings, t]);

  // The query shrinks the list, so keep the cursor inside it.
  useEffect(() => {
    setSelected(s => (s >= results.length ? 0 : s));
  }, [results.length]);

  useEffect(() => {
    const el = listRef.current?.querySelector<HTMLElement>('[data-selected="true"]');
    el?.scrollIntoView({ block: "nearest" });
  }, [selected, results]);

  const choose = (result: Result | undefined) => {
    if (!result) return;
    toggleSearch(false);
    result.run();
  };

  const onKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === "ArrowDown") {
      e.preventDefault();
      setSelected(s => (results.length === 0 ? 0 : (s + 1) % results.length));
    } else if (e.key === "ArrowUp") {
      e.preventDefault();
      setSelected(s => (results.length === 0 ? 0 : (s - 1 + results.length) % results.length));
    } else if (e.key === "Enter") {
      e.preventDefault();
      choose(results[selected]);
    }
  };

  let lastGroup: Group | null = null;

  return (
    <Dialog open={searchOpen} onOpenChange={toggleSearch}>
      <DialogContent
        showCloseButton={false}
        className="top-[15%] translate-y-0 gap-0 p-0 overflow-hidden sm:max-w-xl"
        onKeyDown={onKeyDown}
      >
        <DialogTitle className="sr-only">{t("common.search")}</DialogTitle>
        <div className="border-b border-border p-2">
          <Input
            autoFocus
            value={query}
            onChange={e => setQuery(e.target.value)}
            placeholder={t("search.placeholder")}
            className="border-0 shadow-none focus-visible:ring-0 dark:bg-transparent"
          />
        </div>

        <div ref={listRef} className="max-h-[50vh] overflow-y-auto p-2">
          {results.length === 0 && (
            <div className="py-8 text-center text-sm text-muted-foreground">
              {t("search.noResults", { query: query.trim() })}
            </div>
          )}
          {results.map((r, i) => {
            const header = r.group !== lastGroup ? r.group : null;
            lastGroup = r.group;
            const Icon = r.icon;
            return (
              <div key={r.key}>
                {header && (
                  <div className="px-2 pt-2 pb-1 text-[10px] font-semibold uppercase tracking-wide text-muted-foreground">
                    {t(GROUP_LABEL_KEY[header])}
                  </div>
                )}
                <button
                  type="button"
                  data-selected={i === selected}
                  className={`flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-left text-sm ${
                    i === selected ? "bg-accent text-accent-foreground" : "hover:bg-accent/60"
                  }`}
                  onMouseEnter={() => setSelected(i)}
                  onClick={() => choose(r)}
                >
                  <Icon className="h-4 w-4 shrink-0 text-muted-foreground" />
                  <span className="truncate">{r.label}</span>
                  {r.hint && <span className="ml-auto truncate text-xs text-muted-foreground">{r.hint}</span>}
                </button>
              </div>
            );
          })}
        </div>
      </DialogContent>
    </Dialog>
  );
}
