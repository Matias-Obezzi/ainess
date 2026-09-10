// The switch that puts a project into autonomous mode, and the banner that says it is on. See
// src/lib/autonomous.ts for the rule and CLAUDE.md for the four stops it skips.
import { useState } from "react";
import { useAppStore } from "@/store";
import { isAutonomous } from "@/lib/autonomous";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/popover";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { useLocale, useT } from "@/i18n/useT";
import { Moon } from "lucide-react";

/** Preset lengths offered in the "until" picker, in hours. */
const DURATIONS_H = [1, 2, 4, 8, 12] as const;

function formatTime(ms: number, locale: string): string {
  return new Date(ms).toLocaleTimeString(locale, { hour: "2-digit", minute: "2-digit" });
}

/**
 * Button in the project header, shaped like every other button in it.
 *
 * It used to carry its own amber fill to be impossible to miss. It did not need to: the strip under
 * the bar (`AutonomousBanner`) is the loud one, it runs the whole width, and it only exists while
 * the mode is on. A button in a row of buttons that is shaped unlike all of them reads as a
 * different kind of thing, which it is not.
 */
export function AutonomousToggleButton({ projectId }: { projectId: string }) {
  const t = useT();
  const locale = useLocale();
  const project = useAppStore(state => state.config.projects.find(p => p.id === projectId));
  const setAutonomous = useAppStore(state => state.setAutonomous);
  const [hours, setHours] = useState<string>("4");
  const [open, setOpen] = useState(false);

  if (!project) return null;
  const active = isAutonomous(project);

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <Button
          variant={active ? "secondary" : "ghost"}
          size="sm"
          className="h-7 gap-1.5"
          title={t("autonomous.mode")}
        >
          <Moon className="h-3.5 w-3.5" />
          <span className="hidden @3xl:inline">
            {active ? t("autonomous.badge", { time: formatTime(project.autonomous!.until, locale) }) : t("autonomous.mode")}
          </span>
        </Button>
      </PopoverTrigger>
      <PopoverContent align="end" className="space-y-3">
        <div className="space-y-1">
          <p className="text-sm font-semibold">{t("autonomous.mode")}</p>
          <p className="text-xs text-muted-foreground">{t("autonomous.warning")}</p>
        </div>

        {active ? (
          <>
            <p className="text-xs font-medium text-amber-600 dark:text-amber-400">
              {t("autonomous.activeUntil", { time: formatTime(project.autonomous!.until, locale) })}
            </p>
            <Button
              variant="outline"
              size="sm"
              className="w-full"
              onClick={() => {
                setAutonomous(projectId, null);
                setOpen(false);
              }}
            >
              {t("autonomous.turnOff")}
            </Button>
          </>
        ) : (
          <>
            <div className="space-y-1.5">
              <Label className="text-xs">{t("autonomous.until")}</Label>
              <Select value={hours} onValueChange={setHours}>
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {DURATIONS_H.map(h => (
                    <SelectItem key={h} value={String(h)}>{t(`autonomous.duration.${h}h`)}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <Button
              size="sm"
              className="w-full"
              onClick={() => {
                setAutonomous(projectId, Date.now() + Number(hours) * 3600_000);
                setOpen(false);
              }}
            >
              {t("autonomous.turnOn")}
            </Button>
          </>
        )}
      </PopoverContent>
    </Popover>
  );
}

/**
 * Full-width amber strip under the project header, only while the mode is on. The toggle button
 * already says it in the bar, but a bar can go unnoticed on a wide screen — this cannot, and it is
 * where the actual implications (approvals, questions, the budget) are spelled out, not just badged.
 */
export function AutonomousBanner({ projectId }: { projectId: string }) {
  const t = useT();
  const locale = useLocale();
  const project = useAppStore(state => state.config.projects.find(p => p.id === projectId));
  const setAutonomous = useAppStore(state => state.setAutonomous);

  if (!project || !isAutonomous(project)) return null;

  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-b border-amber-500/40 bg-amber-500/5 px-4 py-2 text-xs text-amber-600 dark:text-amber-400">
      <Moon className="h-3.5 w-3.5 shrink-0" />
      <span className="font-semibold">{t("autonomous.activeUntil", { time: formatTime(project.autonomous!.until, locale) })}</span>
      <span className="text-amber-600/80 dark:text-amber-400/80">{t("autonomous.warning")}</span>
      <Button
        variant="outline"
        size="sm"
        className="ml-auto h-6 shrink-0 border-amber-500/40 px-2 text-xs text-amber-600 hover:bg-amber-500/10 dark:text-amber-400"
        onClick={() => setAutonomous(projectId, null)}
      >
        {t("autonomous.turnOff")}
      </Button>
    </div>
  );
}
