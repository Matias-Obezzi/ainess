// What the user attaches in the composer: a screenshot pasted with Ctrl+V, a PDF picked with the
// clip. The file is copied into the project's own `.ainess/attachments/` folder and the prompt
// gets its path, which is the one thing every CLI can do with it — they all read files from the
// repo they are working in.
import { getTransport } from "@/lib/transport";
import { translateNow } from "@/i18n/useT";

/** Where inside the project the copies live, relative to the workspace. */
export const ATTACHMENTS_DIR = ".ainess/attachments";

/** Anything bigger than this is a mistake, not an attachment: it would go through base64 whole. */
export const MAX_ATTACHMENT_BYTES = 25 * 1024 * 1024;

const IMAGE_RE = /^image\//;

export function isImage(file: { type: string }): boolean {
  return IMAGE_RE.test(file.type);
}

/**
 * The name the copy gets: dated so two screenshots pasted a minute apart do not overwrite each
 * other, and stripped of everything a shell or a path would read as something else.
 */
export function attachmentName(original: string, at: Date): string {
  const pad = (n: number) => String(n).padStart(2, "0");
  const stamp = `${at.getFullYear()}${pad(at.getMonth() + 1)}${pad(at.getDate())}-${pad(at.getHours())}${pad(at.getMinutes())}${pad(at.getSeconds())}`;
  const clean = (original || "file")
    .replace(/[/\\]/g, "-")
    .replace(/[^A-Za-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+/, "")
    .slice(-60);
  return `${stamp}-${clean || "file"}`;
}

/** Bytes as something a person reads. */
export function humanSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

/**
 * The lines added to the prompt. Relative paths: the agent runs inside the workspace, and an
 * absolute Windows path in a prompt is one more thing for it to mangle.
 */
export function attachmentsBlock(paths: string[]): string {
  if (paths.length === 0) return "";
  return `\n\n${translateNow("attachments.promptHeader")}\n${paths.map(p => `- ${p}`).join("\n")}`;
}

/** A `File` as base64, without the `data:...;base64,` prefix a data URL carries. */
async function toBase64(file: File): Promise<string> {
  const buffer = await file.arrayBuffer();
  const bytes = new Uint8Array(buffer);
  let binary = "";
  // In one go a big file blows the argument limit of `apply`, so it goes in chunks.
  const CHUNK = 0x8000;
  for (let i = 0; i < bytes.length; i += CHUNK) {
    binary += String.fromCharCode(...bytes.subarray(i, i + CHUNK));
  }
  return btoa(binary);
}

/**
 * Copies each file into the project and answers with the paths to put in the prompt, relative to
 * the workspace. A file that cannot be written is left out rather than losing the whole message.
 */
export async function saveAttachments(files: File[], workspaceDir: string, now = new Date()): Promise<string[]> {
  if (files.length === 0 || !workspaceDir) return [];
  const transport = getTransport();
  const saved: string[] = [];
  const used = new Set<string>();
  for (const file of files) {
    // Same second, same name (two screenshots pasted at once): the second would land on the first.
    let name = attachmentName(file.name, now);
    for (let n = 2; used.has(name); n++) name = attachmentName(`${n}-${file.name}`, now);
    used.add(name);
    try {
      await transport.writeFileBytes(`${workspaceDir}/${ATTACHMENTS_DIR}/${name}`, await toBase64(file));
      saved.push(`${ATTACHMENTS_DIR}/${name}`);
    } catch {
      // Reported by the caller: one unreadable file must not swallow the message.
    }
  }
  return saved;
}
