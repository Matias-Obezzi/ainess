// The seam between the board and wherever its cards actually live. A project's board is a view of
// the work and never a gate: the orchestrator delegates, runs and answers without asking this
// interface anything, so a remote provider that is slow, unreachable or unauthorised can leave the
// board stale but can never stop an agent from working.
//
// Only the local provider is implemented today (see ./local.ts); the remote ids are declared in
// ../../types.ts so the seam and the picker are real and a provider can be added here without
// reshaping the persistence around it.
import type { BoardProviderId, Task } from "@/types";

export interface BoardProvider {
  readonly id: BoardProviderId;
  /** Reads the project's tasks. */
  load(projectId: string): Promise<Task[]>;
  /** Persists the whole list. The local one writes a file; a remote one diffs against what it
   *  last saw and sends only what moved. */
  save(projectId: string, tasks: Task[]): Promise<void>;
  /** Watches for changes made elsewhere and returns an unsubscribe. A local board has nobody
   *  else writing to it, so it does not implement this. */
  watch?(projectId: string, onChange: (tasks: Task[]) => void): () => void;
}
