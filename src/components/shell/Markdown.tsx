// Markdown renderer for agent answers and live text. Styles come from Tailwind classes here
// (no @tailwindcss/typography), so the output matches the shell's own type scale.
import { isValidElement, type MouseEvent, type ReactNode } from "react";
import ReactMarkdown, { type Components } from "react-markdown";
import remarkGfm from "remark-gfm";
import { parseDelegations } from "@/lib/providers";
import { isTauri } from "@/lib/tauri";
import { cn } from "@/lib/utils";
import type { Delegation } from "@/types";
import { Share2 } from "lucide-react";

/** Flattens whatever react-markdown handed us back into plain text. */
function nodeText(node: ReactNode): string {
  if (node === null || node === undefined || typeof node === "boolean") return "";
  if (typeof node === "string" || typeof node === "number") return String(node);
  if (Array.isArray(node)) return node.map(nodeText).join("");
  if (isValidElement(node)) return nodeText((node.props as { children?: ReactNode }).children);
  return "";
}

function openLink(e: MouseEvent<HTMLAnchorElement>, href?: string) {
  if (!href || !isTauri()) return;
  e.preventDefault();
  void import("@tauri-apps/plugin-opener").then(m => m.openUrl(href)).catch(() => {});
}

/** A ```delegate block shown as what it means, not as raw JSON. */
function DelegationCard({ tasks }: { tasks: Delegation[] }) {
  return (
    <div className="my-2 rounded-md border border-border bg-background/60 p-2">
      <div className="flex items-center gap-1.5 text-xs font-medium">
        <Share2 className="h-3.5 w-3.5" />
        Delegación
      </div>
      <ul className="mt-1.5 flex flex-col gap-1">
        {tasks.map((t, i) => (
          <li key={i} className="text-xs">
            <span className="font-medium">{t.agent}</span>
            {t.model ? <span className="text-muted-foreground"> · {t.model}</span> : null}
            <span className="text-muted-foreground">: </span>
            <span className="whitespace-pre-wrap break-words">{t.task}</span>
          </li>
        ))}
      </ul>
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
  a: ({ href, children }) => (
    <a
      href={href}
      target="_blank"
      rel="noreferrer noopener"
      className="text-primary underline underline-offset-2 break-all"
      onClick={e => openLink(e, href)}
    >
      {children}
    </a>
  ),
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
      const tasks = parseDelegations("```delegate\n" + text + "\n```");
      if (tasks.length > 0) return <DelegationCard tasks={tasks} />;
    }
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
