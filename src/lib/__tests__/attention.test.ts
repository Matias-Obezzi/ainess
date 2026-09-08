import { describe, it, expect } from "vitest";
import { attentionItems, workingItems, countsByProject } from "../attention";
import type { Approval, AgentQuestion, Task, Project, AgentRuntime, Run } from "@/types";

describe("attention", () => {
  const p1: Project = { id: "p1", name: "P1", workspaceDir: "", createdAt: 0, agents: [] };
  const p2: Project = { id: "p2", name: "P2", workspaceDir: "", createdAt: 0, agents: [] };

  describe("attentionItems", () => {
    it("junta las tres fuentes y las ordena por fecha, la más reciente primero", () => {
      const approvals: Record<string, Approval> = {
        a1: { id: "a1", projectId: "p1", kind: "delegation", agentId: "ag1", summary: "App1", payload: {} as any, createdAt: 10, status: "pending" },
      };
      const questions: Record<string, AgentQuestion> = {
        q1: { id: "q1", projectId: "p2", agentId: "ag2", runId: "", rootRunId: "", round: 0, question: "Q1", options: [], multiple: false, allowOther: false, createdAt: 30, status: "pending" },
      };
      const tasks: Record<string, Task[]> = {
        p1: [
          { id: "t1", projectId: "p1", title: "T1", status: "needs-you", dependsOn: [], createdAt: 0, updatedAt: 20, order: 0, archived: false },
        ]
      };

      const items = attentionItems({ approvals, questions, tasks, projects: [p1, p2] });
      
      expect(items).toHaveLength(3);
      // Orden: Q1 (30), T1 (20), App1 (10)
      expect(items[0]).toMatchObject({ id: "question:q1", kind: "question", title: "Q1", at: 30, projectId: "p2", agentId: "ag2" });
      expect(items[1]).toMatchObject({ id: "task:t1", kind: "task", title: "T1", at: 20, projectId: "p1" });
      expect(items[2]).toMatchObject({ id: "approval:a1", kind: "approval", title: "App1", at: 10, projectId: "p1", agentId: "ag1" });
    });

    it("ignora tarjetas archivadas y las que no están en needs-you", () => {
      const tasks: Record<string, Task[]> = {
        p1: [
          { id: "t1", projectId: "p1", title: "T1", status: "working", dependsOn: [], createdAt: 0, updatedAt: 20, order: 0, archived: false },
          { id: "t2", projectId: "p1", title: "T2", status: "needs-you", dependsOn: [], createdAt: 0, updatedAt: 30, order: 1, archived: true },
          { id: "t3", projectId: "p1", title: "T3", status: "needs-you", dependsOn: [], createdAt: 0, updatedAt: 10, order: 2, archived: false },
        ]
      };

      const items = attentionItems({ approvals: {}, questions: {}, tasks, projects: [p1] });
      expect(items).toHaveLength(1);
      expect(items[0].id).toBe("task:t3");
    });

    it("ignora todo lo que pertenece a un proyecto que ya no existe", () => {
      const approvals: Record<string, Approval> = {
        a1: { id: "a1", projectId: "deleted", kind: "delegation", agentId: "ag1", summary: "App1", payload: {} as any, createdAt: 10, status: "pending" },
      };
      const questions: Record<string, AgentQuestion> = {
        q1: { id: "q1", projectId: "deleted", agentId: "ag2", runId: "", rootRunId: "", round: 0, question: "Q1", options: [], multiple: false, allowOther: false, createdAt: 30, status: "pending" },
      };
      const tasks: Record<string, Task[]> = {
        deleted: [
          { id: "t1", projectId: "deleted", title: "T1", status: "needs-you", dependsOn: [], createdAt: 0, updatedAt: 20, order: 0, archived: false },
        ]
      };

      const items = attentionItems({ approvals, questions, tasks, projects: [p1] }); // p1 is the only live project
      expect(items).toHaveLength(0);
    });

    it("los id no chocan entre tipos aunque compartan el id crudo", () => {
      const approvals: Record<string, Approval> = {
        x: { id: "x", projectId: "p1", kind: "delegation", agentId: "ag1", summary: "App", payload: {} as any, createdAt: 10, status: "pending" },
      };
      const questions: Record<string, AgentQuestion> = {
        x: { id: "x", projectId: "p1", agentId: "ag2", runId: "", rootRunId: "", round: 0, question: "Q", options: [], multiple: false, allowOther: false, createdAt: 30, status: "pending" },
      };
      const tasks: Record<string, Task[]> = {
        p1: [
          { id: "x", projectId: "p1", title: "T", status: "needs-you", dependsOn: [], createdAt: 0, updatedAt: 20, order: 0, archived: false },
        ]
      };

      const items = attentionItems({ approvals, questions, tasks, projects: [p1] });
      expect(items).toHaveLength(3);
      const ids = items.map(i => i.id);
      expect(ids).toContain("approval:x");
      expect(ids).toContain("question:x");
      expect(ids).toContain("task:x");
    });
  });

  describe("workingItems", () => {
    it("toma working y waiting, saca el since de la corrida y manda al final a los que no tienen", () => {
      const runtime: Record<string, Record<string, AgentRuntime>> = {
        p1: {
          ag1: { agentId: "ag1", status: "working", currentRunId: "r1", queuedInstructions: [] },
          ag2: { agentId: "ag2", status: "idle", currentRunId: "r2", queuedInstructions: [] },
          ag3: { agentId: "ag3", status: "waiting", currentRunId: "r3", queuedInstructions: [] },
          ag4: { agentId: "ag4", status: "working", queuedInstructions: [] }, // No runId -> no since
        },
        p2: {
          ag5: { agentId: "ag5", status: "working", currentRunId: "r5", queuedInstructions: [] },
        }
      };

      const runs: Record<string, Run> = {
        r1: { id: "r1", startedAt: 100 } as Run,
        r3: { id: "r3", startedAt: 50 } as Run,
        r5: { id: "r5", startedAt: 75 } as Run,
      };

      const items = workingItems({ runtime, runs, projects: [p1, p2] });
      
      expect(items).toHaveLength(4);
      // ag2 is idle, should be ignored.
      // Order by since asc: ag3 (50), ag5 (75), ag1 (100), ag4 (undefined, last)
      expect(items[0]).toMatchObject({ agentId: "ag3", since: 50 });
      expect(items[1]).toMatchObject({ agentId: "ag5", since: 75 });
      expect(items[2]).toMatchObject({ agentId: "ag1", since: 100 });
      expect(items[3]).toMatchObject({ agentId: "ag4", since: undefined });
    });
  });

  describe("countsByProject", () => {
    it("cuenta bien con varios proyectos y no inventa entradas vacías", () => {
      const att = [
        { id: "1", kind: "task" as const, projectId: "p1", title: "1", at: 1 },
        { id: "2", kind: "task" as const, projectId: "p1", title: "2", at: 1 },
        { id: "3", kind: "question" as const, projectId: "p2", title: "3", at: 1 },
      ];
      
      const work = [
        { projectId: "p1", agentId: "ag1" },
        { projectId: "p3", agentId: "ag2" },
        { projectId: "p3", agentId: "ag3" },
      ];

      const counts = countsByProject(att, work);

      // p1 should have 2 needsYou, 1 working
      expect(counts.p1).toEqual({ needsYou: 2, working: 1 });
      // p2 should have 1 needsYou, 0 working
      expect(counts.p2).toEqual({ needsYou: 1, working: 0 });
      // p3 should have 0 needsYou, 2 working
      expect(counts.p3).toEqual({ needsYou: 0, working: 2 });
      // p4 shouldn't be there
      expect(counts.p4).toBeUndefined();
    });
  });
});
