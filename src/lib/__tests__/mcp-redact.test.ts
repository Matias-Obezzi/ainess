// Keeping a token out of an error the user is about to read.
//
// `agy mcp add` echoes back what it was given, so when it fails its own output can carry the header
// it was handed. That message goes straight to the screen. The secret is known on this side, so it
// is matched by its literal value rather than guessed at with a pattern — the same bargain
// `sanitizeBridgeError` makes.
//
// The direction of failure matters here: over-redacting is noise, under-redacting is a leaked
// credential. Everything below errs the same way.
import { describe, it, expect } from "vitest";
import { redactSecrets } from "@/lib/mcp-sync";
import type { McpServer } from "@/types";

const server = (over: Partial<McpServer> = {}): McpServer => ({
  id: "m1", name: "stitch", transport: "http", url: "https://x/mcp", enabledFor: "all", ...over,
});

describe("redactSecrets", () => {
  it("takes a header's value out of the message", () => {
    const s = server({ headers: { Authorization: "Bearer sk-secreto-123" } });
    expect(redactSecrets("falló con Bearer sk-secreto-123 al conectar", s))
      .toBe("falló con [REDACTED] al conectar");
  });

  it("takes an env value out too, which had the same hole before headers existed", () => {
    const s = server({ transport: "stdio", env: { TOKEN: "abc-xyz" } });
    expect(redactSecrets("env TOKEN=abc-xyz rechazado", s)).toBe("env TOKEN=[REDACTED] rechazado");
  });

  it("removes every occurrence, not just the first", () => {
    const s = server({ headers: { A: "zzz" } });
    expect(redactSecrets("zzz y otra vez zzz", s)).toBe("[REDACTED] y otra vez [REDACTED]");
  });

  it("leaves the name of the server alone, which is what says which one failed", () => {
    const s = server({ headers: { Authorization: "Bearer t" } });
    expect(redactSecrets("stitch: no se pudo agregar", s)).toContain("stitch");
  });

  it("does not blow up on a header with no value", () => {
    // An empty string in `split` would cut between every character and destroy the message.
    const s = server({ headers: { "X-Empty": "", "X-Blank": "   " } });
    expect(redactSecrets("mensaje intacto", s)).toBe("mensaje intacto");
  });

  it("passes a message through when the server has no secrets at all", () => {
    expect(redactSecrets("no encontré el binario", server())).toBe("no encontré el binario");
  });
});
