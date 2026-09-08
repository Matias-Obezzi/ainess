// The preamble goes once. A resumed session already read it — the CLI carries the conversation
// forward — so sending it again every turn was paying for the same paragraphs over and over, and
// with the providers that take the instructions inside the prompt it left a copy of them in the
// transcript for good.
import { describe, it, expect } from "vitest";
import { PROVIDERS, buildSystemPrompt } from "@/lib/providers";
import type { AgentConfig, Task } from "@/types";

const agent = (over: Partial<AgentConfig> = {}): AgentConfig => ({
  id: "a1",
  name: "Planner",
  provider: "claude",
  role: "planner",
  parentId: null,
  autoApprove: false,
  ...over,
});

const worker = agent({ id: "a2", name: "Obrero", role: "implementer", parentId: "a1" });
const extras = { skills: [], sharedContext: "" };

const task = (over: Partial<Task> = {}): Task => ({
  id: "t1",
  projectId: "p1",
  title: "Arreglar el login",
  status: "backlog",
  createdAt: 1,
  ...over,
} as Task);

describe("a resumed turn", () => {
  it("drops the description the first turn already gave", () => {
    const first = buildSystemPrompt(agent(), [worker], {
      ...extras,
      sharedContext: "El repo usa pnpm y los tests corren con vitest.",
      profile: { name: "Matías", about: "Trabaja de noche", preferences: "Respuestas cortas" },
    });
    const again = buildSystemPrompt(agent(), [worker], { ...extras, resuming: true });
    expect(again.length).toBeLessThan(first.length);
    expect(again).not.toContain("pnpm");
    expect(again).not.toContain("Matías");
  });

  it("keeps the blocks the agent acts through, whatever the CLI did to its own context", () => {
    // Not description: without these it cannot reach its team or ask anything, and a CLI that
    // compacts a long session will summarise them away if they only went once.
    const again = buildSystemPrompt(agent(), [worker], { ...extras, resuming: true });
    expect(again).toContain("```delegate");
    expect(again).toContain("```ask");
  });

  it("still carries the board, which is the part that changes between turns", () => {
    const prompt = buildSystemPrompt(agent(), [worker], { ...extras, resuming: true, tasks: [task()] });
    expect(prompt).toContain("Arreglar el login");
  });

  it("gives an agent with no team the way to ask, and no way to delegate", () => {
    const prompt = buildSystemPrompt(worker, [], { ...extras, resuming: true });
    expect(prompt).toContain("```ask");
    expect(prompt).not.toContain("```delegate");
  });

  it("says nothing to a custom agent, whose protocol is its own", () => {
    const custom = agent({ role: "custom" });
    expect(buildSystemPrompt(custom, [], { ...extras, resuming: true })).toBe("");
  });

  it("keeps saying who is writing, because that changes turn to turn", () => {
    const prompt = buildSystemPrompt(worker, [], { ...extras, resuming: true, fromUser: true });
    expect(prompt).toContain("Obrero");
  });

  it("leaves the agent's own extra instructions out: they were sent on the first turn", () => {
    const custom = agent({ systemPrompt: "Escribí siempre en verso." });
    expect(buildSystemPrompt(custom, [worker], { ...extras, resuming: true })).not.toContain("verso");
  });
});

describe("a session that starts over", () => {
  it("is pointed at the history file instead of being handed the transcript", () => {
    const prompt = buildSystemPrompt(worker, [], { ...extras, historyFile: ".ainess/history/obrero-a2.md" });
    expect(prompt).toContain(".ainess/history/obrero-a2.md");
  });

  it("says nothing about a history that is not there", () => {
    expect(buildSystemPrompt(worker, [], extras)).not.toContain(".ainess/history");
  });
});

describe("the providers that take the instructions inside the prompt", () => {
  const input = (systemPrompt: string) => ({
    agent: agent({ provider: "opencode", model: "google/gemini-3-flash" }),
    prompt: "seguí con lo de antes",
    systemPrompt,
    cwd: "C:/repo",
    binaryPath: "opencode",
  });

  it("writes the two headers when there is something to put under them", () => {
    const built = PROVIDERS.opencode.buildCommand(input("Sos el PLANIFICADOR."));
    expect(built.stdinText).toContain("## Instrucciones del sistema");
    expect(built.stdinText).toContain("## Tarea");
  });

  it("sends the task alone when the preamble is empty", () => {
    const built = PROVIDERS.opencode.buildCommand(input(""));
    expect(built.stdinText).toBe("seguí con lo de antes");
  });
});
