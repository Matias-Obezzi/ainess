import { readWithLegacy } from "@/lib/storage-keys";

// The version this machine last ran, so an update can say what it brought.
//
// It lives in localStorage and not in the config: it is about this installation, it is worthless
// to anyone reading the config file, and putting it there would mean a migration for a string
// nothing else ever asks about.
const KEY = "ainess.lastSeenVersion";
const LEGACY_KEY = "ais.lastSeenVersion";

/** What ran here last, or null on a machine that never ran this app (or a private window). */
export function lastSeenVersion(): string | null {
  return readWithLegacy(localStorage, KEY, LEGACY_KEY);
}

export function rememberSeenVersion(version: string): void {
  try {
    localStorage.setItem(KEY, version);
  } catch {
    /* private mode: the changelog just never opens by itself */
  }
}
