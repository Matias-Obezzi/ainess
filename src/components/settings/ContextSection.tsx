// Notes handed to every agent of one project.
//
// This used to edit a single string shared by every project, which is how an agent came to know
// about a repo nobody had told it about in this conversation. It edits one project at a time now,
// and says whose notes are on screen — see migration 13 in the store.
import { useEffect, useState, createContext, useContext, type ReactNode } from "react";
import { useAppStore } from "@/store";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Label } from "@/components/ui/label";
import { EmptyState } from "@/components/ui/empty-state";
import { toast } from "@/components/ui/toast";
import { useT } from "@/i18n/useT";
import { FolderOpen } from "lucide-react";

interface ContextCtxValue {
  projectId: string;
  setProjectId(id: string): void;
  draft: string;
  setDraft(v: string): void;
  dirty: boolean;
  save(): void;
}

const ContextCtx = createContext<ContextCtxValue | null>(null);

/** Shares the staged shared-context draft between the header's "Guardar" action and the textarea. */
export function ContextSectionProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const projects = useAppStore(state => state.config.projects);
  const currentProjectId = useAppStore(state => state.currentProjectId);
  const setSharedContext = useAppStore(state => state.setSharedContext);

  // Opens on the project you were in, so the common case needs no picking at all.
  const [projectId, setProjectId] = useState(
    () => (currentProjectId && projects.some(p => p.id === currentProjectId) ? currentProjectId : projects[0]?.id ?? ""),
  );
  const saved = projects.find(p => p.id === projectId)?.sharedContext ?? "";
  const [draft, setDraft] = useState(saved);

  // Following the saved value covers both switching projects and someone else (the CLI, the phone)
  // writing it while this screen is open. An unsaved draft loses to that on purpose: what is on
  // disk is what the agents are actually being told.
  useEffect(() => setDraft(saved), [saved, projectId]);

  const dirty = draft !== saved;
  const save = () => {
    if (!projectId) return;
    setSharedContext(projectId, draft);
    toast.success(t("context.saved"));
  };

  return (
    <ContextCtx.Provider value={{ projectId, setProjectId, draft, setDraft, dirty, save }}>
      {children}
    </ContextCtx.Provider>
  );
}

function useContextCtx(): ContextCtxValue {
  const ctx = useContext(ContextCtx);
  if (!ctx) throw new Error("useContextCtx must be used within ContextSectionProvider");
  return ctx;
}

export function ContextSectionActions() {
  const t = useT();
  const { dirty, save } = useContextCtx();
  return <Button size="sm" onClick={save} disabled={!dirty}>{t("common.save")}</Button>;
}

export function ContextSection() {
  const t = useT();
  const projects = useAppStore(state => state.config.projects);
  const { projectId, setProjectId, draft, setDraft } = useContextCtx();

  if (projects.length === 0) {
    return (
      <EmptyState
        icon={FolderOpen}
        title={t("context.noProjects.title")}
        description={t("context.noProjects.body")}
      />
    );
  }

  return (
    <div className="flex h-full flex-col">
      <p className="mb-3 text-sm text-muted-foreground">{t("context.intro")}</p>

      <div className="mb-3 space-y-1.5">
        <Label className="text-xs">{t("context.project")}</Label>
        <Select value={projectId} onValueChange={setProjectId}>
          <SelectTrigger className="w-full max-w-xs">
            <SelectValue />
          </SelectTrigger>
          <SelectContent>
            {projects.map(p => (
              <SelectItem key={p.id} value={p.id}>{p.name}</SelectItem>
            ))}
          </SelectContent>
        </Select>
      </div>

      <Textarea
        className="min-h-64 flex-1 resize-none font-mono"
        value={draft}
        onChange={(e) => setDraft(e.target.value)}
      />
    </div>
  );
}
