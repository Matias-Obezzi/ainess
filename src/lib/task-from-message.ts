// "Crear tarea con esto": turns a message from the orchestrator thread or from a chat into a card
// on the board. Lives outside the components because both threads offer the same action and the
// toast that follows it has to read the same everywhere.
import { useAppStore } from "@/store";
import { toast } from "@/components/ui/toast";
import { taskTitleFromText } from "@/lib/tasks";
import { translateNow } from "@/i18n/useT";

export interface TaskFromMessage {
  projectId: string;
  /** The whole message; its first line becomes the title and all of it the detail. */
  text: string;
  /** Author of the message when it is an agent; the user's own messages leave the task unassigned. */
  agentId?: string;
  /** Run the message came from, so the detail can walk back to it. */
  runId?: string;
}

/** Creates the task in the backlog and offers to go to the board. Does nothing on an empty message. */
export function createTaskFromMessage({ projectId, text, agentId, runId }: TaskFromMessage): void {
  const title = taskTitleFromText(text);
  if (!title) return;
  const store = useAppStore.getState();
  store.addTask(projectId, {
    title,
    detail: text,
    status: "backlog",
    agentId,
    runId,
  });
  toast.success(translateNow("tasks.createdFromMessage"), {
    description: title,
    action: {
      label: translateNow("tasks.goToBoard"),
      onClick: () => useAppStore.getState().openProject(projectId, null),
    },
  });
}
