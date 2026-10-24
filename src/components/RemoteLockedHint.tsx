// What the remote page says next to a field it may not change: the host refuses it (see the locks in
// src/lib/remote-settings.ts), so the field is drawn read-only and this says where it is changed.
import { isRemoteBuild } from "@/lib/platform";
import { useT } from "@/i18n/useT";
import { cn } from "@/lib/utils";

/**
 * Nothing outside the remote page. `restrict`: the field may still be tightened from here.
 * `envReference`: the field may change, but not refer to an environment variable.
 */
export function RemoteLockedHint({ restrict = false, envReference = false, className }: { restrict?: boolean; envReference?: boolean; className?: string }) {
  const t = useT();
  if (!isRemoteBuild()) return null;
  const key = envReference ? "remote.locked.envReferenceHint" : restrict ? "remote.locked.restrictHint" : "remote.locked.hint";
  return <p className={cn("text-xs text-amber-600 dark:text-amber-400", className)}>{t(key)}</p>;
}
