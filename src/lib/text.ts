/** Text helpers for copying agent answers out of the app. */

/** Markdown markers that make "copiar como markdown" worth offering. */
const MARKDOWN_MARKERS = [
  /^\s{0,3}#{1,6}\s/m, // headings
  /^\s{0,3}[-*+]\s/m, // bullet lists
  /^\s{0,3}\d+\.\s/m, // ordered lists
  /^\s{0,3}>\s/m, // quotes
  /^\s{0,3}(?:```|~~~)/m, // fenced code
  /^\s{0,3}\|.*\|/m, // tables
  /\[[^\]]+\]\([^)]+\)/, // links
  /(\*\*|__)[^\s*_][\s\S]*?\1/, // bold
  /`[^`\n]+`/, // inline code
];

/** Whether `text` carries markdown formatting (and not just plain prose). */
export function hasMarkdown(text: string): boolean {
  return MARKDOWN_MARKERS.some(re => re.test(text));
}

/**
 * The same text without its markdown syntax, for pasting into a plain field.
 * Deliberately simple: it drops the markers, it does not re-render the document.
 */
export function toPlainText(text: string): string {
  return text
    .replace(/```[^\n]*\n([\s\S]*?)```/g, (_, code: string) => code) // fenced code keeps its body
    .replace(/^\s{0,3}#{1,6}\s+/gm, "") // headings
    .replace(/^\s{0,3}>\s?/gm, "") // quotes
    .replace(/^(\s*)[-*+]\s+/gm, "$1• ") // bullets
    .replace(/!\[([^\]]*)\]\([^)]*\)/g, "$1") // images
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1 ($2)") // links
    .replace(/(\*\*|__)(?=\S)([\s\S]*?\S)\1/g, "$2") // bold
    .replace(/(\*|_)(?=\S)([^*_\n]*?\S)\1/g, "$2") // italics
    .replace(/`([^`\n]+)`/g, "$1") // inline code
    .replace(/^\s{0,3}(?:[-*_]\s*){3,}$/gm, "") // rules
    .trim();
}
