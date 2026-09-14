// The file an agent named, opened beside the conversation: code in its colours, markdown as a
// page with the raw text one switch away. See `lib/file-preview.ts` for what a mention is.
import { useEffect, useRef, useState } from "react";
import { Code2, Copy, FolderOpen, X } from "lucide-react";
import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from "@/components/ui/dropdown-menu";
import { Markdown } from "@/components/shell/Markdown";
import { useAppStore } from "@/store";
import { useT } from "@/i18n/useT";
import { getTransport } from "@/lib/transport";
import { copyText } from "@/lib/clipboard";
import { openInEditor, revealPath } from "@/lib/open-external";
import { toast } from "@/components/ui/toast";
import { baseName, isMarkdownPath, languageOf, MAX_PREVIEW_BYTES } from "@/lib/file-preview";
import { cn } from "@/lib/utils";

type Loaded =
  | { state: "loading" }
  | { state: "missing" }
  | { state: "ready"; path: string; text: string; truncated: boolean };

/** Dark or light, from the theme in use: the highlighter's palette has to match the page's. */
function pageIsDark(): boolean {
  if (typeof document === "undefined") return true;
  const probe = document.createElement("span");
  probe.style.color = "var(--background)";
  document.body.appendChild(probe);
  const rgb = getComputedStyle(probe).color.match(/\d+(\.\d+)?/g)?.map(Number) ?? [0, 0, 0];
  probe.remove();
  const [r, g, b] = rgb;
  return 0.2126 * r + 0.7152 * g + 0.0722 * b < 128;
}

/** Code as shiki draws it, or the text escaped in a plain <pre> while shiki loads or when it cannot. */
function CodeView({ text, path, line }: { text: string; path: string; line?: number }) {
  const [html, setHtml] = useState<string | null>(null);
  const box = useRef<HTMLDivElement>(null);

  useEffect(() => {
    let alive = true;
    setHtml(null);
    (async () => {
      try {
        const { codeToHtml } = await import("shiki/bundle/web");
        const out = await codeToHtml(text, { lang: languageOf(path), theme: pageIsDark() ? "github-dark-default" : "github-light-default" });
        if (alive) setHtml(out);
      } catch {
        // A language the bundle does not carry, or the bundle itself: plain text is still the file.
        if (alive) setHtml("");
      }
    })();
    return () => { alive = false; };
  }, [text, path]);

  // The line the mention pointed at, once the lines exist: scrolled to and marked. `scrollTop` on
  // the one box that scrolls, never `scrollIntoView` (see the black chat in 0.16.0).
  useEffect(() => {
    if (html === null || !line || !box.current) return;
    const lines = box.current.querySelectorAll<HTMLElement>(".line");
    const target = lines[line - 1];
    if (!target) return;
    for (const l of lines) l.classList.remove("target");
    target.classList.add("target");
    box.current.scrollTop = Math.max(0, target.offsetTop - box.current.clientHeight / 3);
  }, [html, line]);

  if (html) {
    return <div ref={box} className="file-preview h-full overflow-auto p-3 text-xs" dangerouslySetInnerHTML={{ __html: html }} />;
  }
  return (
    <div ref={box} className="file-preview h-full overflow-auto p-3 text-xs">
      <pre><code>{text.split("\n").map((l, i) => <span key={i} className="line">{l}{"\n"}</span>)}</code></pre>
    </div>
  );
}

export function FileDockSection() {
  const t = useT();
  const preview = useAppStore(state => state.previewFile);
  const closePreview = useAppStore(state => state.closePreview);
  const editors = useAppStore(state => state.editors);
  const [loaded, setLoaded] = useState<Loaded>({ state: "loading" });
  const [raw, setRaw] = useState(false);

  useEffect(() => {
    let alive = true;
    setLoaded({ state: "loading" });
    setRaw(false);
    if (!preview) return;
    (async () => {
      const transport = getTransport();
      const existing = await transport.filesExistAbs(preview.candidates).catch(() => []);
      const path = existing[0];
      const text = path ? await transport.readFileAbs(path).catch(() => null) : null;
      if (!alive) return;
      if (!path || text === null) {
        setLoaded({ state: "missing" });
        return;
      }
      const truncated = text.length > MAX_PREVIEW_BYTES;
      setLoaded({ state: "ready", path, text: truncated ? text.slice(0, MAX_PREVIEW_BYTES) : text, truncated });
    })();
    return () => { alive = false; };
  }, [preview]);

  if (!preview) return null;
  const path = loaded.state === "ready" ? loaded.path : preview.candidates[0];
  const markdown = isMarkdownPath(path);

  return (
    <div className="flex h-full flex-col" data-testid="file-preview">
      <div className="flex shrink-0 items-center gap-2 border-b border-border bg-muted/30 px-3 py-2">
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="truncate text-sm font-medium leading-none">{baseName(path)}</span>
          <span className="mt-1 truncate text-[10px] text-muted-foreground" title={path}>{path}</span>
        </div>
        {markdown && loaded.state === "ready" && (
          <div className="flex shrink-0 rounded-md border border-border text-[11px]">
            <button type="button" className={cn("px-2 py-0.5", !raw && "bg-accent")} onClick={() => setRaw(false)}>{t("file.rendered")}</button>
            <button type="button" className={cn("px-2 py-0.5", raw && "bg-accent")} onClick={() => setRaw(true)}>{t("file.raw")}</button>
          </div>
        )}
        {editors.length > 0 && (
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" className="h-6 w-6" title={t("project.openIn")} aria-label={t("project.openIn")}>
                <Code2 className="h-4 w-4 text-muted-foreground" />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent>
              {editors.map(editor => (
                <DropdownMenuItem key={editor.id} onSelect={() => void openInEditor(editor, path)}>{editor.label}</DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
        <Button variant="ghost" size="icon" className="h-6 w-6" title={t("file.reveal")} aria-label={t("file.reveal")}
          onClick={() => void revealPath(path).then(ok => { if (!ok) toast.error(t("markdown.revealFailed")); })}>
          <FolderOpen className="h-4 w-4 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6" title={t("sidebar.copyPath")} aria-label={t("sidebar.copyPath")}
          onClick={() => void copyText(path, t("sidebar.pathCopied"))}>
          <Copy className="h-4 w-4 text-muted-foreground" />
        </Button>
        <Button variant="ghost" size="icon" className="h-6 w-6 rounded-md hover:bg-muted" onClick={closePreview} aria-label={t("common.close")}>
          <X className="h-4 w-4 text-muted-foreground" />
        </Button>
      </div>
      <div className="min-h-0 flex-1">
        {loaded.state === "loading" && <div className="p-3 text-xs text-muted-foreground">{t("file.loading")}</div>}
        {loaded.state === "missing" && <div className="p-3 text-xs text-muted-foreground">{t("file.missing", { path: preview.ref })}</div>}
        {loaded.state === "ready" && (
          <div className="flex h-full flex-col">
            {loaded.truncated && <div className="shrink-0 border-b border-border px-3 py-1 text-[11px] text-muted-foreground">{t("file.truncated")}</div>}
            <div className="min-h-0 flex-1">
              {markdown && !raw
                ? <div className="h-full overflow-auto p-4"><Markdown text={loaded.text} /></div>
                : <CodeView text={loaded.text} path={loaded.path} line={preview.line} />}
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
