// The room's messages must be signed exactly as ai-connector signs them, or the two never agree.
import { describe, it, expect } from "vitest";
import { canonical, isPass, isValidMessage, makeMessage, shouldAnswer } from "@/lib/room/protocol";

// Signed by ai-connector's own `connector._digest` (Python), key "clave-sala".
const FROM_PYTHON = {
  id: "abc123", machine: "m1", machine_name: "PC-Matías", sender: "Arquitecto", kind: "agent" as const,
  text: 'Hola "mundo"\nñandú ✓ \\ fin', ts: 1760000000000,
  sig: "32bf8f825838e8b2ef10365a2a54c3311f7fa5aa17805881ef22df8ac9ee8e22",
};

describe("room protocol", () => {
  it("writes the body the way Python does and accepts its signature", async () => {
    const { sig: _sig, ...body } = FROM_PYTHON;
    expect(canonical(body)).toBe('{"id": "abc123", "kind": "agent", "machine": "m1", "machine_name": "PC-Matías", "sender": "Arquitecto", "text": "Hola \\"mundo\\"\\nñandú ✓ \\\\ fin", "ts": 1760000000000}');
    expect(await isValidMessage(FROM_PYTHON, "clave-sala")).toBe(true);
  });

  it("drops a message signed with another key, tampered with, or malformed", async () => {
    expect(await isValidMessage(FROM_PYTHON, "otra")).toBe(false);
    expect(await isValidMessage({ ...FROM_PYTHON, text: "otro" }, "clave-sala")).toBe(false);
    expect(await isValidMessage({ ...FROM_PYTHON, kind: "system" }, "clave-sala")).toBe(false);
    expect(await isValidMessage("x", "clave-sala")).toBe(false);
  });

  it("signs what it sends so it checks out", async () => {
    const m = await makeMessage("k", { machine: "m2", machineName: "PC-2" }, "Planner", "hola", "agent");
    expect(await isValidMessage(m, "k")).toBe(true);
  });

  it("answers unless the message is for someone else or the agents are going in circles", () => {
    expect(shouldAnswer("¿qué opinan?", ["Planner"], ["Arquitecto"], 0, 6)).toBe(true);
    expect(shouldAnswer("@Arquitecto revisá esto", ["Planner"], ["Arquitecto"], 0, 6)).toBe(false);
    expect(shouldAnswer("@planner y @Arquitecto", ["Planner"], ["Arquitecto"], 0, 6)).toBe(true);
    expect(shouldAnswer("sigo", ["Planner"], [], 6, 6)).toBe(false);
    expect(isPass(" [PASO] ")).toBe(true);
  });
});
