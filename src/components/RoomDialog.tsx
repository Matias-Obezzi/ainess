// A project's room: where its shared chat goes out to agents on other machines. Off by default.
// What the user sets here is the project's `room` (src/types.ts); src/lib/room does the rest.
import { useEffect, useState } from "react";
import { Globe } from "lucide-react";
import { useAppStore } from "@/store";
import { useT } from "@/i18n/useT";
import { machine as roomMachine, useRoomState } from "@/lib/room";
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Switch } from "@/components/ui/switch";
import { Badge } from "@/components/ui/badge";
import { PasswordField } from "@/components/ui/password-field";
import { NumberField } from "@/components/ui/number-field";
import { SegmentedControl, SegmentedControlItem } from "@/components/ui/segmented-control";
import type { RoomConfig } from "@/types";
import { isRemoteBuild } from "@/lib/platform";
import { RemoteLockedHint } from "@/components/RemoteLockedHint";

const EMPTY: RoomConfig = { enabled: false, backend: "supabase", room: "", secret: "", allowed: {} };

export function RoomDialog({ projectId, open, onOpenChange }: { projectId: string | null; open: boolean; onOpenChange: (open: boolean) => void }) {
  const t = useT();
  const project = useAppStore(state => state.config.projects.find(p => p.id === projectId));
  const machine = useAppStore(state => state.config.machine);
  const updateProject = useAppStore(state => state.updateProject);
  const updateConfig = useAppStore(state => state.updateConfig);
  const createChat = useAppStore(state => state.createChat);
  const state = useRoomState(projectId ?? undefined);

  const [draft, setDraft] = useState<RoomConfig>(EMPTY);
  const [machineName, setMachineName] = useState("");
  useEffect(() => {
    if (!open) return;
    setDraft(project?.room ?? EMPTY);
    setMachineName(machine?.name ?? "");
  }, [open, project?.room, machine?.name]);

  if (!project) return null;
  const set = (patch: Partial<RoomConfig>) => setDraft(d => ({ ...d, ...patch }));
  const saved = project.room;
  // Opening the room and letting a machine in are the host's to decide (see remote-settings.ts):
  // from the remote page a room is closed and machines are removed, no more.
  const remote = isRemoteBuild();

  const save = async () => {
    let chatId = draft.chatId;
    // The room speaks through a shared chat with the project's agents; the first time, it gets one.
    if (draft.enabled && !(chatId && useAppStore.getState().config.chats.some(c => c.id === chatId))) {
      chatId = await createChat({
        projectId: project.id,
        name: t("room.chatName", { room: draft.room.trim() }),
        mode: "shared",
        participants: (project.agents ?? []).map(a => ({ agentId: a.id, role: a.role })),
      });
    }
    updateProject(project.id, { room: { ...draft, room: draft.room.trim(), chatId } });
    const me = roomMachine();
    if (machineName.trim() && machineName.trim() !== me.name) updateConfig({ machine: { ...me, name: machineName.trim() } });
    onOpenChange(false);
  };

  // Allowing is saved straight away: it is the answer to a machine waiting at the door.
  const allow = (id: string, name: string) => {
    const room = saved ?? draft;
    updateProject(project.id, { room: { ...room, allowed: { ...room.allowed, [id]: name } } });
    set({ allowed: { ...draft.allowed, [id]: name } });
  };
  const forbid = (id: string) => {
    const room = saved ?? draft;
    const { [id]: _gone, ...rest } = room.allowed;
    updateProject(project.id, { room: { ...room, allowed: rest } });
    set({ allowed: rest });
  };

  const seen = state?.seen ?? {};
  const waiting = Object.entries(seen).filter(([id]) => !(id in draft.allowed));
  const connected = saved?.enabled && state?.status === "connected";
  const ready = draft.room.trim() && draft.secret && (draft.backend === "firebase" ? draft.firebaseUrl?.trim() : draft.supabaseUrl?.trim() && draft.supabaseKey?.trim());

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2"><Globe className="h-4 w-4" /> {t("room.title")}</DialogTitle>
          <DialogDescription>{t("room.description")}</DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <label className="flex items-center gap-2">
            <Switch checked={draft.enabled} onCheckedChange={enabled => set({ enabled })} disabled={remote && !saved?.enabled} />
            <span className="text-sm font-medium">{t("room.enabled")}</span>
            {saved?.enabled && (
              <Badge variant={connected ? "default" : "outline"} className="ml-auto text-[10px]">
                {t(`room.status.${state?.status ?? "connecting"}`)}
              </Badge>
            )}
          </label>
          {!saved?.enabled && <RemoteLockedHint className="-mt-2" />}
          {saved?.enabled && state?.status === "error" && state.detail && <p className="text-xs text-destructive break-words">{state.detail}</p>}

          <div className="grid gap-1.5">
            <Label>{t("room.backend")}</Label>
            <SegmentedControl fullWidth aria-label={t("room.backend")} value={draft.backend} onValueChange={v => set({ backend: v as RoomConfig["backend"] })}>
              <SegmentedControlItem value="supabase">Supabase</SegmentedControlItem>
              <SegmentedControlItem value="firebase">Firebase</SegmentedControlItem>
            </SegmentedControl>
          </div>

          {draft.backend === "supabase" ? (
            <>
              <Field label={t("room.supabaseUrl")}>
                <Input value={draft.supabaseUrl ?? ""} placeholder="https://xxxx.supabase.co" onChange={e => set({ supabaseUrl: e.target.value })} />
              </Field>
              <Field label={t("room.supabaseKey")} hint={t("room.supabaseHint")}>
                <PasswordField autoComplete="off" labels={{ reveal: t("common.showSecret") }} value={draft.supabaseKey ?? ""} onValueChange={supabaseKey => set({ supabaseKey })} />
              </Field>
            </>
          ) : (
            <>
              <Field label={t("room.firebaseUrl")}>
                <Input value={draft.firebaseUrl ?? ""} placeholder="https://xxxx.firebaseio.com" onChange={e => set({ firebaseUrl: e.target.value })} />
              </Field>
              <Field label={t("room.firebaseToken")} hint={t("room.firebaseHint")}>
                <PasswordField autoComplete="off" labels={{ reveal: t("common.showSecret") }} value={draft.firebaseToken ?? ""} onValueChange={firebaseToken => set({ firebaseToken })} />
              </Field>
            </>
          )}

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("room.name")}>
              <Input value={draft.room} placeholder="sala-1" onChange={e => set({ room: e.target.value })} />
            </Field>
            <Field label={t("room.secret")}>
              <PasswordField autoComplete="off" labels={{ reveal: t("common.showSecret") }} value={draft.secret} onValueChange={secret => set({ secret })} />
            </Field>
          </div>
          <p className="-mt-2 text-xs text-muted-foreground">{t("room.secretHint")}</p>

          <div className="grid grid-cols-2 gap-3">
            <Field label={t("room.machineName")}>
              <Input value={machineName} placeholder={t("room.machineNamePlaceholder")} onChange={e => setMachineName(e.target.value)} />
            </Field>
            <Field label={t("room.maxTurns")}>
              <NumberField min={1} max={50} className="w-full" value={draft.maxTurns ?? 6} onValueChange={n => n !== null && set({ maxTurns: n })} />
            </Field>
          </div>

          <div className="grid gap-2 border-t pt-3">
            <Label>{t("room.machines")}</Label>
            {Object.keys(draft.allowed).length === 0 && waiting.length === 0 && (
              <p className="text-xs text-muted-foreground">{t("room.machinesEmpty")}</p>
            )}
            {Object.entries(draft.allowed).map(([id, name]) => (
              <div key={id} className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 shrink-0 rounded-full bg-emerald-500" />
                <span className="min-w-0 flex-1 truncate">{name}</span>
                <Button size="sm" variant="ghost" className="h-7 text-xs" onClick={() => forbid(id)}>{t("room.remove")}</Button>
              </div>
            ))}
            {waiting.map(([id, name]) => (
              <div key={id} className="flex items-center gap-2 text-sm">
                <span className="h-2 w-2 shrink-0 rounded-full bg-amber-500" />
                <span className="min-w-0 flex-1 truncate">{name} <span className="text-xs text-muted-foreground">· {t("room.notAllowed")}</span></span>
                <Button size="sm" variant="outline" className="h-7 text-xs" disabled={remote} onClick={() => allow(id, name)}>{t("room.allow")}</Button>
              </div>
            ))}
          </div>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>{t("common.cancel")}</Button>
          <Button onClick={save} disabled={draft.enabled && !ready}>{t("common.save")}</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div className="grid gap-1.5">
      <Label>{label}</Label>
      {children}
      {hint && <p className="text-xs text-muted-foreground">{hint}</p>}
    </div>
  );
}
