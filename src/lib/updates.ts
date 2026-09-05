// Update checks through the official Tauri updater. The release workflow
// (.github/workflows/release.yml) publishes the NSIS installer, its signature and
// `latest.json` on every merge to main; the app reads that endpoint (see tauri.conf.json).
//
// Outside Tauri (CLI, browser preview) there is nothing to update: `unsupported` is returned.
import { isTauri } from "@/lib/tauri";
import { log } from "@/lib/logger";

export interface UpdateCheck {
  available: boolean;
  /** Version offered by the endpoint. */
  version?: string;
  /** Release notes, when the endpoint carries them. */
  body?: string;
  /** Not running inside the app: the updater does not apply. */
  unsupported?: boolean;
  /** Readable reason the check failed. */
  error?: string;
  /** Downloads and installs the update, reporting 0-100, then relaunches. */
  install?: (onProgress: (percent: number) => void) => Promise<void>;
}

/** Current version: the real one in Tauri, the package.json one everywhere else. */
export async function appVersion(): Promise<string> {
  if (isTauri()) {
    try {
      const { getVersion } = await import("@tauri-apps/api/app");
      return await getVersion();
    } catch {
      /* fall through to the build-time constant */
    }
  }
  return __APP_VERSION__;
}

/** Never throws: a failure comes back as `{ available: false, error }`. */
export async function checkForUpdate(): Promise<UpdateCheck> {
  if (!isTauri()) return { available: false, unsupported: true };
  try {
    const { check } = await import("@tauri-apps/plugin-updater");
    const update = await check();
    if (!update) return { available: false };
    log.info("updates", `hay una versión nueva: ${update.version}`);
    return {
      available: true,
      version: update.version,
      body: update.body ?? undefined,
      install: async (onProgress) => {
        const { relaunch } = await import("@tauri-apps/plugin-process");
        let total = 0;
        let downloaded = 0;
        await update.downloadAndInstall((event) => {
          if (event.event === "Started") {
            total = event.data.contentLength ?? 0;
            onProgress(0);
          } else if (event.event === "Progress") {
            downloaded += event.data.chunkLength;
            onProgress(total > 0 ? Math.min(99, Math.round((downloaded / total) * 100)) : 0);
          } else if (event.event === "Finished") {
            onProgress(100);
          }
        });
        log.info("updates", `actualizado a ${update.version}, reiniciando`);
        await relaunch();
      },
    };
  } catch (e) {
    const message = e instanceof Error ? e.message : String(e);
    log.warn("updates", `no se pudo consultar actualizaciones: ${message}`);
    return { available: false, error: message };
  }
}
