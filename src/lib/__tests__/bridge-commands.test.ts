import { describe, it, expect, beforeEach } from "vitest";
import { parseBridgeCommand } from "@/lib/bridge/commands";
import { isAllowed, resolveId, sendToChat } from "@/lib/bridge";
import { useAppStore } from "@/store";
import { getTransport, setTransport } from "@/lib/transport";

describe("parseBridgeCommand", () => {
  it("reads plain text as something to do", () => {
    expect(parseBridgeCommand("arreglá el login")).toEqual({ kind: "prompt", text: "arreglá el login" });
  });

  it("keeps the line breaks of what was written", () => {
    const text = ["mirá esto:", "", "- uno", "- dos"].join("\n");
    expect(parseBridgeCommand(text)).toEqual({ kind: "prompt", text });
  });

  it("takes the plain commands", () => {
    expect(parseBridgeCommand("/status")).toEqual({ kind: "status" });
    expect(parseBridgeCommand("  /tasks  ")).toEqual({ kind: "tasks" });
    expect(parseBridgeCommand("/STOP")).toEqual({ kind: "stop" });
    expect(parseBridgeCommand("/help")).toEqual({ kind: "help" });
  });

  it("drops the @bot a group adds to every command", () => {
    expect(parseBridgeCommand("/status@ainess_bot")).toEqual({ kind: "status" });
  });

  it("reads an id and the note that follows it", () => {
    expect(parseBridgeCommand("/approve 3f2a")).toEqual({ kind: "approve", id: "3f2a", note: undefined });
    expect(parseBridgeCommand("/reject 3f2a mejor no")).toEqual({ kind: "reject", id: "3f2a", note: "mejor no" });
  });

  it("answers with or without naming the question", () => {
    expect(parseBridgeCommand("/answer la segunda")).toEqual({ kind: "answer", text: "la segunda" });
    const id = "0f7c1d2e-3a4b-4c5d-8e9f-0a1b2c3d4e5f";
    expect(parseBridgeCommand(`/answer ${id} la segunda`)).toEqual({ kind: "answer", id, text: "la segunda" });
  });

  it("reads the project, with a name or without one", () => {
    expect(parseBridgeCommand("/project")).toEqual({ kind: "project", name: undefined });
    expect(parseBridgeCommand("/project ainess")).toEqual({ kind: "project", name: "ainess" });
  });

  it("takes the /start Telegram sends on its own, instead of starting a task with it", () => {
    expect(parseBridgeCommand("/start")).toEqual({ kind: "start" });
    expect(parseBridgeCommand("/start@ainess_bot")).toEqual({ kind: "start" });
  });

  it("treats a command it does not know as something to do, not as an error", () => {
    expect(parseBridgeCommand("/deploy ya")).toEqual({ kind: "prompt", text: "/deploy ya" });
  });
});

describe("isAllowed", () => {
  it("lets through only what is on the list", () => {
    expect(isAllowed("42", ["42", "7"])).toBe(true);
    expect(isAllowed("9", ["42", "7"])).toBe(false);
  });

  it("authorises nobody when the list is empty", () => {
    expect(isAllowed("42", [])).toBe(false);
  });
});

describe("resolveId", () => {
  const ids = ["3f2a1b0c-1111-4222-8333-444455556666", "9c8b7a6d-2222-4333-8444-555566667777"];

  it("takes the short id a person was shown", () => {
    expect(resolveId("3f2a", ids).id).toBe(ids[0]);
  });

  it("says so instead of picking when a prefix fits two", () => {
    expect(resolveId("", ids)).toEqual({});
    expect(resolveId("x", ids)).toEqual({});
    expect(resolveId("3f2a1b0c-1111-4222-8333-444455556666", ids).id).toBe(ids[0]);
    expect(resolveId("1", ["1abc", "1def"])).toEqual({ ambiguous: true });
  });
});

describe("channels do not share their authorised chats", () => {
  const originalTransport = getTransport();

  beforeEach(() => {
    setTransport(originalTransport);
    useAppStore.setState({
      config: {
        ...useAppStore.getState().config,
        messaging: {
          telegram: { enabled: true, token: "tg-token", allowedChatIds: ["shared-id"], projectId: null },
          discord: { enabled: true, token: "dc-token", allowedChatIds: [], projectId: null },
          slack: { enabled: true, token: "sl-bot-token", appToken: "sl-app-token", allowedChatIds: [], projectId: null },
        },
        projects: [{ id: "p1", name: "Proyecto 1", workspaceDir: "C:/p1", createdAt: 1, agents: [] }],
      },
      messages: [],
    });
  });

  it("a chat id authorised on Telegram is not authorised on Discord", async () => {
    const sent: string[] = [];
    setTransport({
      ...getTransport(),
      httpPost: async (url) => {
        sent.push(url);
        return { status: 200, body: JSON.stringify({ ok: true }) };
      },
    });

    await sendToChat("shared-id", "hola", "telegram");
    expect(sent.length).toBe(1);

    await expect(sendToChat("shared-id", "hola", "discord")).rejects.toThrow();
    expect(sent.length).toBe(1);

    await expect(sendToChat("shared-id", "hola", "slack")).rejects.toThrow();
    expect(sent.length).toBe(1);
  });
});
