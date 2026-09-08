import { useEffect, useRef } from "react";
import { useAppStore } from "@/store";
import { toast } from "@/components/ui/toast";
import { checkForUpdate } from "@/lib/updates";
import { translateNow } from "@/i18n/useT";

const DELAY_MS = 5000;
/** How often it asks again. A release published while the app is open reaches it within minutes. */
const EVERY_MS = 5 * 60_000;
const TOAST_ID = "ainess-update";

/**
 * Asks the release endpoint whether there is a newer version — a few seconds after startup and
 * every five minutes after that — and offers to install it from a persistent toast. Opt-out with
 * `config.autoUpdateCheck`.
 */
export function useUpdateCheck(): void {
  const loaded = useAppStore(state => state.loaded);
  const enabled = useAppStore(state => state.config.autoUpdateCheck);
  /** The version already offered: the same one must not come back every five minutes. */
  const offered = useRef<string | null>(null);

  useEffect(() => {
    if (!loaded || !enabled) return;

    const ask = () => {
      void (async () => {
        const result = await checkForUpdate();
        if (!result.available || !result.install) return;
        if (offered.current === (result.version ?? "")) return;
        offered.current = result.version ?? "";
        const install = result.install;
        const headline = translateNow("update.available", { version: result.version ?? "" });
        useAppStore.getState().notify({
          kind: "update",
          title: headline,
          body: translateNow("update.readyToInstall"),
        });
        toast.info(headline, {
          id: TOAST_ID,
          // Not the release body: ours is a line of markdown pointing at the changelog, and a toast
          // shows text, so it arrived as "[CHANGELOG.md](https://…)". What changed is in the
          // changelog dialog, which opens by itself after the update anyway.
          description: translateNow("update.readyToInstall"),
          duration: Infinity,
          action: {
            label: translateNow("update.install"),
            onClick: () => {
              void (async () => {
                try {
                  await install(percent => {
                    toast.loading(translateNow("update.downloading", { version: result.version ?? "" }), {
                      id: TOAST_ID,
                      description: `${percent}%`,
                      duration: Infinity,
                    });
                  });
                } catch (e) {
                  toast.error(translateNow("update.installFailed"), {
                    id: TOAST_ID,
                    description: e instanceof Error ? e.message : String(e),
                  });
                }
              })();
            },
          },
        });
      })();
    };

    const first = setTimeout(ask, DELAY_MS);
    const interval = setInterval(ask, EVERY_MS);
    return () => {
      clearTimeout(first);
      clearInterval(interval);
    };
  }, [loaded, enabled]);
}
