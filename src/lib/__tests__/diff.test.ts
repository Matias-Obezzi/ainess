import { describe, it, expect } from "vitest";
import { parseUnifiedDiff, diffTotals } from "../diff";

describe("diff parser", () => {
  it("parses a realistic unified diff", () => {
    const stdout = `diff --git a/modified.ts b/modified.ts
index e69de29..4a8a5f0 100644
--- a/modified.ts
+++ b/modified.ts
@@ -1,3 +1,4 @@
 export function hello() {
-  console.log("hello");
+  console.log("world");
+  console.log("!");
 }
@@ -10,2 +11,3 @@
 function secondHunk() {
+  return true;
 }
diff --git a/new_file.txt b/new_file.txt
new file mode 100644
index 0000000..e69de29
--- /dev/null
+++ b/new_file.txt
@@ -0,0 +1,2 @@
+new
+file
\\ No newline at end of file
diff --git a/deleted.txt b/deleted.txt
deleted file mode 100644
index e69de29..0000000
--- a/deleted.txt
+++ /dev/null
@@ -1 +0,0 @@
-deleted
diff --git a/old_name.ts b/new_name.ts
similarity index 100%
rename from old_name.ts
rename to new_name.ts
diff --git a/image.png b/image.png
new file mode 100644
index 0000000..e69de29
Binary files /dev/null and b/image.png differ
diff --git a/"quoted\\\"path.ts" b/"quoted\\\"path.ts"
index e69de29..4a8a5f0 100644
--- a/"quoted\\\"path.ts"
+++ b/"quoted\\\"path.ts"
@@ -1 +1 @@
-old
+new
`;
    const files = parseUnifiedDiff(stdout);
    
    expect(files.length).toBe(6);

    const [mod, added, del, ren, bin, quoted] = files;

    // Modified
    expect(mod.path).toBe("modified.ts");
    expect(mod.oldPath).toBe("modified.ts");
    expect(mod.status).toBe("modified");
    expect(mod.binary).toBe(false);
    expect(mod.additions).toBe(3);
    expect(mod.deletions).toBe(1);
    expect(mod.hunks.length).toBe(2);
    expect(mod.hunks[0].header).toBe("@@ -1,3 +1,4 @@");
    expect(mod.hunks[0].lines.length).toBe(5);
    expect(mod.hunks[0].lines[0].text).toBe("export function hello() {");
    expect(mod.hunks[0].lines[1].text).toBe("  console.log(\"hello\");");
    expect(mod.hunks[0].lines[1].kind).toBe("del");
    
    // Added
    expect(added.path).toBe("new_file.txt");
    expect(added.status).toBe("added");
    expect(added.additions).toBe(2);
    expect(added.deletions).toBe(0);
    expect(added.hunks[0].lines[2].kind).toBe("meta");
    expect(added.hunks[0].lines[2].text).toBe("\\ No newline at end of file");

    // Deleted
    expect(del.path).toBe("deleted.txt");
    expect(del.oldPath).toBe("deleted.txt");
    expect(del.status).toBe("deleted");
    expect(del.additions).toBe(0);
    expect(del.deletions).toBe(1);

    // Renamed
    expect(ren.path).toBe("new_name.ts");
    expect(ren.oldPath).toBe("old_name.ts");
    expect(ren.status).toBe("renamed");
    
    // Binary
    expect(bin.path).toBe("image.png");
    expect(bin.binary).toBe(true);
    expect(bin.status).toBe("added"); // since it has new file mode
    
    // Quoted path
    expect(quoted.path).toBe('quoted"path.ts');
    expect(quoted.oldPath).toBe('quoted"path.ts');
    expect(quoted.status).toBe("modified");

    const totals = diffTotals(files);
    expect(totals.files).toBe(6);
    expect(totals.additions).toBe(3 + 2 + 0 + 0 + 0 + 1);
    expect(totals.deletions).toBe(1 + 0 + 1 + 0 + 0 + 1);
  });

  it("handles empty string gracefully", () => {
    const files = parseUnifiedDiff("");
    expect(files).toEqual([]);
  });
  
  it("handles garbage correctly", () => {
    const files = parseUnifiedDiff("garbage\nno diff git");
    expect(files).toEqual([]);
  });
});
