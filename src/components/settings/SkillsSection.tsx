import { useAppStore, selectAllAgents } from "@/store";
import { confirmDelete } from "@/lib/confirm";
import { useEffect, useMemo, useState, useSyncExternalStore, type ReactNode } from "react";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { DropdownMenu, DropdownMenuTrigger, DropdownMenuContent, DropdownMenuItem } from "@/components/ui/dropdown-menu";
import { toast } from "@/components/ui/toast";
import { SkillDialog } from "@/components/SkillDialog";
import { SuggestedDialog } from "@/components/settings/SuggestedDialog";
import { Skill } from "@/types";
import { Check, MoreHorizontal, Sparkles } from "lucide-react";
import { createDialogContext, createToggleContext } from "@/components/settings/section-context";
import { useT } from "@/i18n/useT";
import { plural } from "@/i18n";
import { getTransport } from "@/lib/transport";
import { pickPath } from "@/lib/pick-dir";
import { revealPath } from "@/lib/open-external";
import {
  SKILL_TARGETS, detectSkills, nativeSkillsResults, parseSkillMd, skillFromDetected, skillKnown,
  subscribeNativeSkills, syncNativeSkills, type DetectedSkill,
} from "@/lib/skills-native";

const SkillDialogCtx = createDialogContext<Skill>();
const SuggestedCtx = createToggleContext();
const ImportCtx = createToggleContext();

export function SkillsSectionProvider({ children }: { children: ReactNode }) {
  return (
    <SkillDialogCtx.Provider>
      <SuggestedCtx.Provider>
        <ImportCtx.Provider>{children}</ImportCtx.Provider>
      </SuggestedCtx.Provider>
    </SkillDialogCtx.Provider>
  );
}

const sepOf = (p: string) => (p.includes("\\") ? "\\" : "/");

/** Adds a skill from a folder on disk that holds a SKILL.md. False when it is not one. */
async function addFolderSkill(dir: string, managed: boolean): Promise<string | null> {
  const text = await getTransport().readFileAbs(`${dir}${sepOf(dir)}SKILL.md`).catch(() => null);
  const parsed = text ? parseSkillMd(text) : null;
  if (!parsed) return null;
  useAppStore.getState().upsertSkill({
    id: crypto.randomUUID(),
    name: parsed.name,
    ...(parsed.description ? { description: parsed.description } : {}),
    content: parsed.body,
    enabledFor: "all",
    dir,
    source: "upload",
    ...(managed ? { managed: true } : {}),
  });
  return parsed.name;
}

