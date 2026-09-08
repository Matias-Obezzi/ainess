// Which of an agent's markdown links is an address to open, and which is a path in the repo.
//
// The second kind used to be left on an `<a href>`: clicking it navigated the desktop window
// itself to `tauri.localhost/<path>` and the app was gone.
import { describe, it, expect } from "vitest";
import { webUrl } from "@/lib/open-external";

describe("webUrl", () => {
  it("keeps an address that already has a scheme", () => {
    expect(webUrl("https://example.com/x?y=1#z")).toBe("https://example.com/x?y=1#z");
    expect(webUrl("http://localhost:1420")).toBe("http://localhost:1420");
    expect(webUrl("mailto:someone@example.com")).toBe("mailto:someone@example.com");
  });

  it("gives a bare host the scheme markdown left out", () => {
    expect(webUrl("www.example.com")).toBe("https://www.example.com");
    expect(webUrl("www.example.com/docs")).toBe("https://www.example.com/docs");
    expect(webUrl("//example.com/x")).toBe("https://example.com/x");
  });

  it("does not guess that a file name is a website", () => {
    // `.md` is a real top-level domain, so "README.md" is a host as far as a regex can tell.
    expect(webUrl("README.md")).toBeNull();
    expect(webUrl("index.html")).toBeNull();
    expect(webUrl("example.com")).toBeNull();
  });

  it("trims, and treats nothing as nothing", () => {
    expect(webUrl("  https://example.com  ")).toBe("https://example.com");
    expect(webUrl("")).toBeNull();
    expect(webUrl(undefined)).toBeNull();
    expect(webUrl("   ")).toBeNull();
  });

  it("refuses a path inside the repo: that is where tauri.localhost came from", () => {
    expect(webUrl("src/lib/foo.ts")).toBeNull();
    expect(webUrl("./README.md")).toBeNull();
    expect(webUrl("../up")).toBeNull();
    expect(webUrl("/absolute/path")).toBeNull();
    expect(webUrl("#section")).toBeNull();
    expect(webUrl("C:/Users/x/file.txt")).toBeNull();
  });

  it("refuses the schemes that run in the page: agent output is not trusted", () => {
    expect(webUrl("javascript:alert(1)")).toBeNull();
    expect(webUrl("JavaScript:alert(1)")).toBeNull();
    expect(webUrl("data:text/html,<script>x</script>")).toBeNull();
    expect(webUrl("vbscript:x")).toBeNull();
    expect(webUrl("blob:http://x/y")).toBeNull();
    expect(webUrl("file:///etc/passwd")).toBeNull();
  });
});
