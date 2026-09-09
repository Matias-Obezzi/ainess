import { describe, it, expect, beforeEach } from "vitest";
import { parseTaskOps, buildSystemPrompt } from "@/lib/providers";
import { applyTaskOps, cardForNextRun } from "@/lib/task-sync";
import { translateNow } from "@/i18n/useT";
import { useAppStore } from "@/store";
import type { AgentConfig, Run } from "@/types";

describe("task-block", () => {
  describe("parseTaskOps", () => {
    it("parses a simple update", () => {
      const text = '```task\n{"status":"working","detail":"progreso"}\n```';
      expect(parseTaskOps(text)).toEqual([{ kind: "update", status: "working", detail: "progreso" }]);
    });

    it("parses a simple create", () => {
      const text = '```task\n{"new":"Nueva tarea","detail":"detalles","priority":"high"}\n```';
      expect(parseTaskOps(text)).toEqual([
        { kind: "create", title: "Nueva tarea", detail: "detalles", priority: "high" },
      ]);
    });

    it("parses the {tasks:[...]} form", () => {
      const text = '```task\n{"tasks":[{"new":"T1"},{"status":"ready"}]}\n```';
      expect(parseTaskOps(text)).toEqual([
        { kind: "create", title: "T1" },
        { kind: "update", status: "ready" },
      ]);
    });

    it("parses a loose array", () => {
      const text = '```task\n[{"new":"T2"},{"status":"needs-you","detail":"bloqueado"}]\n```';
      expect(parseTaskOps(text)).toEqual([
        { kind: "create", title: "T2" },
        { kind: "update", status: "needs-you", detail: "bloqueado" },
      ]);
    });

    it("discards status: 'done' but keeps detail from the same block", () => {
      const text = '```task\n{"status":"done","detail":"completado"}\n```';
      expect(parseTaskOps(text)).toEqual([{ kind: "update", detail: "completado" }]);

      const textOnlyDone = '```task\n{"status":"done"}\n```';
      expect(parseTaskOps(textOnlyDone)).toEqual([]);
    });

    it("returns an empty array on broken JSON without throwing", () => {
      const text = '```task\n{ invalid json : true \n```';
      expect(() => parseTaskOps(text)).not.toThrow();
      expect(parseTaskOps(text)).toEqual([]);
    });

    it("parses two blocks in the same text in order", () => {
      const text = 'texto antes\n```task\n{"status":"working"}\n```\nmedio\n```task\n{"new":"Otra tarea"}\n```\nfin';
      expect(parseTaskOps(text)).toEqual([
        { kind: "update", status: "working" },
        { kind: "create", title: "Otra tarea" },
      ]);
    });

    it("does not prematurely cut a block when closing fence does not start a line", () => {
      const text = '```task\n{"new":"Fix ``` in markdown","detail":"has ```code``` inside"}\n```';
      expect(parseTaskOps(text)).toEqual([
        { kind: "create", title: "Fix ``` in markdown", detail: "has ```code``` inside" },
      ]);
    });
  });

  describe("buildSystemPrompt", () => {
    const fakeAgent: AgentConfig = {
      id: "agent-1",
      name: "Agent",
      provider: "claude",
      role: "implementer",
      autoApprove: false,
      parentId: null,
    };

    it("includes task section header if canNote is true", () => {
      const prompt = buildSystemPrompt(fakeAgent, [], { skills: [], canNote: true, sharedContext: "" });
      expect(prompt).toContain(translateNow("prompt.task.header"));
      expect(prompt).toContain("```task");
    });

    it("excludes task section if canNote is false or undefined", () => {
      const promptFalse = buildSystemPrompt(fakeAgent, [], { skills: [], canNote: false, sharedContext: "" });
      expect(promptFalse).not.toContain(translateNow("prompt.task.header"));

      const promptUndef = buildSystemPrompt(fakeAgent, [], { skills: [], sharedContext: "" });
      expect(promptUndef).not.toContain(translateNow("prompt.task.header"));
    });

    it("includes task section when resuming with canNote", () => {
      const prompt = buildSystemPrompt(fakeAgent, [], {
        skills: [],
        canNote: true,
        resuming: true,
        sharedContext: "",
      });
      expect(prompt).toContain(translateNow("prompt.task.header"));
      expect(prompt).toContain("```task");
    });

    it("includes card line when card extra is provided", () => {
      const prompt = buildSystemPrompt(fakeAgent, [], {
        skills: [],
        canNote: true,
        sharedContext: "",
        card: { id: "12345678-abcd", title: "Mi tarjeta", status: "working" },
      });
      expect(prompt).toContain(translateNow("prompt.task.header"));
      expect(prompt).toContain("12345678");
      expect(prompt).toContain("Mi tarjeta");
    });
  });

  describe("applyTaskOps", () => {
    const run: Run = {
      id: "run-test-1",
      rootRunId: "run-test-1",
      parentRunId: null,
      agentId: "agent-worker",
      projectId: "proj-test",
      prompt: "haz algo",
      output: "",
      status: "running",
      round: 1,
      startedAt: Date.now(),
      rawLines: [],
      childRunIds: [],
    };

    beforeEach(() => {
      useAppStore.setState({
        config: {
          ...useAppStore.getState().config,
          projects: [{
            id: "proj-test",
            name: "Test Project",
            workspaceDir: "/test",
            createdAt: Date.now(),
            agents: [
              {
                id: "agent-worker",
                name: "WorkerAgent",
                role: "implementer",
                provider: "claude",
                autoApprove: false,
                parentId: null,
              },
            ],
          }],
        },
        tasks: {
          "proj-test": [{
            id: "card-1",
            projectId: "proj-test",
            title: "Tarjeta original",
            detail: "Detalle existente",
            status: "working",
            dependsOn: [],
            runId: "run-test-1",
            order: 0,
            archived: false,
            createdAt: Date.now(),
            updatedAt: Date.now(),
          }],
        },
      });
    });

    it("applies update to existing card and appends detail", () => {
      const ops = applyTaskOps(run, [
        { kind: "update", status: "needs-you", detail: "me trabé con la API" },
      ]);
      expect(ops).toHaveLength(1);
      const updated = useAppStore.getState().tasks["proj-test"][0];
      expect(updated.status).toBe("needs-you");
      expect(updated.detail).toBe("Detalle existente\n\nme trabé con la API");
    });

    it("ignores update if card is not found for the run", () => {
      const otherRun = { ...run, id: "run-other" };
      const ops = applyTaskOps(otherRun, [{ kind: "update", status: "ready" }]);
      expect(ops).toEqual([]);
    });

    it("creates a new backlog task without agentId and with attribution in detail", () => {
      const ops = applyTaskOps(run, [
        { kind: "create", title: "Nueva tarea descubierta", detail: "explicación", priority: "high" },
      ]);
      expect(ops).toHaveLength(1);
      const tasks = useAppStore.getState().tasks["proj-test"];
      const created = tasks.find(t => t.title === "Nueva tarea descubierta");
      expect(created).toBeDefined();
      expect(created?.status).toBe("backlog");
      expect(created?.priority).toBe("high");
      expect(created?.agentId).toBeUndefined();
      expect(created?.detail).toContain(translateNow("task.proposedBy", { agent: "WorkerAgent" }));
      expect(created?.detail).toContain("explicación");
    });
  });

  // The run that is starting has no id anybody knows yet, so the card has to be found through the
  // run that came before it. Getting this wrong is silent: the prompt simply never names a card.
  describe("cardForNextRun", () => {
    const previous: Run = {
      id: "run-1",
      rootRunId: "root-1",
      parentRunId: "root-1",
      agentId: "agent-worker",
      projectId: "proj-test",
      prompt: "hacé algo",
      output: "",
      status: "done",
      round: 0,
      startedAt: Date.now(),
      rawLines: [],
      childRunIds: [],
    };

    const card = {
      id: "card-1",
      projectId: "proj-test",
      title: "Tarjeta original",
      status: "working" as const,
      dependsOn: [],
      runId: "run-1",
      order: 0,
      archived: false,
      createdAt: Date.now(),
      updatedAt: Date.now(),
    };

    beforeEach(() => {
      useAppStore.setState({ runs: { "run-1": previous }, tasks: { "proj-test": [card] } });
    });

    it("finds the card the previous run of the same lineage left behind", () => {
      const found = cardForNextRun({ projectId: "proj-test", agentId: "agent-worker", rootRunId: "root-1" });
      expect(found?.id).toBe("card-1");
    });

    it("has nothing to find for a first run, which has no lineage yet", () => {
      expect(cardForNextRun({ projectId: "proj-test", agentId: "agent-worker", rootRunId: undefined })).toBeUndefined();
      expect(cardForNextRun({ projectId: "proj-test", agentId: "someone-else", rootRunId: "root-1" })).toBeUndefined();
      expect(cardForNextRun({ projectId: "proj-test", agentId: "agent-worker", rootRunId: "other-root" })).toBeUndefined();
    });

    it("names none rather than the wrong one when the agent holds two cards under the same root", () => {
      const second = { ...previous, id: "run-2" };
      useAppStore.setState({
        runs: { "run-1": previous, "run-2": second },
        tasks: { "proj-test": [card, { ...card, id: "card-2", runId: "run-2" }] },
      });
      expect(cardForNextRun({ projectId: "proj-test", agentId: "agent-worker", rootRunId: "root-1" })).toBeUndefined();
    });

    it("skips an archived card", () => {
      useAppStore.setState({ tasks: { "proj-test": [{ ...card, archived: true }] } });
      expect(cardForNextRun({ projectId: "proj-test", agentId: "agent-worker", rootRunId: "root-1" })).toBeUndefined();
    });
  });
});
