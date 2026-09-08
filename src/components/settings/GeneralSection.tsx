import { useState, useEffect } from "react";
import { useAppStore } from "@/store";
import { Card, CardHeader, CardTitle, CardDescription, CardContent } from "@/components/ui/card";
import { Switch } from "@/components/ui/switch";
import { Input } from "@/components/ui/input";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { LANGUAGES, languageNames, type Language } from "@/i18n";
import { useT } from "@/i18n/useT";
import { Button } from "@/components/ui/button";
import { SoundDialog } from "@/components/SoundDialog";
import { playChime, soundEnabled } from "@/lib/sound";

/** Value of the auto-archive select that means "never"; a Select cannot hold null. */
const NEVER = "never";

/** How long a done task can sit on the board before it archives itself. */
const AUTO_ARCHIVE_DAYS = [7, 14, 30, 90];

/** Language, "Segundo plano", "Orquestación" and how the board tidies itself up. */
export function GeneralSection() {
  const t = useT();
  const config = useAppStore(state => state.config);
  const updateConfig = useAppStore(state => state.updateConfig);
  const setMaxRounds = useAppStore(state => state.setMaxRounds);

  const [soundOpen, setSoundOpen] = useState(false);
  const [maxRoundsText, setMaxRoundsText] = useState(String(config.maxRounds));
  useEffect(() => {
    setMaxRoundsText(String(config.maxRounds));
  }, [config.maxRounds]);

  const commitMaxRounds = (value: string) => {
    const n = parseInt(value, 10);
    if (Number.isFinite(n) && n >= 1 && n <= 20) {
      setMaxRounds(n);
    } else {
      setMaxRoundsText(String(config.maxRounds));
    }
  };

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
            onValueChange={value => updateConfig({ language: value === "system" ? null : (value as Language) })}
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
            <Input
              type="number"
              min={1}
              max={20}
              className="w-24"
              value={maxRoundsText}
              onChange={e => setMaxRoundsText(e.target.value)}
              onBlur={e => commitMaxRounds(e.target.value)}
            />
            <span className="text-sm text-muted-foreground">{t("settings.general.maxRoundsHint")}</span>
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
