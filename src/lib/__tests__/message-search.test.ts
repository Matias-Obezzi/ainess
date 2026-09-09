import { describe, it, expect } from "vitest";
import { normalize, excerptAround, searchMessages } from "../message-search";
import type { CommMessage, ChatMessage } from "@/types";

describe("normalize", () => {
  it("lowercases and strips accents", () => {
    expect(normalize("Orquestación")).toBe("orquestacion");
    expect(normalize("CÓDIGO")).toBe("codigo");
    expect(normalize("Español")).toBe("espanol");
    expect(normalize("NAÏVE Über Mañana")).toBe("naive uber manana");
  });
});

describe("excerptAround", () => {
  it("collapses newlines and repeated whitespace to a single space", () => {
    const text = "Hola \n\n  mundo   de   \t  prueba";
    expect(excerptAround(text, "mundo", 100)).toBe("Hola mundo de prueba");
  });

  it("returns full text when length is within width", () => {
    const text = "Texto corto";
    expect(excerptAround(text, "corto", 50)).toBe("Texto corto");
  });

  it("centers the window on the match and puts … on both sides when trimmed on both ends", () => {
    const prefix = "Inicio de la conversación con mucho contexto previo ";
    const match = "PALABRA_CLAVE";
    const suffix = " y luego sigue con mucho más contexto posterior para recortar";
    const text = `${prefix}${match}${suffix}`;

    const excerpt = excerptAround(text, "palabra_clave", 30);
    expect(excerpt.startsWith("…")).toBe(true);
    expect(excerpt.endsWith("…")).toBe(true);
    expect(excerpt).toContain("PALABRA_CLAVE");
  });

  it("puts … only at the end when match is near the beginning", () => {
    const text = "AlphaBetaGamma " + "x".repeat(200);
    const excerpt = excerptAround(text, "alphabeta", 40);
    expect(excerpt.startsWith("AlphaBetaGamma")).toBe(true);
    expect(excerpt.startsWith("…")).toBe(false);
    expect(excerpt.endsWith("…")).toBe(true);
  });

  it("puts … only at the beginning when match is near the end", () => {
    const text = "x".repeat(200) + " OmegaFinal";
    const excerpt = excerptAround(text, "omegafinal", 40);
    expect(excerpt.startsWith("…")).toBe(true);
    expect(excerpt.endsWith("OmegaFinal")).toBe(true);
    expect(excerpt.endsWith("…")).toBe(false);
  });

  it("returns the beginning of the text when there is no match", () => {
    const shortText = "Mensaje corto sin coincidencia";
    expect(excerptAround(shortText, "inexistente", 50)).toBe("Mensaje corto sin coincidencia");

    const longText = "Primero viene esto que queremos ver en el extracto " + "y luego ".repeat(20);
    const excerpt = excerptAround(longText, "inexistente", 40);
    expect(excerpt.startsWith("Primero viene esto que queremos ver")).toBe(true);
    expect(excerpt.endsWith("…")).toBe(true);
  });

  it("preserves the original casing and diacritics of the source text", () => {
    const text = "Ayer vimos la Orquestación de Agentes y el ÁRBOL de dependencias";
    const excerpt = excerptAround(text, "orquestacion", 50);

    // Must preserve exact casing and accents from original
    expect(excerpt).toContain("Orquestación");
    expect(excerpt).not.toContain("orquestacion");

    const excerptUpper = excerptAround(text, "arbol", 50);
    expect(excerptUpper).toContain("ÁRBOL");
    expect(excerptUpper).not.toContain("arbol");
  });
});

