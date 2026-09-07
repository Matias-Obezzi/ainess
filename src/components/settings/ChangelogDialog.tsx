// What a version brought, in the app.
//
// The file is the repo's own CHANGELOG.md, bundled as it is: one place to write, and what the app
// shows is what the release notes say. It opens by itself the first time a new version runs, since
// the moment someone wants to know what changed is right after it changed under them.
import { useEffect, useState } from "react";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Markdown } from "@/components/shell/Markdown";
import { appVersion } from "@/lib/updates";
import { lastSeenVersion, rememberSeenVersion } from "@/lib/seen-version";
import { useT } from "@/i18n/useT";
import changelog from "../../../CHANGELOG.md?raw";

/** The whole file, minus its own heading: the dialog already has a title. */
function body(): string {
  return changelog.replace(/^#\s+Changelog\s*\n/, "").trim();
}

export function ChangelogDialog({ open, onOpenChange }: { open: boolean; onOpenChange(open: boolean): void }) {
  const t = useT();
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
          <Markdown text={body()} />
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
