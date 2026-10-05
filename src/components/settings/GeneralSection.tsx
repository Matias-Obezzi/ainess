import { useState } from "react";
import { useAppStore } from "@/store";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { NumberField } from "@/components/ui/number-field";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LANGUAGES, languageNames, loadLanguage, resolveLanguage, type Language } from "@/i18n";
import { useT } from "@/i18n/useT";
import { Button } from "@/components/ui/button";
import { SoundDialog } from "@/components/SoundDialog";
import { playChime, soundEnabled } from "@/lib/sound";
import { DEFAULT_STALL_STOP_MINUTES } from "@/lib/stall";

/** Value of the auto-archive select that means "never"; a Select cannot hold null. */
const NEVER = "never";

/** How long a done task can sit on the board before it archives itself. */
const AUTO_ARCHIVE_DAYS = [7, 14, 30, 90];

/** Highest ceiling the field takes. Past this the number stops meaning anything on real hardware. */
const MAX_CONCURRENT_RUNS_LIMIT = 32;

/** Language, "Segundo plano", "Orquestación" and how the board tidies itself up. */
export function GeneralSection() {
  const t = useT();
  const config = useAppStore(state => state.config);
  const updateConfig = useAppStore(state => state.updateConfig);
  const setMaxRounds = useAppStore(state => state.setMaxRounds);
  const setMaxConcurrentRuns = useAppStore(state => state.setMaxConcurrentRuns);

  const [soundOpen, setSoundOpen] = useState(false);
  const stallStop = config.stallStopMinutes ?? DEFAULT_STALL_STOP_MINUTES;
  // The fields clamp to their bounds and commit on blur, Enter or a step; an emptied field
  // gives null, which leaves the saved value where it was.
  const stepperLabels = { decrementLabel: t("common.decrease"), incrementLabel: t("common.increase") };

  return (
    <div className="flex flex-col gap-4">
      <Card>
        <CardHeader>
          <CardTitle>{t("settings.general.languageTitle")}</CardTitle>
          <CardDescription>{t("settings.general.languageDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <label className="text-sm font-semibold">{t("settings.option.general.language")}</label>
          <Select
            value={config.language ?? "system"}
            onValueChange={value => {
              const language = value === "system" ? null : (value as Language);
              // Load the dictionary before it is picked, so the UI never repaints in a language
              // that is not actually loaded yet and falls back to Spanish for an instant.
              loadLanguage(resolveLanguage(language))
                .catch(() => {})
                .finally(() => updateConfig({ language }));
            }}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="system">{t("settings.general.systemLanguage")}</SelectItem>
              {LANGUAGES.map(lang => (
                <SelectItem key={lang} value={lang}>{languageNames[lang]}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{t("settings.general.languageHint")}</span>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.general.backgroundTitle")}</CardTitle>
          <CardDescription>{t("settings.general.backgroundDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={config.tray.enabled}
              onCheckedChange={(checked) => updateConfig({ tray: { ...config.tray, enabled: checked } })}
            />
            <div className="flex flex-col">
              <label className="text-sm font-semibold">{t("settings.option.general.tray")}</label>
              <span className="text-sm text-muted-foreground">{t("settings.general.trayHint")}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={config.tray.notifyApprovals}
              onCheckedChange={(checked) => updateConfig({ tray: { ...config.tray, notifyApprovals: checked } })}
            />
            <div className="flex flex-col">
              <label className="text-sm font-semibold">{t("settings.option.general.notifyApprovals")}</label>
              <span className="text-sm text-muted-foreground">{t("settings.general.notifyApprovalsHint")}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={config.tray.notifyResults}
              onCheckedChange={(checked) => updateConfig({ tray: { ...config.tray, notifyResults: checked } })}
            />
            <div className="flex flex-col">
              <label className="text-sm font-semibold">{t("settings.option.general.notifyResults")}</label>
              <span className="text-sm text-muted-foreground">{t("settings.general.notifyResultsHint")}</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch
              checked={soundEnabled(config.notificationSound)}
              onCheckedChange={(checked) => {
                updateConfig({ notificationSound: { ...config.notificationSound, enabled: checked } });
                // Turning it on plays it: the only way to know what you just agreed to.
                if (checked) playChime("attention", config.notificationSound);
              }}
            />
            <div className="flex min-w-0 flex-col">
              <label className="text-sm font-semibold">{t("settings.option.general.sound")}</label>
              <span className="text-sm text-muted-foreground">{t("settings.general.soundHint")}</span>
            </div>
            <Button variant="outline" size="sm" className="ml-auto shrink-0" onClick={() => setSoundOpen(true)}>
              {t("sound.edit")}
            </Button>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.general.updatesTitle")}</CardTitle>
          <CardDescription>{t("settings.general.updatesDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex items-center gap-2">
            <Switch
              checked={config.autoUpdateCheck}
              onCheckedChange={(checked) => updateConfig({ autoUpdateCheck: checked })}
            />
            <div className="flex flex-col">
              <label className="text-sm font-semibold">{t("settings.option.general.updateCheck")}</label>
              <span className="text-sm text-muted-foreground">{t("settings.general.updateCheckHint")}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t">
            <Switch
              checked={config.logLevel === "debug"}
              onCheckedChange={(checked) => updateConfig({ logLevel: checked ? "debug" : "info" })}
            />
            <div className="flex flex-col">
              <label className="text-sm font-semibold">{t("settings.option.general.debugLog")}</label>
              <span className="text-sm text-muted-foreground">{t("settings.general.debugLogHint")}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.general.orchestrationTitle")}</CardTitle>
        </CardHeader>
        <CardContent className="flex flex-col gap-4">
          <div className="flex flex-col gap-2">
            <label className="text-sm font-semibold">{t("settings.option.general.maxRounds")}</label>
            <NumberField
              min={1}
              max={20}
              className="w-32"
              {...stepperLabels}
              value={config.maxRounds}
              onValueChange={n => n !== null && setMaxRounds(n)}
            />
            <span className="text-sm text-muted-foreground">{t("settings.general.maxRoundsHint")}</span>
          </div>
          <div className="flex flex-col gap-2 pt-2 border-t">
            <label className="text-sm font-semibold">{t("settings.option.general.maxConcurrentRuns")}</label>
            {/* 0 is allowed and means no ceiling, which is why this one starts at 0 and the rounds at 1. */}
            <NumberField
              min={0}
              max={MAX_CONCURRENT_RUNS_LIMIT}
              className="w-32"
              {...stepperLabels}
              value={config.maxConcurrentRuns}
              onValueChange={n => n !== null && setMaxConcurrentRuns(n)}
            />
            <span className="text-sm text-muted-foreground">{t("settings.general.maxConcurrentRunsHint")}</span>
          </div>
          <div className="flex flex-col gap-2 pt-2 border-t">
            <label className="text-sm font-semibold">{t("settings.option.general.stallStopMinutes")}</label>
            {/* 0 means never, as with the run ceiling. */}
            <NumberField
              min={0}
              max={24 * 60}
              className="w-32"
              {...stepperLabels}
              value={stallStop}
              onValueChange={n => n !== null && updateConfig({ stallStopMinutes: n })}
            />
            <span className="text-sm text-muted-foreground">{t("settings.general.stallStopMinutesHint")}</span>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t">
            <Switch
              checked={config.autoModel}
              onCheckedChange={(checked) => updateConfig({ autoModel: checked })}
            />
            <div className="flex flex-col">
              <label className="text-sm font-semibold">{t("settings.option.general.autoModel")}</label>
              <span className="text-sm text-muted-foreground">{t("settings.general.autoModelHint")}</span>
            </div>
          </div>
          <div className="flex items-center gap-2 pt-2 border-t">
            <Switch
              checked={config.approveDelegations}
              onCheckedChange={(checked) => updateConfig({ approveDelegations: checked })}
            />
            <div className="flex flex-col">
              <label className="text-sm font-semibold">{t("settings.option.general.approveDelegations")}</label>
              <span className="text-sm text-muted-foreground">{t("settings.general.approveDelegationsHint")}</span>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle>{t("settings.general.boardTitle")}</CardTitle>
          <CardDescription>{t("settings.general.boardDescription")}</CardDescription>
        </CardHeader>
        <CardContent className="flex flex-col gap-2">
          <label className="text-sm font-semibold">{t("settings.option.general.autoArchive")}</label>
          <Select
            value={config.autoArchiveDoneDays === null ? NEVER : String(config.autoArchiveDoneDays)}
            onValueChange={value => updateConfig({ autoArchiveDoneDays: value === NEVER ? null : Number(value) })}
          >
            <SelectTrigger className="w-[220px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value={NEVER}>{t("settings.general.autoArchiveNever")}</SelectItem>
              {AUTO_ARCHIVE_DAYS.map(days => (
                <SelectItem key={days} value={String(days)}>{t("settings.general.autoArchiveDays", { n: days })}</SelectItem>
              ))}
            </SelectContent>
          </Select>
          <span className="text-sm text-muted-foreground">{t("settings.general.autoArchiveHint")}</span>
        </CardContent>
      </Card>

      {/* Remounted per opening, so it always starts from what is saved. */}
      {soundOpen && <SoundDialog key="sound" open onOpenChange={setSoundOpen} />}
    </div>
  );
}
