// A file an agent named: recognised where it is mentioned, placed on disk, drawn as what it is.
import { describe, it, expect } from "vitest";
import { baseName, isMarkdownPath, languageOf, looksLikePath, pathRef, resolvePath, splitPaths } from "@/lib/file-preview";

describe("looksLikePath", () => {
  it("knows a path inside backticks when it sees one", () => {
    for (const p of ["src/lib/foo.ts", "src\\lib\\foo.ts", ".claude/handoff/007-x.md", "C:/Users/matia/a.rs", "./a.json", "README.md", "foo.ts:42", "src/x.ts:10:5", "docs/changelog/es.md"]) {
      expect(looksLikePath(p), p).toBe(true);
    }
  });

  it("leaves URLs, versions, words and packages alone", () => {
    for (const p of ["https://x.io/a.js", "react-markdown", "v1.2.3", "hola", "foo.bar", "a b c/d.ts  e", "e.g."]) {
      expect(looksLikePath(p), p).toBe(false);
    }
  });
});

describe("splitPaths", () => {
  it("finds the paths loose in a sentence and keeps the words around them", () => {
    const parts = splitPaths("Dejé el plan en .claude/handoff/007-x.md y toqué src/lib/foo.ts:42, nada más.");
    expect(parts.filter(p => p.kind === "path").map(p => p.text)).toEqual([".claude/handoff/007-x.md", "src/lib/foo.ts:42"]);
    expect(parts.map(p => p.text).join("")).toBe("Dejé el plan en .claude/handoff/007-x.md y toqué src/lib/foo.ts:42, nada más.");
  });

  it("does not take a URL's path, a version or a bare file name for one", () => {
    expect(splitPaths("mirá https://x.io/a/b.js y react 19.1.0 y README.md").filter(p => p.kind === "path")).toEqual([]);
  });
});

describe("pathRef and resolvePath", () => {
  it("peels the line off and keeps the path", () => {
    expect(pathRef("src/a.ts:42")).toEqual({ path: "src/a.ts", line: 42 });
    expect(pathRef("src/a.ts:42:7")).toEqual({ path: "src/a.ts", line: 42 });
    expect(pathRef("src/a.ts")).toEqual({ path: "src/a.ts" });
  });

  it("puts a relative path under the base with the base's own separator", () => {
    expect(resolvePath("src/a.ts", "C:\\p\\repo")).toBe("C:\\p\\repo\\src\\a.ts");
    expect(resolvePath("./src/a.ts", "/home/m/repo/")).toBe("/home/m/repo/src/a.ts");
    expect(resolvePath("C:\\x\\a.ts", "C:\\p")).toBe("C:\\x\\a.ts");
    expect(resolvePath("/etc/hosts", "C:\\p")).toBe("/etc/hosts");
  });
});

describe("what a file is", () => {
  it("names the language by extension and special file names", () => {
    expect(languageOf("src/a.tsx")).toBe("tsx");
    expect(languageOf("Cargo.toml")).toBe("toml");
    expect(languageOf("Dockerfile")).toBe("dockerfile");
    expect(languageOf("notes")).toBe("text");
    expect(languageOf("x.unknownext")).toBe("text");
  });

  it("tells markdown from the rest, and the name from the path", () => {
    expect(isMarkdownPath("docs/a.md")).toBe(true);
    expect(isMarkdownPath("docs/a.ts")).toBe(false);
    expect(baseName("C:\\p\\a.md")).toBe("a.md");
    expect(baseName("/p/a.md/")).toBe("a.md");
  });
});
