// What a notification sounds like: the app's own two notes, tuned to taste, or a sound of your own.
//
// A file picked here travels inside the config as a data URL — a path would break the moment the
// file moved, and the phone and the CLI read the same config from somewhere else entirely. That is
// also why it is capped: the config is read and written all the time.
import { useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { toast } from "@/components/ui/toast";
import { useAppStore } from "@/store";
import { useT } from "@/i18n/useT";
import {
  DEFAULT_SOUND,
  MAX_HZ,
  MAX_SOUND_BYTES,
  MIN_HZ,
  MAX_SOUND_LABEL,
  playChime,
  volumeOf,
} from "@/lib/sound";
import type { SoundSettings } from "@/types";
import { Play, Upload, RotateCcw } from "lucide-react";

const WAVES: OscillatorType[] = ["sine", "triangle", "square", "sawtooth"];

/** A file the browser can play, small enough to live in the config. */
export function soundFileProblem(file: { type: string; size: number }): "type" | "size" | null {
  if (!file.type.startsWith("audio/")) return "type";
  if (file.size > MAX_SOUND_BYTES) return "size";
  return null;
}

export function SoundDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const t = useT();
  const config = useAppStore(state => state.config);
  const updateConfig = useAppStore(state => state.updateConfig);
  const sound = config.notificationSound;

  const [draft, setDraft] = useState<SoundSettings>({ ...sound });
  const notes = draft.notes ?? DEFAULT_SOUND.notes;

  const patch = (change: Partial<SoundSettings>) => setDraft(prev => ({ ...prev, ...change }));

  const pickFile = async (file: File) => {
    const problem = soundFileProblem(file);
    if (problem === "type") return toast.error(t("sound.notAudio"));
    if (problem === "size") return toast.error(t("sound.tooBig", { max: MAX_SOUND_LABEL }));
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(file);
    }).catch(() => "");
    if (!dataUrl) return toast.error(t("sound.notAudio"));
    patch({ file: dataUrl, fileName: file.name });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{t("sound.title")}</DialogTitle>
          <DialogDescription>{t("sound.body")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          {draft.file ? (
            <div className="flex items-center gap-2 rounded-md border border-border p-2 text-sm">
              <span className="min-w-0 flex-1 truncate">{draft.fileName || t("sound.yourFile")}</span>
              <Button variant="ghost" size="sm" onClick={() => patch({ file: undefined, fileName: undefined })}>
                {t("sound.useTheApps")}
              </Button>
            </div>
          ) : (
            <>
              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t("sound.notes")}</Label>
                <div className="flex items-center gap-2">
                  {[0, 1].map(i => (
                    <input
                      key={i}
                      type="range"
                      min={MIN_HZ}
                      max={MAX_HZ}
                      step={10}
                      value={notes[i]}
                      onChange={e => {
                        const next: [number, number] = [...notes] as [number, number];
                        next[i] = Number(e.target.value);
                        patch({ notes: next });
                      }}
                      className="h-1 flex-1 accent-primary"
                    />
                  ))}
                  <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                    {notes[0]} · {notes[1]} Hz
                  </span>
                </div>
              </div>

              <div className="flex flex-col gap-1">
                <Label className="text-xs">{t("sound.wave")}</Label>
                <Select value={draft.wave ?? DEFAULT_SOUND.wave} onValueChange={v => patch({ wave: v as OscillatorType })}>
                  <SelectTrigger size="sm" className="w-full"><SelectValue /></SelectTrigger>
                  <SelectContent>
                    {WAVES.map(wave => (
                      <SelectItem key={wave} value={wave}>{t(`sound.wave.${wave}`)}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </>
          )}

          <div className="flex flex-col gap-1">
            <Label className="text-xs">{t("sound.volume")}</Label>
            <div className="flex items-center gap-2">
              <input
                type="range"
                min={0}
                max={100}
                value={Math.round(volumeOf(draft) * 100)}
                onChange={e => patch({ volume: Number(e.target.value) / 100 })}
                className="h-1 flex-1 accent-primary"
              />
              <span className="w-24 shrink-0 text-right text-xs tabular-nums text-muted-foreground">
                {Math.round(volumeOf(draft) * 100)}%
              </span>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-2">
            {/* Both of them: what needs you and what is only news do not sound the same. */}
            <Button variant="outline" size="sm" onClick={() => playChime("attention", draft)}>
              <Play className="h-3.5 w-3.5" /> {t("sound.playAttention")}
            </Button>
            <Button variant="outline" size="sm" onClick={() => playChime("done", draft)}>
              <Play className="h-3.5 w-3.5" /> {t("sound.playDone")}
            </Button>
            <label className="ml-auto">
              <input
                type="file"
                accept="audio/*"
                hidden
                onChange={e => {
                  const file = e.target.files?.[0];
                  e.target.value = "";
                  if (file) void pickFile(file);
                }}
              />
              <Button variant="ghost" size="sm" asChild>
                <span><Upload className="h-3.5 w-3.5" /> {t("sound.pickFile")}</span>
              </Button>
            </label>
          </div>
        </div>

        <DialogFooter>
          <Button
            variant="ghost"
            onClick={() => setDraft({ enabled: draft.enabled })}
            title={t("sound.reset")}
          >
            <RotateCcw className="h-3.5 w-3.5" /> {t("sound.reset")}
          </Button>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button
            onClick={() => {
              updateConfig({ notificationSound: draft });
              onOpenChange(false);
            }}
          >
            {t("common.save")}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
