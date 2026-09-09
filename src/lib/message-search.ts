/**
 * In-memory message search across project feed and chat conversations.
 *
 * Messages are where the actual conversation happened: weeks later you remember
 * a phrase someone said, not the title of a task. This module provides pure,
 * store-agnostic searching over in-memory CommMessage feeds and ChatMessage
 * histories, producing excerpts centered on the match with normalized case-
 * and accent-insensitive matching.
 */

import type { CommMessage, ChatMessage } from "@/types";

export interface MessageHit {
  /** Where it lives, so the palette knows where to take you. */
  source: { kind: "project"; projectId: string; runId?: string } | { kind: "chat"; chatId: string };
  /** Id of the message itself. */
  id: string;
  ts: number;
  /** Who said it: an agent id, or "user". */
  from: string;
  /** The line to show, with the match in the middle of it. */
  excerpt: string;
}

/** Lowercases and strips accents so "orquestacion" matches "Orquestación". */
export function normalize(text: string): string {
  return text.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
}

/**
 * Normalizes text character-by-character to guarantee a strict 1-to-1 length
 * mapping with the original string for reliable match index calculation.
 */
function toNorm1to1(text: string): string {
  let out = "";
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    const nc = normalize(c);
    out += nc.length === 1 ? nc : c.toLowerCase();
  }
  return out;
}

/**
 * Extracts a window of `width` characters centered around the match in `text`.
 *
 * - Collapses newlines and repeated whitespace to a single space.
 * - Finds the match (normalized) and centers a window of `width` characters around it.
 * - Prepends '…' if cut at the front; appends '…' if cut at the end.
 * - If no match, returns the first `width` characters.
 * - Preserves original casing and diacritics of the source text.
 */
export function excerptAround(text: string, query: string, width = 100): string {
  if (!text) return "";
  const clean = text.replace(/\s+/g, " ").trim();
  if (width <= 0) return "";
  if (clean.length <= width) {
    return clean;
  }

  const q = normalize(query.trim().replace(/\s+/g, " "));
  let matchIndex = -1;
  let matchLen = 0;

  if (q.length > 0) {
    const norm = toNorm1to1(clean);
    matchIndex = norm.indexOf(q);
    if (matchIndex !== -1) {
      matchLen = q.length;
    }
  }

  let start: number;
  let end: number;

  if (matchIndex === -1) {
    start = 0;
    end = width;
  } else {
    const matchCenter = matchIndex + Math.floor(matchLen / 2);
    start = Math.floor(matchCenter - width / 2);
    end = start + width;

    if (start < 0) {
      start = 0;
      end = width;
    } else if (end > clean.length) {
      end = clean.length;
      start = Math.max(0, clean.length - width);
    }
  }

  const prefix = start > 0 ? "…" : "";
  const suffix = end < clean.length ? "…" : "";

  return `${prefix}${clean.slice(start, end)}${suffix}`;
}

/**
 * Searches in-memory project feed and chat messages.
 *
 * Rules:
 * - Query shorter than 3 trimmed characters returns `[]`.
 * - Case and accent insensitive matching in both directions.
 * - Skips empty or whitespace-only messages.
 * - Skips 'tool' and 'stderr' messages (machine noise).
 * - Results sorted newest to oldest (ts descending).
 * - Defaults to returning up to `limit` (20) hits.
 */
export function searchMessages(
  query: string,
  sources: {
    messages: CommMessage[];
    chats: Array<{ id: string; messages: ChatMessage[] }>;
  },
  limit = 20
): MessageHit[] {
  const trimmed = query.trim();
  if (trimmed.length < 3) {
    return [];
  }
  if (limit <= 0) {
    return [];
  }

  const q = normalize(trimmed.replace(/\s+/g, " "));
  if (q.length < 3) {
    return [];
  }

  // The haystack is flattened the same way the query is: two words the writer happened to split
  // across a line break are still the two words you are looking for.
  const matches = (text: string) => normalize(text.replace(/\s+/g, " ")).includes(q);

  const hits: MessageHit[] = [];

  // Project messages
  const commMessages = sources.messages ?? [];
  for (const m of commMessages) {
    if (m.kind === "tool" || m.kind === "stderr") {
      continue;
    }
    if (!m.text || !m.text.trim()) {
      continue;
    }
    if (!matches(m.text)) {
      continue;
    }

    hits.push({
      id: m.id,
      ts: m.ts ?? 0,
      from: m.fromAgentId ?? "",
      source: {
        kind: "project",
        projectId: m.projectId ?? "",
        ...(m.runId ? { runId: m.runId } : {}),
      },
      excerpt: excerptAround(m.text, trimmed),
    });
  }

  // Chat messages
  const chats = sources.chats ?? [];
  for (const chat of chats) {
    for (const m of chat.messages ?? []) {
      if (!m.text || !m.text.trim()) {
        continue;
      }
      if (!matches(m.text)) {
        continue;
      }

      hits.push({
        id: m.id,
        ts: m.ts ?? 0,
        from: m.from ?? "",
        source: {
          kind: "chat",
          chatId: chat.id,
        },
        excerpt: excerptAround(m.text, trimmed),
      });
    }
  }

  hits.sort((a, b) => b.ts - a.ts);

  return hits.slice(0, limit);
}