describe("searchMessages", () => {
  const dummyComm = (overrides: Partial<CommMessage>): CommMessage => ({
    id: "msg-1",
    ts: 1000,
    fromAgentId: "agent-a",
    kind: "text",
    text: "Mensaje de prueba",
    ...overrides,
  });

  const dummyChat = (overrides: Partial<ChatMessage>): ChatMessage => ({
    id: "chat-msg-1",
    chatId: "chat-1",
    ts: 2000,
    from: "user",
    text: "Mensaje de chat",
    ...overrides,
  });

  it("returns empty array for queries shorter than 3 characters", () => {
    const sources = {
      messages: [dummyComm({ text: "Hola mundo" })],
      chats: [{ id: "c1", messages: [dummyChat({ text: "Hola mundo" })] }],
    };

    expect(searchMessages("", sources)).toEqual([]);
    expect(searchMessages("a", sources)).toEqual([]);
    expect(searchMessages("ab", sources)).toEqual([]);
    expect(searchMessages("  ab  ", sources)).toEqual([]);
    expect(searchMessages("   ", sources)).toEqual([]);
  });

  // A phrase you remember does not come back to you with the line break the writer put in it.
  it("finds a phrase the writer happened to split across lines", () => {
    const sources = {
      messages: [dummyComm({ text: "hay que revisar el\nparser de diffs antes del release" })],
      chats: [],
    };

    expect(searchMessages("el parser", sources)).toHaveLength(1);
    expect(searchMessages("revisar   el\n  parser", sources)).toHaveLength(1);
  });

  it("finds matches in project feed and chats, sorted newest to oldest", () => {
    const sources = {
      messages: [
        dummyComm({ id: "p-old", ts: 100, text: "Primer despliegue continuo", projectId: "proj-1" }),
        dummyComm({ id: "p-mid", ts: 300, text: "Revisión del despliegue en progreso", projectId: "proj-1", runId: "run-99" }),
      ],
      chats: [
        {
          id: "chat-1",
          messages: [
            dummyChat({ id: "c-newest", ts: 500, text: "Último despliegue finalizado", chatId: "chat-1", from: "user" }),
            dummyChat({ id: "c-mid", ts: 200, text: "Planeando el despliegue", chatId: "chat-1", from: "agent-b" }),
          ],
        },
      ],
    };

    const hits = searchMessages("despliegue", sources);

    expect(hits.map(h => h.id)).toEqual(["c-newest", "p-mid", "c-mid", "p-old"]);
    expect(hits[0]).toMatchObject({
      id: "c-newest",
      ts: 500,
      from: "user",
      source: { kind: "chat", chatId: "chat-1" },
    });
    expect(hits[1]).toMatchObject({
      id: "p-mid",
      ts: 300,
      from: "agent-a",
      source: { kind: "project", projectId: "proj-1", runId: "run-99" },
    });
  });

  it("ignores casing and diacritics in both directions", () => {
    const sources = {
      messages: [
        dummyComm({ id: "m1", text: "Orquestación de tareas en paralelo" }),
      ],
      chats: [
        {
          id: "c1",
          messages: [
            dummyChat({ id: "c1-m1", text: "orquestacion sin tildes" }),
          ],
        },
      ],
    };

    // Search without accents finds message with accents
    const hitsLower = searchMessages("orquestacion", sources);
    expect(hitsLower.map(h => h.id)).toContain("m1");
    expect(hitsLower.map(h => h.id)).toContain("c1-m1");

    // Search with uppercase and accents finds both
    const hitsUpper = searchMessages("ORQUESTACIÓN", sources);
    expect(hitsUpper.map(h => h.id)).toContain("m1");
    expect(hitsUpper.map(h => h.id)).toContain("c1-m1");
  });

  it("skips tool and stderr messages, and empty or whitespace-only messages", () => {
    const sources = {
      messages: [
        dummyComm({ id: "tool-msg", kind: "tool", text: "ejecución de comando clave" }),
        dummyComm({ id: "stderr-msg", kind: "stderr", text: "salida de error clave" }),
        dummyComm({ id: "empty-msg", kind: "text", text: "" }),
        dummyComm({ id: "whitespace-msg", kind: "text", text: "   \n\t   " }),
        dummyComm({ id: "valid-text", kind: "text", text: "Texto válido con la palabra clave" }),
        dummyComm({ id: "valid-note", kind: "note", text: "Nota con la palabra clave" }),
      ],
      chats: [
        {
          id: "c1",
          messages: [
            dummyChat({ id: "chat-empty", text: "" }),
            dummyChat({ id: "chat-valid", text: "Chat con la palabra clave" }),
          ],
        },
      ],
    };

    const hits = searchMessages("clave", sources);
    const hitIds = hits.map(h => h.id);

    expect(hitIds).toContain("valid-text");
    expect(hitIds).toContain("valid-note");
    expect(hitIds).toContain("chat-valid");

    expect(hitIds).not.toContain("tool-msg");
    expect(hitIds).not.toContain("stderr-msg");
    expect(hitIds).not.toContain("empty-msg");
    expect(hitIds).not.toContain("whitespace-msg");
    expect(hitIds).not.toContain("chat-empty");
  });

  it("respects the limit argument and defaults to 20", () => {
    const manyMessages: CommMessage[] = Array.from({ length: 25 }, (_, i) =>
      dummyComm({
        id: `msg-${i}`,
        ts: i * 10,
        text: `Coincidencia número ${i} de la prueba`,
      })
    );

    const sources = { messages: manyMessages, chats: [] };

    // Default limit = 20
    const defaultHits = searchMessages("coincidencia", sources);
    expect(defaultHits).toHaveLength(20);
    // Should have highest timestamps (newest)
    expect(defaultHits[0].id).toBe("msg-24");
    expect(defaultHits[19].id).toBe("msg-5");

    // Custom limit = 5
    const customHits = searchMessages("coincidencia", sources, 5);
    expect(customHits).toHaveLength(5);
    expect(customHits[0].id).toBe("msg-24");
    expect(customHits[4].id).toBe("msg-20");
  });
});
