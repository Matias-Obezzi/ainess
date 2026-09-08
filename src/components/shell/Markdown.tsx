// Markdown renderer for agent answers and live text. Styles come from Tailwind classes here
// (no @tailwindcss/typography), so the output matches the shell's own type scale.
import { isValidElement, useState, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseDelegations } from "@/lib/providers";
import { openExternal, webUrl } from "@/lib/open-external";
import { cn } from "@/lib/utils";
import type { Delegation } from "@/types";
import { ChevronDown, ChevronRight, Share2 } from "lucide-react";
import { truncate } from "@/lib/format";
import { useT } from "@/i18n/useT";

/** Flattens whatever react-markdown handed us back into plain text. */
function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) return nodeText((node.props as { children?: ReactNode }).children);
  return "";
}


/** First non-empty line of a task, for the collapsed preview. */
function firstLine(text: string): string {
  const line = text.split("\n").map(l => l.trim()).find(l => l.length > 0) ?? "";
  return truncate(line.replace(/^#+\s*/, ""), 110);
}

/**
 * A ```delegate block shown as what it means, not as raw JSON. Collapsed by default (the task
 * text is usually a long brief); expanded, each task renders as markdown.
 */
function DelegationCard({ tasks }: { tasks: Delegation[] }) {
  const t = useT();
  const [open, setOpen] = useState(false);
  return (
    <div className="my-2 rounded-md border border-border bg-background/60">
      <button
        type="button"
        className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-xs font-medium hover:bg-accent/40 rounded-md"
        onClick={() => setOpen(o => !o)}
        aria-expanded={open}
      >
        {open ? <ChevronDown className="h-3.5 w-3.5 shrink-0" /> : <ChevronRight className="h-3.5 w-3.5 shrink-0" />}
        <Share2 className="h-3.5 w-3.5 shrink-0" />
        <span>{t("label.kind.delegation")}</span>
        <span className="text-muted-foreground font-normal truncate">
          → {tasks.map(t => t.agent).join(", ")}
        </span>
      </button>

      <div className="flex flex-col gap-2 px-2 pb-2">
        {tasks.map((t, i) => (
          <div key={i} className="text-xs flex flex-col gap-1">
            <div className="flex items-center gap-1.5">
              <span className="font-medium">{t.agent}</span>
              {t.model ? <span className="text-muted-foreground">· {t.model}</span> : null}
            </div>
            {open ? (
              <div className="rounded-md border border-border/60 bg-card px-2.5 py-2">
                <Markdown text={t.task} className="text-xs" />
              </div>
            ) : (
              <div className="text-muted-foreground truncate" title={t.task}>{firstLine(t.task)}</div>
            )}
          </div>
        ))}
      </div>
    </div>
  );
}

/** A ```delegate block whose JSON did not parse: the raw text, never passed off as an answer. */
function InvalidDelegation({ text }: { text: string }) {
  const t = useT();
  return (
    <div className="my-2 rounded-md border border-destructive/30 bg-destructive/5 p-2 text-xs">
      <span className="font-medium text-destructive">{t("markdown.invalidDelegation")}</span>
      <pre className="mt-1 overflow-x-auto whitespace-pre-wrap break-words font-mono text-[11px] text-muted-foreground">{text.trim()}</pre>
    </div>
  );
}

const components: Components = {
  p: ({ children }) => <p className="mb-2 last:mb-0 whitespace-pre-wrap break-words">{children}</p>,
  h1: ({ children }) => <h1 className="mb-2 mt-3 first:mt-0 text-base font-semibold">{children}</h1>,
  h2: ({ children }) => <h2 className="mb-2 mt-3 first:mt-0 text-sm font-semibold">{children}</h2>,
  h3: ({ children }) => <h3 className="mb-1 mt-2 first:mt-0 text-sm font-semibold">{children}</h3>,
  h4: ({ children }) => <h4 className="mb-1 mt-2 first:mt-0 text-sm font-semibold">{children}</h4>,
  ul: ({ children }) => <ul className="mb-2 list-disc pl-5 space-y-0.5">{children}</ul>,
  ol: ({ children }) => <ol className="mb-2 list-decimal pl-5 space-y-0.5">{children}</ol>,
  li: ({ children }) => <li className="break-words">{children}</li>,
  blockquote: ({ children }) => (
    <blockquote className="mb-2 border-l-2 border-border pl-3 text-muted-foreground">{children}</blockquote>
  ),
  hr: () => <hr className="my-3 border-border" />,
  strong: ({ children }) => <strong className="font-semibold">{children}</strong>,
  // An agent writes two kinds of link: web addresses, and paths inside the repo it is working on.
  // Only the first is something to open. The second never gets an `href`, because an `<a>` with a
  // relative one is followed by the window itself — inside the desktop app that means leaving for
  // `tauri.localhost/<path>`, with the whole app gone from under you.
  a: ({ href, children }) => {
    const url = webUrl(href);
    if (!url) return <span className="break-all underline decoration-dotted underline-offset-2">{children}</span>;
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer noopener"
        className="text-primary underline underline-offset-2 break-all"
        onClick={e => { e.preventDefault(); void openExternal(url); }}
      >
        {children}
      </a>
    );
  },
  code: ({ className, children }) => (
    <code className={cn("bg-background/60 rounded px-1 py-0.5 font-mono text-[0.9em] break-words", className)}>
      {children}
    </code>
  ),
  // The block renderer owns fenced code: it reads the language off the <code> child, so the
  // inline `code` renderer above never applies inside a block.
  pre: ({ children }) => {
    const child = Array.isArray(children) ? children[0] : children;
    const childProps = isValidElement(child) ? (child.props as { className?: string; children?: ReactNode }) : undefined;
    const lang = /language-([\w-]+)/.exec(childProps?.className ?? "")?.[1];
    const text = nodeText(childProps?.children ?? children);
    if (lang === "delegate") {
      const tasks = parseDelegations("```delegate\n" + text.trimEnd() + "\n```");
      if (tasks.length > 0) return <DelegationCard tasks={tasks} />;
      // Even when the JSON is broken, raw JSON is never what the user wants to read.
      return <InvalidDelegation text={text} />;
    }
    // An `ask` block is drawn as the question itself, right under this answer (`InlineQuestion`),
    // so printing its JSON here says the same thing twice — the second time unreadably.
    if (lang === "ask") return null;
    return (
      <pre className="mb-2 overflow-x-auto rounded-md bg-background/60 p-2 font-mono text-xs">
        <code>{text}</code>
      </pre>
    );
  },
  table: ({ children }) => (
    <div className="mb-2 overflow-x-auto">
      <table className="w-full border-collapse text-xs">{children}</table>
    </div>
  ),
  th: ({ children }) => <th className="border border-border px-2 py-1 text-left font-medium">{children}</th>,
  td: ({ children }) => <td className="border border-border px-2 py-1 align-top">{children}</td>,
  img: ({ src, alt }) => <img src={typeof src === "string" ? src : undefined} alt={alt ?? ""} className="max-w-full rounded" />,
};

const plugins = [remarkGfm];

/** Renders `text` as markdown (GFM). Empty text renders nothing. */
export function Markdown({ text, className }: { text: string; className?: string }) {
  const content = text ?? "";
  if (!content.trim()) return null;
  return (
    <div className={cn("text-sm leading-relaxed break-words", className)}>
      <ReactMarkdown remarkPlugins={plugins} components={components}>
        {content}
      </ReactMarkdown>
    </div>
  );
}
