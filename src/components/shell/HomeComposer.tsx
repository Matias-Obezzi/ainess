// Saying what you want done, from the first screen.
//
// Everything the app can do lived inside a project, and a project was a dialog: name it, pick a
// folder, assemble a team, save, open it, find the box. Six steps before the first word. Here the
// prompt is the box and the other two are fields beside it — pick a folder, pick one of your teams,
// type, send. If that folder is already a project the prompt simply goes there, team and all: two
// projects on one workspace would be two sets of agents editing the same files without knowing it.
//
// What it will not do is invent a team. `lib/home-start` decides which of the three is missing;
// with none of them saved yet this points at where teams are made instead of pretending.
import { useMemo, useState } from "react";
import { CornerDownLeft, FolderOpen, Users } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useAppStore } from "@/store";
import { pickWorkspaceDir } from "@/lib/pick-dir";
import { plannerOf, projectForDir, startBlockers, startTarget } from "@/lib/home-start";
import { shortenPath } from "@/lib/format";
import { useT } from "@/i18n/useT";
import { toast } from "@/components/ui/toast";
import { cn } from "@/lib/utils";

export function HomeComposer() {
  const t = useT();
  const projects = useAppStore(state => state.config.projects);
  const formations = useAppStore(state => state.config.formations);
  const defaultFormationId = useAppStore(state => state.config.defaultFormationId);
  const addProject = useAppStore(state => state.addProject);
  const openProject = useAppStore(state => state.openProject);
  const submitPrompt = useAppStore(state => state.submitPrompt);
  const openSettings = useAppStore(state => state.openSettings);
  // The box is drawn before the config comes off disk, so that it works on an install with nothing
  // in it. Until it does, `formations` is empty for a reason that is not "you have no teams".
  const loaded = useAppStore(state => state.loaded);

  const [prompt, setPrompt] = useState("");
  const [workspaceDir, setWorkspaceDir] = useState("");
  const [sending, setSending] = useState(false);

  // Derived, not initial state: `useState(defaultFormationId)` reads it once, on the first render,
  // and this box is drawn before the config is off disk — so the default team arrived a moment too
  // late and the field sat empty for somebody who has one. A pick of your own wins over it.
  const [pickedFormationId, setPickedFormationId] = useState<string | null>(null);
  const formationId = pickedFormationId ?? defaultFormationId;

  // The folder decides everything else: an existing one brings its own team, so the team field is
  // not a choice to make but a fact to report.
  const existing = useMemo(() => projectForDir(projects, workspaceDir), [projects, workspaceDir]);
  const blockers = useMemo(
    () => startBlockers({ prompt, workspaceDir, formationId, formations, projects }),
    [prompt, workspaceDir, formationId, formations, projects],
  );

  // Only once there is something to be sure about: telling somebody who has three teams that they
  // have never made one, for the second it takes to read the file, is worse than saying nothing.
  const noTeams = loaded && blockers.includes("formations");
  const ready = loaded && blockers.length === 0 && !sending;

  const chooseDir = async () => {
    const dir = await pickWorkspaceDir();
    if (dir) setWorkspaceDir(dir);
  };

  const send = async () => {
    if (!ready) return;
    const target = startTarget({ workspaceDir, formationId, formations, projects });
    if (!target) return;

    setSending(true);
    try {
      let projectId: string;
      if (target.kind === "existing") {
        projectId = target.project.id;
      } else {
        addProject({ name: target.name, workspaceDir: target.workspaceDir }, { formationId: target.formation.id });
        // `addProject` does not hand the project back, and the folder is what makes it unique.
        const made = projectForDir(useAppStore.getState().config.projects, target.workspaceDir);
        if (!made) {
          toast.error(t("home.start.failed"));
          return;
        }
        projectId = made.id;
      }

      const agents = useAppStore.getState().config.projects.find(p => p.id === projectId)?.agents ?? [];
      const planner = plannerOf(agents);
      if (!planner) {
        // A project whose team has no root: nothing to address, and picking any agent at random is
        // worse than saying so.
        openProject(projectId, null);
        toast.error(t("home.start.noAgent"));
        return;
      }

      // Straight to the orchestrator thread, where the answer is going to appear.
      openProject(projectId, null, "chat");
      await submitPrompt(prompt, planner.id, projectId);
      setPrompt("");
    } finally {
      setSending(false);
    }
  };

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-4">
      <Textarea
        value={prompt}
        onChange={e => setPrompt(e.target.value)}
        onKeyDown={e => {
          // Enter sends, Shift+Enter writes a line: the same bargain as the project composer.
          if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) {
            e.preventDefault();
            void send();
          }
        }}
        placeholder={t("home.start.placeholder")}
        // `dark:bg-transparent` is not redundant: the base textarea fills itself with
        // `dark:bg-input/30`, and a plain `bg-transparent` loses to a dark variant in the cascade.
        // Without it the box draws its own grey rectangle inside this card, two boxes deep.
        className="min-h-[84px] resize-none border-0 bg-transparent p-0 text-base shadow-none focus-visible:ring-0 dark:bg-transparent"
      />

      <div className="flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="h-8 max-w-[18rem] gap-1.5 text-xs"
          onClick={() => void chooseDir()}
          title={workspaceDir || t("home.start.pickFolder")}
        >
          <FolderOpen className="h-3.5 w-3.5 shrink-0" />
          <span className="truncate">{workspaceDir ? shortenPath(workspaceDir, 34) : t("home.start.pickFolder")}</span>
        </Button>

        {/* An existing folder states its team; a new one asks for one. The same slot either way, so
            the row does not jump when a folder turns out to be a project already. */}
        {existing ? (
          <span className="flex h-8 items-center gap-1.5 rounded-md border border-dashed border-border px-2.5 text-xs text-muted-foreground">
            <Users className="h-3.5 w-3.5 shrink-0" />
            {t("home.start.existing", { name: existing.name })}
          </span>
        ) : (
          <Select
            value={formationId ?? ""}
            onValueChange={value => setPickedFormationId(value || null)}
            disabled={noTeams}
          >
            <SelectTrigger className="h-8 w-[13rem] text-xs">
              <SelectValue placeholder={t("home.start.pickTeam")} />
            </SelectTrigger>
            <SelectContent>
              {formations.map(f => (
                <SelectItem key={f.id} value={f.id}>{f.name}</SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}

        <Button
          type="button"
          size="sm"
          className="ml-auto h-8 gap-1.5"
          disabled={!ready}
          onClick={() => void send()}
        >
          {t("home.start.send")}
          <CornerDownLeft className="h-3.5 w-3.5" />
        </Button>
      </div>

      {/* One line, about the first thing that is missing. Listing all three at once reads as a form
          you failed rather than a next step. */}
      {loaded && blockers.length > 0 && (
        <p className={cn("text-xs", noTeams ? "text-amber-600 dark:text-amber-400" : "text-muted-foreground")}>
          {t(`home.start.need.${blockers[0]}`)}
          {noTeams && (
            <Button
              type="button"
              variant="link"
              className="ml-1 h-auto p-0 text-xs"
              onClick={() => openSettings("agents")}
            >
              {t("home.start.createTeam")}
            </Button>
          )}
        </p>
      )}
    </div>
  );
}
