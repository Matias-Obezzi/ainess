// A file an agent named, opened beside the conversation.
//
// An answer says "the plan is in .claude/handoff/007-x.md" or "see src/lib/foo.ts:42", and the
// reader had to go find it. These are the rules for recognising such a mention, turning it into
// a place on disk, and knowing how to draw what is there: code with its colours, markdown as a
// page. Pure, so the panel and the renderer agree without either owning the rules.

/** `path:line` or `path:line:col`, as editors and stack traces write it. */
const LINE_SUFFIX = /:(\d+)(?::\d+)?$/;

/**
 * A path as it appears inside backticks or a link: at least one separator, or a file name with
 * an extension; nothing that reads as a URL, and no spaces.
 */
const PATH_LIKE = /^(?:[a-zA-Z]:[\\/]|\\\\|\.{0,2}[\\/])?[\w.\-@()~ ]*(?:[\\/][\w.\-@()~ ]+)*\.[A-Za-z0-9]{1,8}(?::\d+(?::\d+)?)?$/;

/** Whether `text` (an inline code span, a link) reads as a path to a file. */
export function looksLikePath(text: string): boolean {
  const t = text.trim();
  if (!t || t.length > 300 || /\s{2,}|\n/.test(t)) return false;
  if (/^[a-z][a-z0-9+.-]*:\/\//i.test(t)) return false;
  if (/^(?:https?|mailto|file):/i.test(t)) return false;
  // A bare word with a dot is more often a domain, a version or a package than a file.
  if (!/[\\/]/.test(t) && !/\.(?:md|ts|tsx|js|jsx|mjs|cjs|json|rs|py|go|java|kt|c|h|cpp|hpp|cs|rb|php|sh|ps1|ya?ml|toml|xml|html|css|scss|sql|txt|env|lock|svg|csv)(?::\d+(?::\d+)?)?$/i.test(t)) return false;
  return PATH_LIKE.test(t);
}

/**
 * A path mentioned loose in a sentence: something with a separator and an extension, bounded by
 * spaces or punctuation. Narrower than `looksLikePath` on purpose — in prose a wrong guess is a
 * word turned into a button.
 */
const PATH_IN_TEXT = /(?<![\w:/\\.])((?:\.{1,2}[\\/]|[a-zA-Z]:[\\/])?[\w.\-@~]+(?:[\\/][\w.\-@~]+)+\.[A-Za-z0-9]{1,8}(?::\d+(?::\d+)?)?)(?=$|[\s)\]}>,;]|\.(?:\s|$))/g;

export type TextPart = { kind: "text"; text: string } | { kind: "path"; text: string };

/** `text` cut into plain runs and the paths in it, in order. */
export function splitPaths(text: string): TextPart[] {
  const out: TextPart[] = [];
  let last = 0;
  for (const m of text.matchAll(PATH_IN_TEXT)) {
    const start = m.index ?? 0;
    if (start > last) out.push({ kind: "text", text: text.slice(last, start) });
    out.push({ kind: "path", text: m[1] });
    last = start + m[1].length;
  }
  if (last < text.length) out.push({ kind: "text", text: text.slice(last) });
  return out;
}

/** The path and the line a mention points at, the `:42` peeled off. */
export function pathRef(ref: string): { path: string; line?: number } {
  const t = ref.trim();
  const m = LINE_SUFFIX.exec(t);
  if (!m) return { path: t };
  return { path: t.slice(0, m.index), line: Number(m[1]) };
}

export function isAbsolutePath(path: string): boolean {
  return /^(?:[a-zA-Z]:[\\/]|\\\\|\/)/.test(path);
}

/** `path` under `base`, with the separator `base` uses; an absolute path is left alone. */
export function resolvePath(path: string, base: string): string {
  if (isAbsolutePath(path) || !base) return path;
  const sep = base.includes("\\") ? "\\" : "/";
  const clean = path.replace(/^\.[\\/]/, "").replace(/[\\/]/g, sep);
  return `${base.replace(/[\\/]+$/, "")}${sep}${clean}`;
}

