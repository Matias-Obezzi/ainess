import { describe, it, expect, beforeEach } from "vitest";
import { useAppStore } from "@/store";
import { sendToAllowed, sendToChat } from "@/lib/bridge";
import { emitHookEvent } from "@/lib/hooks";
import { getTransport, setTransport } from "@/lib/transport";
import { translateNow } from "@/i18n/useT";
import type { Hook } from "@/types";

const originalTransport = getTransport();

beforeEach(() => {
  setTransport(originalTransport);
  useAppStore.setState({
    config: {
      ...useAppStore.getState().config,
      messaging: {
        telegram: { enabled: true, token: "test-bot-token", allowedChatIds: ["123", "456"], projectId: null }
      },
      hooks: [],
      projects: [{ id: "p1", name: "Proyecto 1", workspaceDir: "C:/p1", createdAt: 1, agents: [] }]
    },
    messages: []
  });
});

describe("telegram hook and bridge dispatch", () => {
  it("sendToAllowed with empty list sends to nobody and returns 0", async () => {
    useAppStore.setState(s => ({
      config: {
        ...s.config,
        messaging: {
          telegram: { enabled: true, token: "test-bot-token", allowedChatIds: [], projectId: null }
        }
      }
    }));

    const sent: Array<{ url: string; body: string }> = [];
    setTransport({
      ...getTransport(),
      httpPost: async (url, body) => {
        sent.push({ url, body });
        return { status: 200, body: JSON.stringify({ ok: true }) };
      }
    });

    const count = await sendToAllowed("mensaje de prueba");
    expect(count).toBe(0);
    expect(sent.length).toBe(0);
  });

  it("sendToChat with a chat not in the list throws and does not send", async () => {
    useAppStore.setState(s => ({
      config: {
        ...s.config,
        messaging: {
          telegram: { enabled: true, token: "test-bot-token", allowedChatIds: ["123"], projectId: null }
        }
      }
    }));

    const sent: Array<{ url: string; body: string }> = [];
    setTransport({
      ...getTransport(),
      httpPost: async (url, body) => {
        sent.push({ url, body });
        return { status: 200, body: JSON.stringify({ ok: true }) };
      }
    });

    await expect(sendToChat("999", "mensaje")).rejects.toThrow(
      translateNow("hooks.telegramNotAllowed", { id: "999" })
    );
    expect(sent.length).toBe(0);
  });

  it("sendToChat with an authorized chat sends once", async () => {
    const sent: Array<{ url: string; body: string }> = [];
    setTransport({
      ...getTransport(),
      httpPost: async (url, body) => {
        sent.push({ url, body });
        return { status: 200, body: JSON.stringify({ ok: true }) };
      }
    });

    await sendToChat("123", "aviso puntual");
    expect(sent.length).toBe(1);
    const parsed = JSON.parse(sent[0].body);
    expect(parsed.chat_id).toBe("123");
    expect(parsed.text).toBe("aviso puntual");
  });

  it("a hook of type telegram with chatId calls sendToChat, and without chatId calls sendToAllowed", async () => {
    const hookWithChat: Hook = {
      id: "h1",
      name: "Directo",
      event: "task.finished",
      enabled: true,
      action: { type: "telegram", template: "para 123", chatId: "123" }
    };

    const hookWithoutChat: Hook = {
      id: "h2",
      name: "Broadcast",
      event: "task.finished",
      enabled: true,
      action: { type: "telegram", template: "para todos" }
    };

    useAppStore.setState(s => ({
      config: {
        ...s.config,
        messaging: {
          telegram: { enabled: true, token: "test-bot-token", allowedChatIds: ["123", "456"], projectId: null }
        },
        hooks: [hookWithChat, hookWithoutChat]
      }
    }));

    const sent: Array<{ url: string; body: { chat_id: string; text: string } }> = [];
    setTransport({
      ...getTransport(),
      httpPost: async (url, body) => {
        sent.push({ url, body: JSON.parse(body) });
        return { status: 200, body: JSON.stringify({ ok: true }) };
      }
    });

    const project = useAppStore.getState().config.projects[0];
    await emitHookEvent("task.finished", {}, { project });
    await new Promise(r => setTimeout(r, 60));

    // hookWithChat should have sent to "123"
    // hookWithoutChat should have sent to both "123" and "456"
    const for123 = sent.filter(s => s.body.chat_id === "123");
    const for456 = sent.filter(s => s.body.chat_id === "456");

    expect(for123.length).toBe(2);
    expect(for456.length).toBe(1);
    expect(for123.some(s => s.body.text === "para 123")).toBe(true);
    expect(for123.some(s => s.body.text === "para todos")).toBe(true);
    expect(for456[0].body.text).toBe("para todos");
  });

  it("text longer than 4096 characters arrives truncated", async () => {
    const longHook: Hook = {
      id: "h-long",
      name: "Largo",
      event: "task.finished",
      enabled: true,
      action: { type: "telegram", template: "{{output}}", chatId: "123" }
    };

    useAppStore.setState(s => ({
      config: {
        ...s.config,
        hooks: [longHook]
      }
    }));

    const sent: Array<{ url: string; body: { chat_id: string; text: string } }> = [];
    setTransport({
      ...getTransport(),
      httpPost: async (url, body) => {
        sent.push({ url, body: JSON.parse(body) });
        return { status: 200, body: JSON.stringify({ ok: true }) };
      }
    });

    const longOutput = "x".repeat(5000);
    const project = useAppStore.getState().config.projects[0];
    await emitHookEvent("task.finished", { output: longOutput }, { project });
    await new Promise(r => setTimeout(r, 60));

    expect(sent.length).toBe(1);
    expect(sent[0].body.text.length).toBeLessThanOrEqual(4096);
  });

  it("token never appears in what is sent or in an error message", async () => {
    const SUPER_SECRET_TOKEN = "TOP_SECRET_BOT_TOKEN_999";
    useAppStore.setState(s => ({
      config: {
        ...s.config,
        messaging: {
          telegram: { enabled: true, token: SUPER_SECRET_TOKEN, allowedChatIds: ["123"], projectId: null }
        }
      }
    }));

    const sentPayloads: string[] = [];
    setTransport({
      ...getTransport(),
      httpPost: async (_url, body) => {
        sentPayloads.push(body);
        return { status: 200, body: JSON.stringify({ ok: true }) };
      }
    });

    // 1. Sent payload does not contain the token
    await sendToChat("123", "mensaje seguro");
    expect(sentPayloads.length).toBe(1);
    expect(sentPayloads[0].includes(SUPER_SECRET_TOKEN)).toBe(false);

    // 2. Error thrown by sendToChat for unallowed chat does not leak token
    try {
      await sendToChat("999", "mensaje seguro");
      expect.unreachable("debería haber lanzado error");
    } catch (e: any) {
      expect(e.message.includes(SUPER_SECRET_TOKEN)).toBe(false);
    }

    // 3. Error when token is missing entirely does not leak any previous token
    useAppStore.setState(s => ({
      config: {
        ...s.config,
        messaging: {
          telegram: { enabled: true, token: "", allowedChatIds: ["123"], projectId: null }
        },
        hooks: [
          {
            id: "h-notoken",
            name: "Sin token",
            event: "task.finished",
            enabled: true,
            action: { type: "telegram", template: "mensaje" }
          }
        ]
      },
      messages: []
    }));

    const project = useAppStore.getState().config.projects[0];
    await emitHookEvent("task.finished", {}, { project });
    await new Promise(r => setTimeout(r, 60));

    const messages = useAppStore.getState().messages;
    const systemMsg = messages.find(m => m.kind === "system");
    expect(systemMsg).toBeDefined();
    expect(systemMsg?.text.includes(SUPER_SECRET_TOKEN)).toBe(false);
    expect(systemMsg?.text).toContain(translateNow("hooks.telegramNoToken"));
  });

  it("fires hooks for question.asked, review.changes, and quota.exhausted with their variables", async () => {
    const received: Array<{ event: string; body: string }> = [];
    useAppStore.setState(s => ({
      config: {
        ...s.config,
        messaging: {
          telegram: { enabled: true, token: "test-token", allowedChatIds: ["123"], projectId: null }
        },
        hooks: [
          {
            id: "h-q",
            name: "Hook Question",
            event: "question.asked",
            enabled: true,
            action: { type: "telegram", template: "Pregunta: {{question}}", chatId: "123" }
          },
          {
            id: "h-r",
            name: "Hook Review",
            event: "review.changes",
            enabled: true,
            action: { type: "telegram", template: "Cambios en: {{task}}", chatId: "123" }
          },
          {
            id: "h-quota",
            name: "Hook Quota",
            event: "quota.exhausted",
            enabled: true,
            action: { type: "telegram", template: "Sin cuota en: {{model}}", chatId: "123" }
          }
        ]
      }
    }));

    setTransport({
      ...getTransport(),
      httpPost: async (_url, body) => {
        const parsed = JSON.parse(body);
        received.push({ event: "telegram", body: parsed.text });
        return { status: 200, body: JSON.stringify({ ok: true }) };
      }
    });

    const project = useAppStore.getState().config.projects[0];

    // Emit question.asked
    await emitHookEvent("question.asked", { question: "¿Continuar con la refactorización?" }, { project });
    // Emit review.changes
    await emitHookEvent("review.changes", { task: "Implementar feature X" }, { project });
    // Emit quota.exhausted
    await emitHookEvent("quota.exhausted", { model: "claude-3-5-sonnet" }, { project });

    await new Promise(r => setTimeout(r, 100));

    expect(received.some(r => r.body === "Pregunta: ¿Continuar con la refactorización?")).toBe(true);
    expect(received.some(r => r.body === "Cambios en: Implementar feature X")).toBe(true);
    expect(received.some(r => r.body === "Sin cuota en: claude-3-5-sonnet")).toBe(true);
  });
});
