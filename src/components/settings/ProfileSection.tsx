import { useEffect, useState } from "react";
import { useAppStore } from "@/store";
import { Input } from "@/components/ui/input";
import { Textarea } from "@/components/ui/textarea";
import { Button } from "@/components/ui/button";
import { toast } from "@/components/ui/toast";
import { createContext, useContext, type ReactNode } from "react";
import { useT } from "@/i18n/useT";

interface ProfileDraft {
  name: string;
  about: string;
  preferences: string;
}

interface ProfileCtxValue {
  draft: ProfileDraft;
  setDraft: React.Dispatch<React.SetStateAction<ProfileDraft>>;
  dirty: boolean;
  save(): void;
}

const ProfileCtx = createContext<ProfileCtxValue | null>(null);

/** Shares the staged profile draft between the header's "Guardar" action and the form body. */
export function ProfileSectionProvider({ children }: { children: ReactNode }) {
  const t = useT();
  const profile = useAppStore(state => state.config.profile);
  const updateConfig = useAppStore(state => state.updateConfig);
  const [draft, setDraft] = useState<ProfileDraft>({
    name: profile?.name || "",
    about: profile?.about || "",
    preferences: profile?.preferences || "",
  });

  useEffect(() => {
    setDraft({ name: profile?.name || "", about: profile?.about || "", preferences: profile?.preferences || "" });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [profile?.name, profile?.about, profile?.preferences]);

  const dirty = draft.name !== (profile?.name || "") || draft.about !== (profile?.about || "") || draft.preferences !== (profile?.preferences || "");

  const save = () => {
    updateConfig({ profile: draft });
    toast.success(t("profile.saved"));
  };

  return <ProfileCtx.Provider value={{ draft, setDraft, dirty, save }}>{children}</ProfileCtx.Provider>;
}

function useProfileCtx(): ProfileCtxValue {
  const ctx = useContext(ProfileCtx);
  if (!ctx) throw new Error("useProfileCtx must be used within ProfileSectionProvider");
  return ctx;
}

export function ProfileSectionActions() {
  const t = useT();
  const { dirty, save } = useProfileCtx();
  return <Button size="sm" onClick={save} disabled={!dirty}>{t("common.save")}</Button>;
}

export function ProfileSection() {
  const t = useT();
  const { draft, setDraft } = useProfileCtx();

  return (
    <div className="flex flex-col gap-4">
      <p className="text-sm text-muted-foreground">{t("profile.intro")}</p>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">{t("settings.option.profile.name")}</label>
        <Input
          value={draft.name}
          onChange={e => setDraft(d => ({ ...d, name: e.target.value }))}
          placeholder={t("profile.namePlaceholder")}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">{t("settings.option.profile.about")}</label>
        <Textarea
          className="resize-none"
          value={draft.about}
          onChange={e => setDraft(d => ({ ...d, about: e.target.value }))}
          placeholder={t("profile.aboutPlaceholder")}
        />
      </div>
      <div className="flex flex-col gap-2">
        <label className="text-sm font-semibold">{t("settings.option.profile.preferences")}</label>
        <Textarea
          className="h-32 resize-none"
          value={draft.preferences}
          onChange={e => setDraft(d => ({ ...d, preferences: e.target.value }))}
          placeholder={t("profile.preferencesPlaceholder")}
        />
      </div>
    </div>
  );
}
