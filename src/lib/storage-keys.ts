/**
 * A value under its current key, or under the name it had before the app was called `ainess`.
 *
 * The rename cannot cost somebody the draft they left in the box or the width they dragged a
 * panel to. There is no migration step to run at boot because the store reads some of these while
 * its own module is still being evaluated — so the fallback lives in the read instead, and the
 * next write lands under the new name and settles it.
 */
export function readWithLegacy(storage: Storage, key: string, legacyKey: string): string | null {
  try {
    const val = storage.getItem(key);
    if (val !== null) return val;
    return storage.getItem(legacyKey);
  } catch {
    return null;
  }
}
