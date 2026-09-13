/**
 * Where the composer's text sits inside a markdown ``` fence — used to make Enter, Tab and the
 * highlight layer behave like a code block instead of always sending or losing indentation.
 */

const FENCE_LINE = /^\s*```/;

export interface FenceRegion {
  start: number;
  end: number;
  /** False while the closing ``` has not been typed yet, which is most of the time you are writing. */
  closed: boolean;
}

/** The regions of `text` that sit inside a ``` fence, as [start, end) offsets over the string. */
export function fenceRegions(text: string): FenceRegion[] {
  const regions: FenceRegion[] = [];
  let offset = 0;
  let openStart: number | null = null;
  const lines = text.split("\n");
  for (const line of lines) {
    const lineEnd = offset + line.length;
    if (FENCE_LINE.test(line)) {
      if (openStart === null) {
        openStart = offset;
      } else {
        regions.push({ start: openStart, end: lineEnd, closed: true });
        openStart = null;
      }
    }
    offset = lineEnd + 1;
  }
  if (openStart !== null) {
    regions.push({ start: openStart, end: text.length, closed: false });
  }
  return regions;
}

/**
 * Whether the caret is inside an open or closed fence.
 *
 * The end counts as inside while the fence is still open, and that is the case that matters: the
 * caret sits at the end of the text for the whole time you are typing the code. Treating it as
 * outside meant Enter sent the half-written message, which is the thing this was written to stop.
 * A closed fence keeps its end exclusive — past the closing ``` you are out.
 */
export function insideFence(text: string, caret: number): boolean {
  return fenceRegions(text).some(r => caret > r.start && (r.closed ? caret < r.end : caret <= r.end));
}

/** The indentation of the line the caret is on, for carrying it to the next line. */
export function lineIndent(text: string, caret: number): string {
  const lineStart = text.lastIndexOf("\n", caret - 1) + 1;
  const match = /^[ \t]*/.exec(text.slice(lineStart, caret));
  return match ? match[0] : "";
}

/** One run of the highlight layer's text: outside every fence, or one of the three parts of one. */
export interface FenceSegment {
  kind: "plain" | "opener" | "body" | "closer";
  text: string;
  /** Which fence, counting from zero, so the layer can wrap one fence's parts in one box. */
  fence?: number;
}

/**
 * The layer's text cut at the fences, over `text` plus the trailing newline the layer appends so
 * its last line counts the way the textarea's does.
 *
 * Each fence is drawn as a block, and a block swallows the newline that follows it: left outside,
 * that newline would open a line of its own under the box — the textarea has no such line, and
 * every line after it would sit one row lower than the characters it is meant to be behind.
 */
export function fenceSegments(text: string, regions: FenceRegion[]): FenceSegment[] {
  const source = text + "\n";
  const segments: FenceSegment[] = [];
  let cursor = 0;
  regions.forEach((region, fence) => {
    if (region.start > cursor) segments.push({ kind: "plain", text: source.slice(cursor, region.start) });
    const end = source[region.end] === "\n" ? region.end + 1 : region.end;
    const openerBreak = source.indexOf("\n", region.start);
    const openerEnd = openerBreak === -1 || openerBreak >= end ? end : openerBreak + 1;
    segments.push({ kind: "opener", text: source.slice(region.start, openerEnd), fence });
    if (region.closed) {
      // The closing line, plus the newline it swallowed.
      const closerStart = source.lastIndexOf("\n", region.end - 1) + 1;
      if (closerStart > openerEnd) segments.push({ kind: "body", text: source.slice(openerEnd, closerStart), fence });
      segments.push({ kind: "closer", text: source.slice(Math.max(closerStart, openerEnd), end), fence });
    } else if (end > openerEnd) {
      segments.push({ kind: "body", text: source.slice(openerEnd, end), fence });
    }
    cursor = end;
  });
  if (cursor < source.length) segments.push({ kind: "plain", text: source.slice(cursor) });
  return segments;
}