export function SkillsSectionActions() {
  const t = useT();
  const { openCreate } = SkillDialogCtx.useDialogState();
  const { show } = SuggestedCtx.useToggleState();
  const { show: showImport } = ImportCtx.useToggleState();

  const uploadZip = async () => {
    const path = await pickPath({ extensions: ["zip", "skill"], label: t("skills.upload.zipKind") });
    if (!path) return;
    const stem = path.split(/[\\/]/).pop()!.replace(/\.(zip|skill)$/i, "");
    try {
      const dir = await getTransport().unpackSkill(path, stem);
      const name = dir ? await addFolderSkill(dir, true) : null;
      if (!dir || !name) { if (dir) await getTransport().removeSkillDir(dir).catch(() => {}); toast.error(t("skills.upload.invalid")); return; }
      toast.success(t("skills.upload.added", { name }));
    } catch (e) {
      toast.error(t("skills.upload.failed", { error: e instanceof Error ? e.message : String(e) }));
    }
  };

  const uploadFolder = async () => {
    const dir = await pickPath({ directory: true });
    if (!dir) return;
    const name = await addFolderSkill(dir, false);
    if (!name) toast.error(t("skills.upload.invalid"));
    else toast.success(t("skills.upload.added", { name }));
  };

  const sync = async () => {
    const failed = Object.values(await syncNativeSkills()).filter(r => r.status === "error").length;
    if (failed) toast.error(t("mcpNative.syncFailed", { n: failed }));
    else toast.success(t("mcpNative.syncDone"));
  };

  return (
    <div className="flex gap-2">
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button size="sm" variant="outline" aria-label={t("skills.more")}><MoreHorizontal className="size-4" /></Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem onSelect={showImport}>{t("mcpImport.menu")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void uploadZip()}>{t("skills.upload.zip")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void uploadFolder()}>{t("skills.upload.folder")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={show}>{t("suggested.button")}</DropdownMenuItem>
          <DropdownMenuItem onSelect={() => void sync()}>{t("mcpNative.syncNow")}</DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <Button size="sm" onClick={openCreate}>{t("skills.new")}</Button>
    </div>
  );
}

/** Picks, out of the skills the user's tools already have, which ainess should have too. */
function ImportSkillsDialog({ open, onOpenChange, detected }: { open: boolean; onOpenChange: (o: boolean) => void; detected: DetectedSkill[] | null }) {
  const t = useT();
  const skills = useAppStore(state => state.config.skills);
  const upsertSkill = useAppStore(state => state.upsertSkill);
  const fresh = useMemo(() => new Set((detected ?? []).filter(d => !skillKnown(skills, d.name)).map(d => d.name)), [detected, skills]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  useEffect(() => { if (open) setSelected(fresh); }, [open, fresh]);

  const toggle = (name: string) => setSelected(prev => {
    const next = new Set(prev);
    if (next.has(name)) next.delete(name); else next.add(name);
    return next;
  });
  const handleImport = () => {
    const chosen = (detected ?? []).filter(d => selected.has(d.name));
    for (const d of chosen) upsertSkill(skillFromDetected(d));
    if (chosen.length) toast.success(plural(chosen.length, t("skillsImport.imported.one", { n: chosen.length }), t("skillsImport.imported.other", { n: chosen.length })));
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] max-w-2xl flex-col">
        <DialogHeader>
          <DialogTitle>{t("skillsImport.title")}</DialogTitle>
          <DialogDescription>{t("skillsImport.description")}</DialogDescription>
        </DialogHeader>
        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4">
          {detected === null ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("mcpImport.loading")}</p>
          ) : detected.length === 0 ? (
            <p className="py-6 text-center text-sm text-muted-foreground">{t("skillsImport.none")}</p>
          ) : (
            <div className="flex flex-col gap-2 py-2">
              {detected.map(d => {
                const already = skillKnown(skills, d.name);
                const isSelected = selected.has(d.name);
                return (
                  <button
                    key={d.name}
                    type="button"
                    disabled={already}
                    onClick={() => toggle(d.name)}
                    className={`flex flex-col gap-1 rounded-md border p-3 text-left transition-colors disabled:cursor-not-allowed disabled:opacity-60 ${isSelected ? "border-primary bg-primary/5" : "border-border hover:bg-accent/40"}`}
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      <div className={`flex size-4 shrink-0 items-center justify-center rounded border ${isSelected ? "border-primary bg-primary text-primary-foreground" : "border-input"}`}>
                        {isSelected && <Check className="size-3" />}
                      </div>
                      <span className="text-sm font-semibold">{d.name}</span>
                      {d.sources.map(s => <Badge key={s} variant="outline" className="text-[10px]">{t(`skills.source.${s}`)}</Badge>)}
                      {already && <Badge variant="secondary" className="text-[10px]">{t("mcpImport.already")}</Badge>}
                    </div>
                    {d.description && <p className="line-clamp-2 pl-6 text-xs text-muted-foreground">{d.description}</p>}
                  </button>
                );
              })}
            </div>
          )}
        </div>
        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={handleImport} disabled={selected.size === 0}>{t("mcpImport.import", { n: selected.size })}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

export function SkillsSection() {
  const t = useT();
  const config = useAppStore(state => state.config);
  const agents = useAppStore(selectAllAgents);
  const removeSkill = useAppStore(state => state.removeSkill);
  const updateConfig = useAppStore(state => state.updateConfig);
  const { open, editing, openEdit, close } = SkillDialogCtx.useDialogState();
  const { open: suggestedOpen, hide: hideSuggested, show: showSuggested } = SuggestedCtx.useToggleState();
  const { open: importOpen, hide: hideImport, show: showImport } = ImportCtx.useToggleState();

  const [detected, setDetected] = useState<DetectedSkill[] | null>(null);
  useEffect(() => {
    let live = true;
    void detectSkills().then(found => { if (live) setDetected(found); }).catch(() => { if (live) setDetected([]); });
    return () => { live = false; };
  }, []);
  const fresh = (detected ?? []).filter(d => !skillKnown(config.skills, d.name)).length;
  const results = useSyncExternalStore(subscribeNativeSkills, nativeSkillsResults);
  const syncing = config.skillsNativeSync !== false;

  const remove = async (skill: Skill) => {
    if (!(await confirmDelete(t("skills.delete"), skill.name))) return;
    removeSkill(skill.id);
    // Only a folder ainess unpacked itself; one it was pointed at is the user's.
    if (skill.managed && skill.dir) await getTransport().removeSkillDir(skill.dir).catch(() => {});
  };

  const banner = fresh > 0 && (
    <div className="flex flex-wrap items-center justify-between gap-2 rounded-md border border-primary/30 bg-primary/5 px-3 py-2">
      <span className="text-sm">{plural(fresh, t("skillsImport.banner.one", { n: fresh }), t("skillsImport.banner.other", { n: fresh }))}</span>
      <Button size="sm" variant="outline" onClick={showImport}>{t("mcpImport.bannerAction")}</Button>
    </div>
  );

  const native = (
    <div className="flex flex-col gap-2 rounded-md border px-3 py-2">
      <div className="flex items-center gap-2">
        <Switch checked={syncing} onCheckedChange={checked => updateConfig({ skillsNativeSync: checked })} />
        <div className="flex flex-col">
          <span className="text-sm font-semibold">{t("mcpNative.toggle")}</span>
          <span className="text-xs text-muted-foreground">{t("skillsNative.hint")}</span>
        </div>
      </div>
      {syncing && (
        <ul className="flex flex-col gap-0.5 pl-11 text-xs text-muted-foreground">
          {SKILL_TARGETS.filter(({ target }) => results[target] && results[target]!.status !== "not-installed").map(({ target }) => {
            const r = results[target]!;
            return (
              <li key={target} className={r.status === "error" ? "text-amber-600 dark:text-amber-400" : undefined}>
                <span className="font-medium">{t(`skillsNative.target.${target}`)}</span>
                {" — "}
                {r.status === "error" ? t("mcpNative.status.error", { error: r.error ?? "" }) : t("mcpNative.status.synced")}
                {r.skipped.length > 0 && ` ${t("mcpNative.status.skipped", { names: r.skipped.join(", ") })}`}
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );

  const dialogs = (
    <>
      <SkillDialog open={open} onOpenChange={(o) => !o && close()} skill={editing} />
      <SuggestedDialog kind="skill" open={suggestedOpen} onOpenChange={(o) => (o ? showSuggested() : hideSuggested())} />
      <ImportSkillsDialog open={importOpen} onOpenChange={(o) => (o ? showImport() : hideImport())} detected={detected} />
    </>
  );

  if (config.skills.length === 0) {
    return (
      <>
        {banner}
        {native}
        <EmptyState
          icon={Sparkles}
          title={t("skills.empty.title")}
          description={t("skills.empty.body")}
          action={{ label: t("skills.empty.action"), onClick: showSuggested }}
        />
        {dialogs}
      </>
    );
  }

  return (
    <div className="space-y-4">
      {banner}
      {native}
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {config.skills.map(skill => (
          <Card key={skill.id}>
            <CardHeader>
              <CardTitle className="flex flex-wrap items-center gap-2">
                {skill.name}
                {skill.source && <Badge variant="outline" className="text-[10px]">{t(`skills.source.${skill.source}`)}</Badge>}
              </CardTitle>
              {skill.description && <CardDescription className="line-clamp-3">{skill.description}</CardDescription>}
            </CardHeader>
            <CardContent>
              <div className="flex flex-wrap gap-1">
                {skill.enabledFor === "all" ? (
                  <Badge variant="secondary">{t("common.all")}</Badge>
                ) : (
                  skill.enabledFor.map(id => {
                    const agent = agents.find(a => a.id === id);
                    return <Badge key={id} variant="outline">{agent?.name || id}</Badge>;
                  })
                )}
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-2">
              {/* A folder skill is edited where it lives; ainess shows it, the text one it edits. */}
              {skill.dir
                ? <Button variant="outline" size="sm" onClick={() => void revealPath(skill.dir!)}>{t("skills.openFolder")}</Button>
                : <Button variant="outline" size="sm" onClick={() => openEdit(skill)}>{t("common.edit")}</Button>}
              <Button variant="destructive" size="sm" onClick={() => void remove(skill)}>{t("common.delete")}</Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      {dialogs}
    </div>
  );
}
