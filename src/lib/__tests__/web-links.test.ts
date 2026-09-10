// Which of an agent's markdown links is an address to open, which is a file on this machine, and
// which is a path in the repo.
//
// The last kind used to be left on an `<a href>`: clicking it navigated the desktop window
// itself to `tauri.localhost/<path>` and the app was gone.
import { describe, it, expect } from "vitest";
import { filePath, webUrl } from "@/lib/open-external";

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
  });

  // It is clickable now — as a file to reveal, which is `filePath`'s job. What it is not is
  // something to hand to a browser.
  it("refuses a file: URL: clickable, but not a web address", () => {
    expect(webUrl("file:///etc/passwd")).toBeNull();
    expect(webUrl("file:///C:/Users/matia/archivo.txt")).toBeNull();
    expect(webUrl("FILE:///C:/x")).toBeNull();
  });
});

describe("filePath", () => {
  it("turns a Windows file: URL into the path the file manager wants", () => {
    expect(filePath("file:///C:/Users/matia/archivo.txt")).toBe("C:\\Users\\matia\\archivo.txt");
    // The drive as the host: some tools write only two slashes, and the URL parser reads the
    // letter back as the start of the path rather than as a machine name.
    expect(filePath("file://C:/x")).toBe("C:\\x");
  });

  it("decodes the escapes markdown put in: a space is a space, not %20", () => {
    expect(filePath("file:///C:/Mis%20Documentos/a%20b.txt")).toBe("C:\\Mis Documentos\\a b.txt");
    expect(filePath("file:///home/user/a%20b")).toBe("/home/user/a b");
  });

  it("leaves a POSIX path alone: there is nothing to translate", () => {
    expect(filePath("file:///home/user/x")).toBe("/home/user/x");
    expect(filePath("file:///etc/passwd")).toBe("/etc/passwd");
  });

  it("puts a UNC share back together from the host", () => {
    expect(filePath("file://server/share/x")).toBe("\\\\server\\share\\x");
  });

  // `#` and `?` are legal in a file name; read off `pathname` alone they would point at a
  // shorter file that probably does not exist.
  it("keeps what the URL parser filed away as hash or search", () => {
    expect(filePath("file:///home/user/nota%20#2.txt")).toBe("/home/user/nota #2.txt");
    expect(filePath("file:///C:/x/y?z.txt")).toBe("C:\\x\\y?z.txt");
  });

  it("is not for anything that is not a file: URL", () => {
    expect(filePath("https://example.com/x")).toBeNull();
    expect(filePath("src/lib/foo.ts")).toBeNull();
    expect(filePath("C:/Users/x/file.txt")).toBeNull();
    expect(filePath("javascript:alert(1)")).toBeNull();
    expect(filePath("")).toBeNull();
    expect(filePath("   ")).toBeNull();
    expect(filePath(undefined)).toBeNull();
  });

  it("refuses what does not parse, and the root, which is nothing to reveal", () => {
    expect(filePath("file://")).toBeNull();
    expect(filePath("file:///")).toBeNull();
    // A half-written escape is a typo, not a path.
    expect(filePath("file:///C:/%zz")).toBeNull();
    expect(filePath("file:///C:/%E0%A4%A")).toBeNull();
  });

  // A NUL or a control character is how a name reads as one thing here and as another to the
  // system call underneath.
  it("refuses a path carrying control characters", () => {
    expect(filePath("file:///home/user/x%00.txt")).toBeNull();
    expect(filePath("file:///home/user/x%0A.txt")).toBeNull();
    expect(filePath("file:///home/user/x%1b[2J")).toBeNull();
  });
});
