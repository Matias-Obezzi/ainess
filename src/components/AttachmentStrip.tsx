// What a sent message shows of what was attached to it: the same chips the composer draws before
// it goes, instead of the list of paths the agent gets.
//
// The paths are real files inside the project, so an image is read back off disk and drawn. It is
// read once, on demand and capped: a thread scrolled back through a year of screenshots must not
// pull all of them into memory to show a row of thumbnails.
import { useEffect, useState } from "react";
import { getTransport } from "@/lib/transport";
import { baseName } from "@/lib/file-preview";
import { useAppStore } from "@/store";
import { useT } from "@/i18n/useT";
import { FileText } from "lucide-react";

/** Past this an attachment is shown as a name, not as a picture. */
const MAX_THUMBNAIL_BYTES = 4 * 1024 * 1024;

const IMAGE_EXTENSIONS: Record<string, string> = {
  png: "image/png",
  jpg: "image/jpeg",
  jpeg: "image/jpeg",
  gif: "image/gif",
  webp: "image/webp",
  bmp: "image/bmp",
  avif: "image/avif",
};

/** The media type an attachment's name implies, when that type is one a browser draws. */
export function imageTypeOf(path: string): string | undefined {
  const ext = path.split(".").pop()?.toLowerCase() ?? "";
  return IMAGE_EXTENSIONS[ext];
}

/** One attachment: the picture when it is one, its name when it is not. */
function AttachmentChip({ path, workspaceDir }: { path: string; workspaceDir: string }) {
  const t = useT();
  const openPreview = useAppStore(state => state.openPreview);
  const type = imageTypeOf(path);
  const [src, setSrc] = useState<string | null>(null);

  useEffect(() => {
    if (!type || !workspaceDir) return;
    let alive = true;
    void getTransport()
      .readFileBytes(`${workspaceDir}/${path}`, MAX_THUMBNAIL_BYTES)
      .then(b64 => { if (alive && b64) setSrc(`data:${type};base64,${b64}`); })
      .catch(() => { /* a file that moved or cannot be read is shown as its name */ });
    return () => { alive = false; };
  }, [path, type, workspaceDir]);

  return (
    <button
      type="button"
      title={baseName(path)}
      aria-label={baseName(path)}
      className="overflow-hidden rounded-md border border-border bg-card text-left transition hover:border-foreground/30"
      onClick={() => openPreview(path)}
    >
      {src ? (
        <img src={src} alt={baseName(path)} className="h-24 w-24 object-cover" />
      ) : (
        <span className="flex h-24 w-24 flex-col items-center justify-center gap-1 px-1.5 text-center">
          <FileText className="h-5 w-5 shrink-0 text-muted-foreground" />
          <span className="w-full truncate text-[10px] text-muted-foreground">
            {type ? t("attachments.image") : baseName(path)}
          </span>
        </span>
      )}
    </button>
  );
}

/** The row of what a message carried. Renders nothing when it carried nothing. */
export function AttachmentStrip({ paths, workspaceDir }: { paths: string[]; workspaceDir: string }) {
  if (paths.length === 0) return null;
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {paths.map(path => <AttachmentChip key={path} path={path} workspaceDir={workspaceDir} />)}
    </div>
  );
}
