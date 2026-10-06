import { describe, it, expect } from "vitest";
import { diffTree } from "@/lib/diff-tree";

describe("diffTree", () => {
  it("groups by folder, compacts lone folders and adds up the counts", () => {
    const tree = diffTree([
      { path: "src/lib/a.ts", additions: 3, deletions: 1 },
      { path: "src/lib/b.ts", additions: 2, deletions: 0 },
      { path: "README.md", additions: 1, deletions: 1 },
    ]);
    expect(tree.map(n => n.name)).toEqual(["src/lib", "README.md"]);
    expect(tree[0]).toMatchObject({ id: "dir:src/lib", additions: 5, deletions: 1 });
    expect(tree[0].children?.map(c => c.path)).toEqual(["src/lib/a.ts", "src/lib/b.ts"]);
    expect(tree[1]).toMatchObject({ id: "file:README.md", path: "README.md" });
  });

  it("keeps a folder that branches as its own row", () => {
    const tree = diffTree([
      { path: "src/a/x.ts", additions: 1, deletions: 0 },
      { path: "src/b/y.ts", additions: 1, deletions: 0 },
    ]);
    expect(tree.map(n => n.name)).toEqual(["src"]);
    expect(tree[0].children?.map(n => n.name)).toEqual(["a", "b"]);
  });
});
