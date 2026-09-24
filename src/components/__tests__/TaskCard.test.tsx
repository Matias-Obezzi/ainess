// When a planner delegates several tasks to the same agent in one go, startRun queues the runs
// behind the active one. The cards all sit in "working", but only one has a running process: the
// rest are queued. The card's status row says "queued" instead of "working" when its run is
// waiting its turn, so three queued cards do not look like three concurrent workers.
import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, resetStore } from "@/test/render";
import { useAppStore } from "@/store";
import { TaskCard } from "../tasks/TaskCard";
import { taskStatusMeta } from "../tasks/task-meta";
import { translateNow } from "@/i18n/useT";
import type { Run, Task } from "@/types";

const baseTask: Task = {
  id: "t1",
  projectId: "p1",
  title: "Implement feature",
  status: "working",
  dependsOn: [],
  runId: "r1",
  createdAt: 1000,
  updatedAt: 1000,
  order: 0,
  archived: false,
};

function baseRun(status: "running" | "queued"): Run {
  return {
    id: "r1",
    projectId: "p1",
    agentId: "a1",
    parentRunId: null,
    rootRunId: "r1",
    prompt: "Work on feature",
    status,
    startedAt: 1000,
    output: "",
    rawLines: [],
    childRunIds: [],
    round: 0,
  };
}

const defaultProps = {
  blocked: 0,
  dragging: false,
  onOpen: () => {},
  onDragStart: () => {},
  onDragOver: () => {},
  onDragEnd: () => {},
};

const workingDotClass = taskStatusMeta.working.dot.split(" ")[0];

describe("TaskCard", () => {
  beforeEach(() => {
    resetStore();
    useAppStore.setState(state => ({
      config: {
        ...state.config,
        language: "es",
      },
    }));
  });

  it("shows working label when its run is running", () => {
    useAppStore.setState({
      runs: { r1: baseRun("running") },
    });

    const { container } = render(<TaskCard {...defaultProps} task={baseTask} />);

    expect(screen.getByText(translateNow("task.status.working"))).toBeInTheDocument();
    expect(screen.queryByText(translateNow("task.status.queued"))).not.toBeInTheDocument();
    expect(container.querySelector(`.${workingDotClass}`)).toBeInTheDocument();
    expect(container.querySelector(".bg-muted-foreground")).not.toBeInTheDocument();
  });

  it("shows queued label when its run is queued", () => {
    useAppStore.setState({
      runs: { r1: baseRun("queued") },
    });

    const { container } = render(<TaskCard {...defaultProps} task={baseTask} />);

    expect(screen.getByText(translateNow("task.status.queued"))).toBeInTheDocument();
    expect(screen.queryByText(translateNow("task.status.working"))).not.toBeInTheDocument();
    expect(container.querySelector(".bg-muted-foreground")).toBeInTheDocument();
    expect(container.querySelector(`.${workingDotClass}`)).not.toBeInTheDocument();
  });
});
