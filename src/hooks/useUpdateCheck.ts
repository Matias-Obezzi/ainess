import { useEffect, useRef } from "react";
import { useAppStore } from "@/store";
import { toast } from "@/components/ui/toast";
import { checkForUpdate } from "@/lib/updates";
import { translateNow } from "@/i18n/useT";

const DELAY_MS = 5000;
const TOAST_ID = "ainess-update";

/**
 * A few seconds after startup, asks the release endpoint whether there is a newer version
 * and offers to install it from a persistent toast. Opt-out with `config.autoUpdateCheck`.
 */
export function useUpdateCheck(): void {
  const loaded = useAppStore(state => state.loaded);
  const enabled = useAppStore(state => state.config.autoUpdateCheck);
  const done = useRef(false);

  useEffect(() => {
    if (!loaded || !enabled || done.current) return;
    done.current = true;
    const timer = setTimeout(() => {
      void (async () => {
        const result = await checkForUpdate();
        if (!result.available || !result.install) return;
        const install = result.install;
        const headline = translateNow("update.available", { version: result.version ?? "" });
        useAppStore.getState().notify({
          kind: "update",
          title: headline,
          body: translateNow("update.readyToInstall"),
        });
        toast.info(headline, {
          id: TOAST_ID,
          description: result.body?.slice(0, 200) ?? translateNow("update.readyToInstall"),
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
    }, DELAY_MS);
    return () => clearTimeout(timer);
  }, [loaded, enabled]);
}
