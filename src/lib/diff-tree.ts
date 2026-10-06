// The changed files of a diff as folders and files, for the tree above the diff. A folder with a
// single folder inside reads as one row ("src/lib"), the way an editor's explorer compacts them.

export interface DiffTreeFile {
  path: string;
  additions: number;
  deletions: number;
}

export interface DiffTreeNode {
  /** `dir:<path>` or `file:<path>`, unique across the tree. */
  id: string;
  /** What the row shows: a file's name, or the folder (or compacted folders) it stands for. */
  name: string;
  /** The file's full path; undefined for a folder. */
  path?: string;
  additions: number;
  deletions: number;
  children?: DiffTreeNode[];
}

interface Dir {
  dirs: Map<string, Dir>;
  files: DiffTreeFile[];
}

export function diffTree(files: DiffTreeFile[]): DiffTreeNode[] {
  const root: Dir = { dirs: new Map(), files: [] };
  for (const file of files) {
    const parts = file.path.split("/");
    let dir = root;
    for (const part of parts.slice(0, -1)) {
      let next = dir.dirs.get(part);
      if (!next) dir.dirs.set(part, (next = { dirs: new Map(), files: [] }));
      dir = next;
    }
    dir.files.push(file);
  }

  const build = (dir: Dir, prefix: string): DiffTreeNode[] => {
    const folders = [...dir.dirs.entries()]
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([name, sub]) => {
        // Walk down while a folder holds nothing but one folder.
        let label = name;
        let path = prefix ? `${prefix}/${name}` : name;
        while (sub.files.length === 0 && sub.dirs.size === 1) {
          const [[childName, child]] = [...sub.dirs.entries()];
          label = `${label}/${childName}`;
          path = `${path}/${childName}`;
          sub = child;
        }
        const children = build(sub, path);
        return {
          id: `dir:${path}`,
          name: label,
          additions: children.reduce((n, c) => n + c.additions, 0),
          deletions: children.reduce((n, c) => n + c.deletions, 0),
          children,
        };
      });
    const leaves = [...dir.files]
      .sort((a, b) => a.path.localeCompare(b.path))
      .map(f => ({ id: `file:${f.path}`, name: f.path.split("/").pop() ?? f.path, path: f.path, additions: f.additions, deletions: f.deletions }));
    return [...folders, ...leaves];
  };

  return build(root, "");
}
