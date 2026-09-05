import { describe, it, expect } from "vitest";
import { summarizeTool, toolIcon, relativizePath } from "@/lib/tool-summary";

describe("summarizeTool", () => {
  it("shows a path inside the workspace as a relative path", () => {
    expect(
      summarizeTool("Edit", { file_path: "C:\\Users\\me\\proj\\src\\lib\\x.ts" }, { workspaceDir: "C:\\Users\\me\\proj" })
    ).toBe("Edit src/lib/x.ts");
    expect(
      summarizeTool("Read", { path: "/home/me/proj/src/main.ts" }, { workspaceDir: "/home/me/proj/" })
    ).toBe("Read src/main.ts");
  });

  it("keeps a path outside the workspace as it is", () => {
    expect(summarizeTool("Read", { file_path: "/etc/hosts" }, { workspaceDir: "/home/me/proj" })).toBe("Read /etc/hosts");
    expect(summarizeTool("Read", { filePath: "src/a.ts" })).toBe("Read src/a.ts");
  });

  it("truncates a long command", () => {
    const command = "npm run build && " + "echo muy largo ".repeat(20);
    const out = summarizeTool("Bash", { command });
    expect(out.startsWith("Bash npm run build && echo muy largo")).toBe(true);
    expect(out.endsWith("…")).toBe(true);
    expect(out.length).toBeLessThanOrEqual("Bash ".length + 81);
  });

  it("keeps a short command whole", () => {
    expect(summarizeTool("Bash", { command: "npm test" })).toBe("Bash npm test");
  });

  it("quotes patterns and queries, and shows only the host of a url", () => {
    expect(summarizeTool("Grep", { pattern: "foo" })).toBe('Grep "foo"');
    expect(summarizeTool("WebSearch", { query: "tauri v2" })).toBe('WebSearch "tauri v2"');
    expect(summarizeTool("WebFetch", { url: "https://example.com/a/b?c=1" })).toBe("WebFetch example.com");
  });

  it("summarizes a Task by its description", () => {
    expect(summarizeTool("Task", { description: "Revisar tests", prompt: "…" })).toBe("Task Revisar tests");
  });

  it("falls back to the first string value for an unknown tool", () => {
    expect(summarizeTool("rare_tool", { count: 3, target: "el objetivo", other: "x" })).toBe("rare_tool el objetivo");
  });

  it("returns just the name when there is no usable input", () => {
    expect(summarizeTool("Edit")).toBe("Edit");
    expect(summarizeTool("Edit", undefined)).toBe("Edit");
    expect(summarizeTool("Edit", {})).toBe("Edit");
    expect(summarizeTool("Edit", { n: 1 })).toBe("Edit");
    expect(summarizeTool("Edit", [1, 2])).toBe("Edit");
  });

  it("accepts a plain string input", () => {
    expect(summarizeTool("powershell", "Get-ChildItem")).toBe("powershell Get-ChildItem");
  });
});

describe("relativizePath", () => {
  it("normalizes separators and matches case-insensitively", () => {
    expect(relativizePath("C:\\proj\\SRC\\a.ts", "c:/proj")).toBe("SRC/a.ts");
    expect(relativizePath("/proj", "/proj")).toBe(".");
  });
});

describe("toolIcon", () => {
  it("maps every provider's naming to a stable icon", () => {
    expect(toolIcon("Edit")).toBe(toolIcon("create_file"));
    expect(toolIcon("Read")).toBe(toolIcon("view"));
    expect(toolIcon("Bash")).toBe(toolIcon("powershell"));
    expect(toolIcon("Grep")).toBe(toolIcon("glob"));
    expect(toolIcon("WebFetch")).toBe(toolIcon("web_search"));
    expect(toolIcon("Task")).toBe(toolIcon("subagent"));
    expect(toolIcon("cualquier_cosa")).not.toBe(toolIcon("Bash"));
  });
});
