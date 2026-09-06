import { describe, expect, it } from "vitest";
import { extractTunnelUrl, fixedUrl, hasFixedUrl, isTunnelProvider, normalizeDomain, tunnelArgs, tunnelInstallCommand } from "@/lib/tunnel";
import { maskSecrets } from "@/lib/logger";
import { tunnelUrl } from "@/lib/remote";

describe("extractTunnelUrl", () => {
  it("finds the cloudflared quick tunnel URL on a noisy line", () => {
    const line = "2026-09-05T14:03:22Z INF |  https://silly-name-1234.trycloudflare.com  |";
    expect(extractTunnelUrl("cloudflared", line)).toBe("https://silly-name-1234.trycloudflare.com");
  });

  it("ignores cloudflared lines without a URL", () => {
    expect(extractTunnelUrl("cloudflared", "INF Requesting new quick tunnel")).toBeNull();
    expect(extractTunnelUrl("cloudflared", "https://example.com")).toBeNull();
  });

  it("reads the url field of ngrok's started tunnel event", () => {
    const line = '{"addr":"http://127.0.0.1:4710","lvl":"info","msg":"started tunnel","url":"https://a-b-c.ngrok-free.app"}';
    expect(extractTunnelUrl("ngrok", line)).toBe("https://a-b-c.ngrok-free.app");
  });

  it("ignores the local ngrok inspector URL", () => {
    expect(extractTunnelUrl("ngrok", '{"url":"http://localhost:4040"}')).toBeNull();
  });
});

describe("tunnel helpers", () => {
  it("builds the provider arguments", () => {
    expect(tunnelArgs("cloudflared", 4710)).toEqual(["tunnel", "--url", "http://127.0.0.1:4710"]);
    expect(tunnelArgs("ngrok", 4710)).toEqual(["http", "4710", "--log=stdout", "--log-format=json"]);
  });

  it("validates provider ids", () => {
    expect(isTunnelProvider("ngrok")).toBe(true);
    expect(isTunnelProvider("otro")).toBe(false);
    expect(isTunnelProvider(undefined)).toBe(false);
  });

  it("suggests the winget command", () => {
    expect(tunnelInstallCommand("cloudflared")).toContain("Cloudflare.cloudflared");
    expect(tunnelInstallCommand("ngrok")).toContain("Ngrok.Ngrok");
  });

  it("appends the token to the public URL, with or without a trailing slash", () => {
    expect(tunnelUrl("https://x.trycloudflare.com", "a b")).toBe("https://x.trycloudflare.com/?token=a%20b");
    expect(tunnelUrl("https://x.trycloudflare.com/", "tok")).toBe("https://x.trycloudflare.com/?token=tok");
  });
});

describe("fixed tunnel URLs", () => {
  it("normalizes a domain: scheme, trailing slash and case", () => {
    expect(normalizeDomain("https://Algo.Ngrok-Free.App/")).toBe("algo.ngrok-free.app");
    expect(normalizeDomain(" ")).toBe("");
    expect(normalizeDomain(undefined)).toBe("");
    expect(normalizeDomain("ainess.midominio.com")).toBe("ainess.midominio.com");
  });

  it("builds ngrok args with a static domain", () => {
    expect(tunnelArgs("ngrok", 4710, { domain: "algo.ngrok-free.app" })).toEqual([
      "http", "4710", "--log=stdout", "--log-format=json", "--url", "https://algo.ngrok-free.app",
    ]);
  });

  it("builds cloudflared named-tunnel args when domain and tunnelName are set", () => {
    expect(tunnelArgs("cloudflared", 4710, { domain: "x.midominio.com", tunnelName: "ainess" })).toEqual([
      "tunnel", "--url", "http://127.0.0.1:4710", "run", "ainess",
    ]);
  });

  it("falls back to the quick tunnel when cloudflared has a domain but no tunnel name", () => {
    expect(tunnelArgs("cloudflared", 4710, { domain: "x.midominio.com" })).toEqual([
      "tunnel", "--url", "http://127.0.0.1:4710",
    ]);
  });

  it("detects a registered named-tunnel connection line and returns the fixed URL", () => {
    const opts = { domain: "x.midominio.com", tunnelName: "ainess" };
    const line = "2026-09-05T14:05:00Z INF Registered tunnel connection connection=ab12cd34-ef56-7890-abcd-ef1234567890";
    expect(extractTunnelUrl("cloudflared", line, opts)).toBe("https://x.midominio.com");
    expect(extractTunnelUrl("cloudflared", "INF some unrelated line", opts)).toBeNull();
  });

  it("hasFixedUrl / fixedUrl for ngrok", () => {
    expect(hasFixedUrl("ngrok", { domain: "algo.ngrok-free.app" })).toBe(true);
    expect(hasFixedUrl("ngrok", {})).toBe(false);
    expect(fixedUrl("ngrok", { domain: "algo.ngrok-free.app" })).toBe("https://algo.ngrok-free.app");
    expect(fixedUrl("ngrok", {})).toBeNull();
  });

  it("hasFixedUrl / fixedUrl for cloudflared", () => {
    expect(hasFixedUrl("cloudflared", { domain: "x.midominio.com", tunnelName: "ainess" })).toBe(true);
    expect(hasFixedUrl("cloudflared", { domain: "x.midominio.com" })).toBe(false);
    expect(hasFixedUrl("cloudflared", { tunnelName: "ainess" })).toBe(false);
    expect(fixedUrl("cloudflared", { domain: "x.midominio.com", tunnelName: "ainess" })).toBe("https://x.midominio.com");
    expect(fixedUrl("cloudflared", { domain: "x.midominio.com" })).toBeNull();
  });
});

describe("maskSecrets", () => {
  it("hides the token in a URL", () => {
    expect(maskSecrets("http://192.168.0.5:4710/?token=abc-123&x=1")).toBe("http://192.168.0.5:4710/?token=***&x=1");
  });

  it("hides JSON tokens and bearer headers", () => {
    expect(maskSecrets('{"token":"abc"}')).toBe('{"token":"***"}');
    expect(maskSecrets("Authorization: Bearer secreto")).toBe("Authorization: Bearer ***");
  });

  it("leaves ordinary text alone", () => {
    expect(maskSecrets("run 123 terminó con código 0")).toBe("run 123 terminó con código 0");
  });
});
