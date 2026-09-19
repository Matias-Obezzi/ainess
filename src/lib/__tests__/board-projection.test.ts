// The `.ainess/` folder is the projection of the board, whichever board that is. Moving the file
// I/O behind a provider left `writeProjectFolder` inside the local one, so the day a project picked
// a remote board its agents would have stopped getting `BOARD.md` in their prompt — the board would
// have been fine and the agents blind. The projection lives in `saveTasks` now, and it is written
// from the list the provider gave back: what ended up on the board after the merge, not only what
// this process had in memory.
import { describe, it, expect, vi, beforeEach } from "vitest";
import { filePath } from "@/lib/project-folder";
import { saveTasks } from "@/lib/task-store";
import { createTask } from "@/lib/tasks";
import { setTransport } from "@/lib/transport";
import { nullTransport } from "@/lib/transport-null";
import { useAppStore } from "@/store";
import type { Project, Task } from "@/types";

/** What the board does with the save in the test at hand. Installed by each one. */
let save: (projectId: string, tasks: Task[]) => Promise<Task[]>;

// A board that is not the local one, to prove the projection does not depend on the provider.
vi.mock("@/lib/board/registry", () => ({
  boardProviderFor: () => ({
    id: "github-projects",
    load: async () => [],
    save: (projectId: string, tasks: Task[]) => save(projectId, tasks),
  }),
}));

const project: Project = { id: "p1", name: "tienda", workspaceDir: "C:\\repos\\tienda", createdAt: 1, agents: [] };
const boardFile = filePath(project.workspaceDir, "BOARD.md");
const task = (title: string): Task => createTask({ projectId: project.id, title });

/** Records what was written where, without touching a disk. */
function recording() {
  const written = new Map<string, string>();
  setTransport({
    ...nullTransport,
    readFileAbs: async () => null,
    writeFileAbs: async (path: string, content: string) => { written.set(path, content); },
  });
  return written;
}

function seed(tasks: Task[]) {
  useAppStore.setState(state => ({
    tasks: { ...state.tasks, [project.id]: tasks },
    config: { ...state.config, projects: [project] },
  }));
}

beforeEach(() => {
  useAppStore.setState({ tasks: {} });
  save = async (_projectId, tasks) => tasks;
});

describe("the local projection of the board", () => {
  it("is written with the list the board gave back, not with the one it was given", async () => {
    const written = recording();
    const mine = task("Cupones");
    // The card another process added while we were saving: it comes back out of `save`.
    const theirs = task("Cachear el catálogo");
    save = async () => [mine, theirs];
    seed([mine]);

    await saveTasks(project.id);

    const board = written.get(boardFile) ?? "";
    expect(board).toContain("Cupones");
    expect(board).toContain("Cachear el catálogo");
  });

  it("is written even when the board refuses the save", async () => {
    const written = recording();
    const mine = task("Cupones");
    save = async () => { throw new Error("the remote board answered 401"); };
    seed([mine]);

    await saveTasks(project.id);

    // A board that rejects the write leaves the cards stale, never the agents without a board.
    expect(written.get(boardFile) ?? "").toContain("Cupones");
  });

  it("writes the three files of the folder for a board that is not the local one", async () => {
    const written = recording();
    seed([task("Cupones")]);

    await saveTasks(project.id);

    for (const name of ["BOARD.md", "AGENTS.md", "README.md"]) {
      expect(written.has(filePath(project.workspaceDir, name))).toBe(true);
    }
  });
});
