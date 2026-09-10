// Reads a project's manifests to find out what it can be told to run.
//
// The parsing lives in `lib/project-commands.ts`; this is only the reading, which is the part that
// needs a filesystem. It runs when the terminals panel opens (the section only mounts then), so a
// script added while the app is running shows up the next time the panel is opened rather than
// needing a restart.
import { useEffect, useState } from "react";
import { getTransport } from "@/lib/transport";
import { projectCommands, type ProjectCommand } from "@/lib/project-commands";

/** Lockfiles, in no particular order: `packageRunner` decides which one wins. */
const LOCKFILES = ["pnpm-lock.yaml", "bun.lockb", "bun.lock", "yarn.lock", "package-lock.json"];
const MANIFESTS = ["package.json", "Cargo.toml", "Makefile"];

/** Joins without importing a path module: Rust takes `/` on Windows too. */
function join(dir: string, name: string): string {
  return /[\\/]$/.test(dir) ? `${dir}${name}` : `${dir}/${name}`;
}

export function useProjectCommands(workspaceDir: string | undefined): ProjectCommand[] {
  const [commands, setCommands] = useState<ProjectCommand[]>([]);

  useEffect(() => {
    if (!workspaceDir) {
      setCommands([]);
      return;
    }

    // Guards against a slow read landing after the user has moved to another project and painting
    // that project's buttons under this one's name.
    let current = true;

    void (async () => {
      const transport = getTransport();
      const wanted = [...MANIFESTS, ...LOCKFILES].map(name => join(workspaceDir, name));

      // Asked for all at once, and none of them read: a lockfile is only interesting for its name,
      // and reading a big one to learn that would be the slowest possible way to find out.
      const present = new Set(await transport.filesExistAbs(wanted));
      if (!current) return;

      const has = (name: string) => present.has(join(workspaceDir, name));
      const read = async (name: string) => (has(name) ? await transport.readFileAbs(join(workspaceDir, name)) : null);

      const [packageJson, makefile] = await Promise.all([read("package.json"), read("Makefile")]);
      if (!current) return;

      setCommands(projectCommands({
        packageJson,
        lockfiles: LOCKFILES.filter(has),
        hasCargo: has("Cargo.toml"),
        makefile,
      }));
    })();

    return () => { current = false; };
  }, [workspaceDir]);

  return commands;
}
