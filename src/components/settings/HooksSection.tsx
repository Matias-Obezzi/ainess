import { useAppStore } from "@/store";
import { confirmDelete } from "@/lib/confirm";
import { Card, CardHeader, CardTitle, CardDescription, CardContent, CardFooter } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Switch } from "@/components/ui/switch";
import { EmptyState } from "@/components/ui/empty-state";
import { HookDialog } from "@/components/HookDialog";
import { Hook } from "@/types";
import { Webhook } from "lucide-react";
import { createDialogContext } from "@/components/settings/section-context";
import { useT } from "@/i18n/useT";

const HookDialogCtx = createDialogContext<Hook>();
export const HooksSectionProvider = HookDialogCtx.Provider;

export function HooksSectionActions() {
  const t = useT();
  const { openCreate } = HookDialogCtx.useDialogState();
  return <Button size="sm" onClick={openCreate}>{t("hooks.new")}</Button>;
}

export function HooksSection() {
  const t = useT();
  const config = useAppStore(state => state.config);
  const upsertHook = useAppStore(state => state.upsertHook);
  const removeHook = useAppStore(state => state.removeHook);
  const toggleHook = useAppStore(state => state.toggleHook);
  const testHook = useAppStore(state => state.testHook);
  const { open, editing, openEdit, openCreate, close } = HookDialogCtx.useDialogState();

  const dialog = open && (
    <HookDialog
      open={open}
      onClose={close}
      hook={editing ?? undefined}
      onSave={(h) => { upsertHook(h); close(); }}
    />
  );

  if ((config.hooks?.length ?? 0) === 0) {
    return (
      <>
        <EmptyState
          icon={Webhook}
          title={t("hooks.empty.title")}
          description={t("hooks.empty.body")}
          action={{ label: t("hooks.empty.action"), onClick: openCreate }}
        />
        {dialog}
      </>
    );
  }

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
        {config.hooks?.map(hook => (
          <Card key={hook.id}>
            <CardHeader>
              <CardTitle className="flex items-center justify-between">
                <span>{hook.name}</span>
                <Switch checked={hook.enabled} onCheckedChange={(v) => toggleHook(hook.id, v)} />
              </CardTitle>
              <CardDescription>{t("hooks.event", { event: hook.event })}</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="text-sm">
                <strong>{t("hooks.action")}</strong> {hook.action.type}
              </div>
            </CardContent>
            <CardFooter className="flex justify-end gap-2">
              <Button variant="outline" size="sm" onClick={() => testHook(hook.id)}>{t("hooks.test")}</Button>
              <Button variant="outline" size="sm" onClick={() => openEdit(hook)}>{t("common.edit")}</Button>
              <Button variant="destructive" size="sm" onClick={() => void confirmDelete(t("hooks.delete"), hook.name).then(ok => ok && removeHook(hook.id))}>{t("common.delete")}</Button>
            </CardFooter>
          </Card>
        ))}
      </div>
      {dialog}
    </div>
  );
}