/** The last segment of a path. */
export function baseName(path: string): string {
  return path.replace(/[\\/]+$/, "").split(/[\\/]/).pop() ?? path;
}

export function isMarkdownPath(path: string): boolean {
  return /\.(?:md|mdx|markdown)$/i.test(path);
}

const BY_EXTENSION: Record<string, string> = {
  ts: "typescript", tsx: "tsx", mts: "typescript", cts: "typescript",
  js: "javascript", jsx: "jsx", mjs: "javascript", cjs: "javascript",
  json: "json", jsonc: "jsonc", md: "markdown", mdx: "mdx",
  rs: "rust", py: "python", go: "go", java: "java", kt: "kotlin", swift: "swift", dart: "dart",
  c: "c", h: "c", cpp: "cpp", hpp: "cpp", cc: "cpp", cs: "csharp", rb: "ruby", php: "php", lua: "lua",
  sh: "bash", bash: "bash", zsh: "bash", ps1: "powershell", bat: "bat", cmd: "bat",
  yaml: "yaml", yml: "yaml", toml: "toml", ini: "ini", xml: "xml", html: "html", htm: "html",
  css: "css", scss: "scss", less: "less", sql: "sql", graphql: "graphql", gql: "graphql",
  vue: "vue", svelte: "svelte", diff: "diff", patch: "diff", dockerfile: "dockerfile",
  csv: "csv", env: "dotenv", txt: "text", log: "text", lock: "text", svg: "xml",
};

/** The language a highlighter should read the file as, by its extension; "text" when unknown. */
export function languageOf(path: string): string {
  const name = baseName(path).toLowerCase();
  if (name === "dockerfile" || name.startsWith("dockerfile.")) return "dockerfile";
  if (name === "makefile") return "makefile";
  const ext = name.includes(".") ? name.slice(name.lastIndexOf(".") + 1) : "";
  return BY_EXTENSION[ext] ?? "text";
}

/** Past this a file is a log, not a document: only the head is shown. */
export const MAX_PREVIEW_BYTES = 512 * 1024;

/** Past this an image is not worth carrying through a data URL to look at. */
export const MAX_IMAGE_BYTES = 16 * 1024 * 1024;

/** The ones a browser draws on its own, by extension: nothing here needs decoding. */
const IMAGE_TYPES: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  avif: "image/avif",
  svg: "image/svg+xml",
  ico: "image/x-icon",
};

/**
 * The media type a file name implies, when it is one a browser can draw.
 *
 * By name and not by content on purpose: this decides whether to read the file as bytes at all,
 * and that decision has to be made before reading it.
 */
export function imageTypeOf(path: string): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_TYPES[ext];
}

/**
 * Whether a mention nobody could place on disk is worth looking for in the repo.
 *
 * An agent that writes `Composer.tsx` and nothing else names a file the reader knows and the app
 * does not: there is no folder to join it to, so every candidate is a guess at the root and every
 * guess misses. A path with a separator in it was already said in full — if it is not there, it is
 * not there, and asking git about it would only be a process spawned for nothing.
 */
export function shouldSearchRepo(path: string): boolean {
  return path.length > 0 && !/[\\/]/.test(path);
}

/**
 * The files `git ls-files` listed whose own name is `name`, repo-relative and in git's order.
 *
 * Case-insensitive: the mention is typed by hand as often as copied, and on Windows the file the
 * reader means is the same file either way.
 */
export function matchTrackedByName(lsFilesOutput: string, name: string): string[] {
  const wanted = baseName(name).toLowerCase();
  if (!wanted) return [];
  return lsFilesOutput
    .split("\n")
    .map(line => line.trim())
    .filter(line => line.length > 0 && baseName(line).toLowerCase() === wanted);
}
