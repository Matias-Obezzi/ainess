import type { AppConfig } from "@/types";

/**
 * Collections in the config whose items carry an `id`. They are merged item by item so two
 * processes (the app, `ainess run`, `ainess serve`) can each add or remove entries without one wiping
 * the other's work when it saves its own copy of the file.
 */
const ID_COLLECTIONS = ["projects", "formations", "chats", "skills", "mcpServers", "hooks", "presets"] as const;
type IdCollection = (typeof ID_COLLECTIONS)[number];

type Item = { id: string };

function mergeCollection(disk: Item[], mem: Item[], base: Item[]): Item[] {
  const memIds = new Set(mem.map(i => i.id));
  const baseIds = new Set(base.map(i => i.id));
  // Present when we loaded, gone now: this process deleted it, so the disk copy must not revive it.
  const deletedByMe = new Set([...baseIds].filter(id => !memIds.has(id)));
  const fromOthers = disk.filter(i => !memIds.has(i.id) && !deletedByMe.has(i.id));
  return [...mem, ...fromOthers];
}

/**
 * Three-way merge of the config: what this process has in memory (`mem`) wins for everything
 * it knows about; items other processes added since we loaded (`base`) survive; items we
 * deleted stay deleted. Scalars and non-id collections come from memory.
 */
export function mergeConfig(disk: AppConfig | null, mem: AppConfig, base: AppConfig | null): AppConfig {
  if (!disk) return mem;
  const out: AppConfig = { ...mem };
  for (const key of ID_COLLECTIONS) {
    const d = (disk[key] as Item[] | undefined) ?? [];
    const m = (mem[key] as Item[] | undefined) ?? [];
    const b = (base?.[key] as Item[] | undefined) ?? m;
    (out as Record<IdCollection, Item[]>)[key] = mergeCollection(d, m, b);
  }
  if (disk.messaging || mem.messaging) {
    out.messaging = { ...disk.messaging, ...mem.messaging };
  }
  return out;
}
