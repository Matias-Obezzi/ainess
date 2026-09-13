// Where a project's repository is, which is not always where the project is.
//
// A project used to be its repository: one folder, `.git` at the top. But a folder made for a
// project — the repo in a subfolder, the agents' worktrees next to it, the app's own `.ainess/`
// beside them — is the tidier way to keep one, and picking that folder used to make the app say
// "not a repository" and run every agent in the wrong place. So a project has a workspace (what
// you picked, where `.ainess/` and the attachments live) and a repo (where git is), and the two
// are the same folder in the common case and one level apart in the other.
import { getTransport } from "@/lib/transport";
import { isGitRepo } from "@/lib/worktree";
import type { Project } from "@/types";

/** Where git runs and agents work: the repo when it was found below the workspace, else the workspace. */
export function repoDirOf(project: Pick<Project, "workspaceDir" | "repoDir">): string {
  return project.repoDir || project.workspaceDir;
}

/** Folders never worth looking into for a repository. */
const SKIP = new Set(["node_modules", "target", "dist", "build", "out"]);

/** The last segment of a path, whichever slash it uses. */
function baseName(path: string): string {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? path;
}

/**
 * The repository behind `workspaceDir`: the folder itself when it is one, otherwise the first
 * subfolder that is — one level down, no deeper, and not inside a dependency or build folder.
 * Null when there is none, which is a project that simply is not on git.
 */
export async function findRepoDir(workspaceDir: string): Promise<string | null> {
  if (!workspaceDir) return null;
  if (await isGitRepo(workspaceDir)) return workspaceDir;
  let children: string[];
  try {
    children = await getTransport().listSubdirs(workspaceDir);
  } catch {
    return null;
  }
  for (const child of children) {
    const name = baseName(child);
    if (name.startsWith(".") || SKIP.has(name)) continue;
    if (await isGitRepo(child)) return child;
  }
  return null;
}
