import { describe, expect, it } from "vitest";
import { extractTunnelUrl, isTunnelProvider, tunnelArgs, tunnelInstallCommand } from "@/lib/tunnel";
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
