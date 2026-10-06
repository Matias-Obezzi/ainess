// What an agent asks mid-turn: its forms reduced to fields, the answers put back, and the requests
// that wait on the user until someone answers or the run ends.
import { describe, it, expect } from "vitest";
import { formContent, formFields } from "@/lib/acp/form";
import { askLive, answerLive, cancelLiveRequests, hasLiveRequest, liveRequests } from "@/lib/live-requests";
import { eventsFromSessionUpdate } from "@/lib/acp/events";

describe("formFields", () => {
  it("reads the shape Claude's AskUserQuestion is sent in", () => {
    const fields = formFields({
      type: "object",
      required: ["q0"],
      properties: {
        q0: { type: "string", title: "Framework", oneOf: [{ const: "Vite", title: "Vite", description: "Fast" }, { const: "Next", title: "Next" }] },
        q0_other: { type: "string", title: "Other", description: "Type your own answer" },
        q1: { type: "array", title: "Extras", items: { anyOf: [{ const: "tests", title: "Tests" }, { const: "ci", title: "CI" }] } },
        n: { type: "integer", title: "Workers", default: 2 },
        ok: { type: "boolean", title: "Commit?" },
      },
    } as never);
    expect(fields.map(f => [f.key, f.kind, f.required])).toEqual([
      ["q0", "choice", true], ["q0_other", "text", false], ["q1", "multi", false], ["n", "number", false], ["ok", "boolean", false],
    ]);
    expect(fields[0].options[0]).toEqual({ value: "Vite", label: "Vite", description: "Fast" });
  });

  it("sends only what holds something, refuses a missing required answer", () => {
    const fields = formFields({ type: "object", required: ["q0"], properties: { q0: { type: "string", enum: ["a", "b"] }, n: { type: "number" } } } as never);
    expect(formContent(fields, {})).toBeNull();
    expect(formContent(fields, { q0: "a", n: "3" })).toEqual({ q0: "a", n: 3 });
    expect(formContent(fields, { q0: "b", n: "" })).toEqual({ q0: "b" });
  });
});

describe("live requests", () => {
  it("wait for an answer, and are cancelled with their run", async () => {
    const asked = askLive({ kind: "permission", runId: "r1", projectId: "p", agentId: "a", title: "Bash", options: [{ id: "ok", name: "Allow", kind: "allow_once" }] });
    const other = askLive({ kind: "form", runId: "r2", projectId: "p", agentId: "a", message: "¿Cuál?", fields: [] });
    expect(hasLiveRequest("r1")).toBe(true);

    answerLive(liveRequests().find(r => r.runId === "r1")!.id, { kind: "permission", optionId: "ok" });
    await expect(asked).resolves.toEqual({ kind: "permission", optionId: "ok" });
    expect(hasLiveRequest("r1")).toBe(false);

    cancelLiveRequests("r2");
    await expect(other).resolves.toEqual({ kind: "cancelled" });
    expect(liveRequests()).toEqual([]);
  });
});

describe("the agent's plan, thinking and commands", () => {
  it("become events of their own", () => {
    expect(eventsFromSessionUpdate({ sessionUpdate: "agent_thought_chunk", content: { type: "text", text: "Mirando el repo" } } as never))
      .toEqual([{ type: "thinking", text: "Mirando el repo" }]);
    expect(eventsFromSessionUpdate({ sessionUpdate: "plan", entries: [{ content: "Leer", status: "completed", priority: "high" }] } as never))
      .toEqual([{ type: "plan", entries: [{ content: "Leer", status: "completed", priority: "high" }] }]);
    expect(eventsFromSessionUpdate({ sessionUpdate: "available_commands_update", availableCommands: [{ name: "review", description: "Review", input: { hint: "pr number" } }, { name: "init", description: "Init" }] } as never))
      .toEqual([{ type: "commands", commands: [{ name: "review", description: "Review", hint: "pr number" }, { name: "init", description: "Init" }] }]);
  });
});
