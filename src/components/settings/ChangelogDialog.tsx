// What a version brought, in the app and in the reader's language.
//
// English is the repo's own CHANGELOG.md, and each other language has its own file under
// docs/changelog/ (see src/lib/changelog.ts). It opens by itself the first time a new version
// runs, since the moment someone wants to know what changed is right after it changed under them.
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Markdown } from "@/components/shell/Markdown";
import { appVersion } from "@/lib/updates";
import { lastSeenVersion, rememberSeenVersion } from "@/lib/seen-version";
import { useLanguage, useT } from "@/i18n/useT";
import { changelogFor } from "@/lib/changelog";

export function ChangelogDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const t = useT();
  const language = useLanguage();
  const [version, setVersion] = useState("");

  useEffect(() => {
    void appVersion().then(setVersion);
  }, []);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[80vh] flex-col overflow-hidden sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>{t("changelog.title")}</DialogTitle>
          <DialogDescription>{t("changelog.description", { version })}</DialogDescription>
        </DialogHeader>
        <div className="-mx-4 min-h-0 flex-1 overflow-y-auto px-4 text-sm">
          <Markdown text={changelogFor(language)} />
        </div>
      </DialogContent>
    </Dialog>
  );
}

/**
 * Opens it once when the version changed under the user, and never again for that version. A fresh
 * install is not an update: there is nothing to catch up on, so it only records what it is running.
 */
export function useChangelogOnUpdate(): { open: boolean; setOpen: (open: boolean) => void } {
  const [open, setOpen] = useState(false);

  useEffect(() => {
    void (async () => {
      const current = await appVersion();
      const seen = lastSeenVersion();
      rememberSeenVersion(current);
      if (seen && seen !== current) setOpen(true);
    })();
  }, []);

  return { open, setOpen };
}
