// What planners may do on their own: groups of commands, and the user's own patterns to allow or
// to block. Saved as it is changed; the next call a planner makes is decided by it.
import { useEffect, useState } from "react";
import { useAppStore } from "@/store";
import { useT } from "@/i18n/useT";
import { Switch } from "@/components/ui/switch";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { PLANNER_PRESETS, type PlannerPermissions } from "@/lib/planner-permissions";

const lines = (text: string) => text.split("\n").map(l => l.trim()).filter(Boolean);

export function PermissionsSection() {
  const t = useT();
  const perms = useAppStore(state => state.config.plannerPermissions);
  const updateConfig = useAppStore(state => state.updateConfig);
  const save = (patch: PlannerPermissions) => updateConfig({ plannerPermissions: { ...perms, ...patch } });

  return (
    <div className="flex flex-col gap-5">
      <p className="text-sm text-muted-foreground">{t("permissions.intro")}</p>

      <div className="flex flex-col gap-3">
        {PLANNER_PRESETS.map(preset => (
          <label key={preset.id} className="flex items-start gap-3">
            <Switch
              className="mt-0.5"
              checked={perms?.presets?.[preset.id] ?? preset.on}
              onCheckedChange={on => save({ presets: { ...perms?.presets, [preset.id]: on } })}
            />
            <span className="min-w-0">
              <span className="block text-sm font-medium">{t(`permissions.preset.${preset.id}`)}</span>
              <span className="block text-xs text-muted-foreground">{t(`permissions.preset.${preset.id}.hint`)}</span>
            </span>
          </label>
        ))}
      </div>

      <PatternList label={t("permissions.allow")} hint={t("permissions.allowHint")} value={perms?.allow ?? []} onSave={allow => save({ allow })} />
      <PatternList label={t("permissions.deny")} hint={t("permissions.denyHint")} value={perms?.deny ?? []} onSave={deny => save({ deny })} />
    </div>
  );
}

function PatternList({ label, hint, value, onSave }: { label: string; hint: string; value: string[]; onSave: (v: string[]) => void }) {
  const saved = value.join("\n");
  const [draft, setDraft] = useState(saved);
  useEffect(() => setDraft(saved), [saved]);
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      <Textarea
        className="min-h-20 font-mono text-xs"
        value={draft}
        placeholder={"docker ps\nmake *"}
        onChange={e => setDraft(e.target.value)}
        onBlur={() => { if (lines(draft).join("\n") !== saved) onSave(lines(draft)); }}
      />
      <p className="text-xs text-muted-foreground">{hint}</p>
    </div>
  );
}
