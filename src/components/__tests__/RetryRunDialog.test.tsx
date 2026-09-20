// "Retry with…" appears on every finished run, not only on the ones that failed.
//
// Retrying a run that ended well runs work that is already done: it can delegate again, or commit
// again. So that case asks first, and the case the button was made for — error, killed — still goes
// with one click. Never as a deletion: a retry adds work, it does not take anything away.
import { describe, it, expect, beforeEach, vi } from "vitest";
import { render, screen, resetStore, fireEvent, waitFor } from "@/test/render";
import { useAppStore } from "@/store";
import { RetryRunDialog } from "../RetryRunDialog";
import type { AgentConfig, Project, Run, RunStatus } from "@/types";

const retryRun = vi.fn();
const confirm = vi.fn();

vi.mock("@/lib/orchestrator", async (original) => ({
  ...(await original<typeof import("@/lib/orchestrator")>()),
  retryRun: (...args: unknown[]) => retryRun(...args),
}));
vi.mock("@/lib/confirm", () => ({ confirm: (...args: unknown[]) => confirm(...args) }));

const agent: AgentConfig = {
  id: "a1",
  name: "Implementador",
  provider: "claude",
  role: "implementer",
  parentId: null,
  autoApprove: false,
};

const project: Project = { id: "p1", name: "P", workspaceDir: "C:/p", createdAt: 1, agents: [agent] };

function seed(status: RunStatus) {
  const run: Run = {
    id: "r1", projectId: "p1", agentId: "a1", parentRunId: null, rootRunId: "r1",
    prompt: "arreglá el parser", status, startedAt: 1000, endedAt: 2000,
    output: "", rawLines: [], childRunIds: [], round: 0,
  };
  useAppStore.setState(state => ({ runs: { r1: run }, config: { ...state.config, projects: [project] } }));
}

const confirmButton = () => screen.getAllByRole("button", { name: /reintentar/i }).at(-1)!;

beforeEach(() => {
  resetStore();
  retryRun.mockReset();
  confirm.mockReset().mockResolvedValue(true);
});

describe("retrying a run that failed", () => {
  it("goes with one click, nothing to confirm", async () => {
    seed("error");
    render(<RetryRunDialog runId="r1" open onOpenChange={() => {}} />);
    fireEvent.click(confirmButton());

    await waitFor(() => expect(retryRun).toHaveBeenCalledWith("r1", { agentId: "a1", model: undefined }));
    expect(confirm).not.toHaveBeenCalled();
  });

  it("goes with one click for a run the user stopped", async () => {
    seed("killed");
    render(<RetryRunDialog runId="r1" open onOpenChange={() => {}} />);
    fireEvent.click(confirmButton());

    await waitFor(() => expect(retryRun).toHaveBeenCalled());
    expect(confirm).not.toHaveBeenCalled();
  });
});

describe("retrying a run that ended well", () => {
  it("asks first, and does not colour the question as a deletion", async () => {
    seed("done");
    render(<RetryRunDialog runId="r1" open onOpenChange={() => {}} />);
    fireEvent.click(confirmButton());

    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(confirm.mock.calls[0][0].destructive).toBeUndefined();
    // What it is about is in the question: the work it is about to do a second time.
    expect(confirm.mock.calls[0][0].description).toContain("arreglá el parser");
  });

  it("runs it again once the user says yes", async () => {
    seed("done");
    render(<RetryRunDialog runId="r1" open onOpenChange={() => {}} />);
    fireEvent.click(confirmButton());

    await waitFor(() => expect(retryRun).toHaveBeenCalledWith("r1", { agentId: "a1", model: undefined }));
  });

  it("does nothing at all when the user says no", async () => {
    confirm.mockResolvedValue(false);
    seed("done");
    render(<RetryRunDialog runId="r1" open onOpenChange={() => {}} />);
    fireEvent.click(confirmButton());

    await waitFor(() => expect(confirm).toHaveBeenCalled());
    expect(retryRun).not.toHaveBeenCalled();
  });
});
