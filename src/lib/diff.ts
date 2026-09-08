export type DiffLineKind = "add" | "del" | "ctx" | "meta";

export interface DiffLine {
  kind: DiffLineKind;
  text: string;
}

export interface DiffHunk {
  header: string;
  lines: DiffLine[];
}

export interface DiffFile {
  path: string;
  oldPath?: string;
  status: "added" | "deleted" | "modified" | "renamed";
  binary: boolean;
  additions: number;
  deletions: number;
  hunks: DiffHunk[];
}

function unquotePath(p: string): string {
  if (p.startsWith('"') && p.endsWith('"')) {
    try {
      // JSON.parse can unescape "\t", "\n", "\"", "\\", etc.
      // git uses a similar escaping mechanism for non-ascii
      return JSON.parse(p);
    } catch {
      return p.slice(1, -1).replace(/\\\\/g, "\\").replace(/\\"/g, '"');
    }
  }
  return p;
}

/**
 * Parses the unified diff format output by `git diff`.
 * 
 * Rules:
 * - A new file starts with a line `diff --git a/<old> b/<new>`.
 * - `new file mode` -> status "added"; `deleted file mode` -> "deleted"; `rename from X` / `rename to Y` -> status "renamed" with `oldPath` = X and `path` = Y; otherwise "modified".
 * - A line starting with `Binary files` -> `binary: true` and no hunks.
 * - `--- a/x` and `+++ b/y` confirm paths. If new side is `/dev/null` the file is deleted and path is old path. Always strip the `a/` or `b/` prefix.
 * - Git quotes paths with non-ASCII characters: if the path is inside double quotes, remove them and unescape `\\` and `\"`.
 * - Hunks start with `@@ ... @@` (the entire line goes into `header`, including trailing context).
 * - Inside a hunk: `+` -> kind "add", `-` -> kind "del", ` ` or empty line -> "ctx", and `\ No newline at end of file` -> "meta". The `text` of each line is the line WITHOUT the first character (except in "meta" where it's the whole line).
 * - `additions` and `deletions` count the add and del lines of that file.
 * - Empty text or garbage that doesn't start with `diff --git` -> empty array, never an exception.
 */
export function parseUnifiedDiff(stdout: string): DiffFile[] {
  const files: DiffFile[] = [];
  const lines = stdout.split(/\r?\n/);

  let currentFile: DiffFile | null = null;
  let currentHunk: DiffHunk | null = null;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];

    if (line.startsWith("diff --git ")) {
      if (currentFile) {
        files.push(currentFile);
      }
      
      const rest = line.substring(11);
      let p = "";
      const bIdx = rest.lastIndexOf(" b/");
      if (bIdx !== -1) {
        p = unquotePath(rest.substring(bIdx + 3));
      } else if (rest.startsWith("a/") && rest.indexOf(" b/") === -1) {
        // Fallback if anything weird
      }

      currentFile = {
        path: p,
        status: "modified",
        binary: false,
        additions: 0,
        deletions: 0,
        hunks: []
      };
      currentHunk = null;
      continue;
    }

    if (!currentFile) continue;

    if (line.startsWith("new file mode ")) {
      currentFile.status = "added";
    } else if (line.startsWith("deleted file mode ")) {
      currentFile.status = "deleted";
    } else if (line.startsWith("rename from ")) {
      currentFile.status = "renamed";
      currentFile.oldPath = unquotePath(line.substring(12));
    } else if (line.startsWith("rename to ")) {
      currentFile.status = "renamed";
      currentFile.path = unquotePath(line.substring(10));
    } else if (line.startsWith("Binary files ")) {
      currentFile.binary = true;
    } else if (line.startsWith("--- ")) {
      let p = line.substring(4);
      if (p !== "/dev/null") {
        if (p.startsWith("a/")) p = unquotePath(p.substring(2));
        else if (p.startsWith('"a/') && p.endsWith('"')) p = unquotePath('"' + p.substring(3));
        currentFile.oldPath = p;
        if (currentFile.status !== "renamed") {
          currentFile.path = currentFile.oldPath;
        }
      }
    } else if (line.startsWith("+++ ")) {
      let p = line.substring(4);
      if (p === "/dev/null") {
        currentFile.status = "deleted";
        currentFile.path = currentFile.oldPath || "";
      } else {
        if (p.startsWith("b/")) p = unquotePath(p.substring(2));
        else if (p.startsWith('"b/') && p.endsWith('"')) p = unquotePath('"' + p.substring(3));
        currentFile.path = p;
      }
    } else if (line.startsWith("@@ ")) {
      currentHunk = {
        header: line,
        lines: []
      };
      currentFile.hunks.push(currentHunk);
    } else if (currentHunk) {
      if (line.startsWith("+")) {
        currentHunk.lines.push({ kind: "add", text: line.substring(1) });
        currentFile.additions++;
      } else if (line.startsWith("-")) {
        currentHunk.lines.push({ kind: "del", text: line.substring(1) });
        currentFile.deletions++;
      } else if (line.startsWith("\\ ")) {
        currentHunk.lines.push({ kind: "meta", text: line });
      } else if (line.startsWith(" ") || line === "") {
        currentHunk.lines.push({ kind: "ctx", text: line ? line.substring(1) : "" });
      }
    }
  }

  if (currentFile) {
    files.push(currentFile);
  }

  // Fallback for paths if --- / +++ were not present (e.g., in some renamed binary files without hunks)
  for (const f of files) {
    if (!f.path && f.oldPath) f.path = f.oldPath;
  }

  return files;
}

export function diffTotals(files: DiffFile[]): { files: number; additions: number; deletions: number } {
  let additions = 0;
  let deletions = 0;
  for (const f of files) {
    additions += f.additions;
    deletions += f.deletions;
  }
  return { files: files.length, additions, deletions };
}
