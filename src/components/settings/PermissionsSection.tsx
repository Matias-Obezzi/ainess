// What planners may do on their own: groups of commands, and the user's own patterns to allow or
// to block. Saved as it is changed; the next call a planner makes is decided by it.
import { useEffect, useState } from "react";
import { useAppStore } from "@/store";
import { useT } from "@/i18n/useT";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PLANNER_PRESETS, type PlannerPermissions } from "@/lib/planner-permissions";
import { isRemoteBuild } from "@/lib/platform";
import { RemoteLockedHint } from "@/components/RemoteLockedHint";
import { toast } from "@/components/ui/toast";

const lines = (text: string) => text.split("\n").map(l => l.trim()).filter(Boolean);

export function PermissionsSection() {
  const t = useT();
  const perms = useAppStore(state => state.config.plannerPermissions);
  const updateConfig = useAppStore(state => state.updateConfig);
  const save = (patch: PlannerPermissions) => updateConfig({ plannerPermissions: { ...perms, ...patch } });
  // From the remote page these only tighten (see remote-settings.ts): a group goes off, an allowed
  // pattern goes, a blocked one comes in. The rest is the desktop app's.
  const remote = isRemoteBuild();

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{t("permissions.intro")}</p>
      <RemoteLockedHint restrict />

      <div className="flex flex-col gap-3">
        {PLANNER_PRESETS.map(preset => (
          <label key={preset.id} className="flex items-start gap-3">
            <Switch
              className="mt-0.5"
              checked={perms?.presets?.[preset.id] ?? preset.on}
              disabled={remote && !(perms?.presets?.[preset.id] ?? preset.on)}
              onCheckedChange={on => save({ presets: { ...perms?.presets, [preset.id]: on } })}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{t(`permissions.preset.${preset.id}`)}</span>
              <span className="block text-xs text-muted-foreground">{t(`permissions.preset.${preset.id}.hint`)}</span>
            </span>
          </label>
        ))}
      </div>

      <PatternList label={t("permissions.allow")} hint={t("permissions.allowHint")} value={perms?.allow ?? []} onSave={allow => save({ allow })} only={remote ? "remove" : undefined} />
      <PatternList label={t("permissions.deny")} hint={t("permissions.denyHint")} value={perms?.deny ?? []} onSave={deny => save({ deny })} only={remote ? "add" : undefined} />
    </div>
  );
}

/** `only`: what the list may do from the remote page; a draft that does more goes back as it was. */
function PatternList({ label, hint, value, onSave, only }: { label: string; hint: string; value: string[]; onSave: (v: string[]) => void; only?: "add" | "remove" }) {
  const t = useT();
  const saved = value.join("\n");
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  const commit = () => {
    const next = lines(draft);
    if (next.join("\n") === saved) return;
    const widens = only === "remove" ? next.some(p => !value.includes(p)) : only === "add" ? value.some(p => !next.includes(p)) : false;
    if (widens) {
      toast.error(t("remote.locked.restrictHint"));
      setDraft(saved);
      return;
    }
    onSave(next);
  };
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Textarea
        className="min-h-20 font-mono text-xs"
        value={draft}
        placeholder={"docker ps\nmake *"}
        onChange={e => setDraft(e.target.value)}
        onBlur={commit}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
