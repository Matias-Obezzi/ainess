// Skills where each CLI keeps its own: finding them, and keeping them in step with ainess's.
//
// A skill is a folder with a SKILL.md — `name` and `description` in its frontmatter, instructions
// below — and whatever it needs beside it. Claude Code reads them from ~/.claude/skills; the open
// Agent Skills layout, ~/.agents/skills, is read by Codex, Copilot, opencode and others (the
// `skills` tool installs there and links them into ~/.claude/skills). Claude's own synced skills
// sit under ~/.claude/skills/synced.
//
// Same rules as MCP (`lib/mcp-native`): only skills meant for every agent go out, only folders
// ainess wrote are ever changed or removed (`config.skillsOwned`), and only into a skills folder
// the user already has.
import type { Plugin, Skill, SkillSource } from "@/types";
import { getTransport } from "@/lib/transport";
import { useAppStore } from "@/store";
import { skillMarkdown, skillSlug } from "@/lib/project-folder";
import { log } from "@/lib/logger";

export interface ParsedSkill {
  name: string;
  description: string;
  body: string;
}

/** A YAML scalar as frontmatter writes it: plain, "double-quoted" or 'single-quoted'. */
function scalar(raw: string): string {
  const v = raw.trim();
  if (v.startsWith('"')) {
    try { return JSON.parse(v); } catch { return v.slice(1, -1); }
  }
  if (v.startsWith("'")) return v.slice(1, v.endsWith("'") ? -1 : undefined).replace(/''/g, "'");
  return v;
}

/**
 * A SKILL.md's `name`, `description` and body. Only the top-level scalars are read — a nested map
 * (`metadata:`) is skipped — including the folded and literal blocks (`>` and `|`) long
 * descriptions use. Null without frontmatter: that is not a skill file.
 */
export function parseSkillMd(text: string): ParsedSkill | null {
  const normalized = text.replace(/^﻿/, "").replace(/\r\n/g, "\n");
  const match = /^---\n([\s\S]*?)\n---\n?([\s\S]*)$/.exec(normalized);
  if (!match) return null;
  const fields: Record<string, string> = {};
  const lines = match[1].split("\n");
  for (let i = 0; i < lines.length; i++) {
    const m = /^([A-Za-z_][\w-]*):\s?(.*)$/.exec(lines[i]);
    if (!m) continue;
    const [, key, rest] = m;
    if (/^[>|][+-]?\s*$/.test(rest)) {
      const block: string[] = [];
      while (i + 1 < lines.length && (/^\s+/.test(lines[i + 1]) || lines[i + 1] === "")) block.push(lines[++i].trim());
      fields[key] = rest.startsWith(">") ? block.join(" ").replace(/\s+/g, " ").trim() : block.join("\n").trim();
    } else if (rest.trim()) {
      fields[key] = scalar(rest);
    } else {
      // Nothing after the colon: a nested map (`metadata:` with `author: …` under it), skipped; or
      // a plain value that goes on over the indented lines below, folded into one.
      const block: string[] = [];
      while (i + 1 < lines.length && /^\s+\S/.test(lines[i + 1])) block.push(lines[++i]);
      if (block.length && !/^\s+[\w-]+:(\s|$)/.test(block[0]) && !/^\s+-\s/.test(block[0])) {
        fields[key] = block.map(l => l.trim()).join(" ").replace(/\s+/g, " ").trim();
      }
    }
  }
  if (!fields.name) return null;
  return { name: fields.name, description: fields.description ?? "", body: match[2].trim() };
}

export interface DetectedSkill {
  name: string;
  description: string;
  body: string;
  dir: string;
  sources: SkillSource[];
}

/** Where each tool keeps its skills, relative to the home folder. */
const SKILL_ROOTS: Array<{ rel: string; source: SkillSource }> = [
  { rel: ".claude/skills", source: "claude-code" },
  { rel: ".agents/skills", source: "agents" },
  { rel: ".codex/skills", source: "codex" },
  { rel: ".copilot/skills", source: "copilot" },
  { rel: ".config/opencode/skill", source: "opencode" },
  { rel: ".config/opencode/skills", source: "opencode" },
  { rel: ".gemini/skills", source: "gemini" },
];

const join = (sep: string, ...parts: string[]) => parts.join(sep);

/**
 * Every skill folder in the places tools keep them, once per skill name, listing every tool it was
 * found in. Hidden folders (Codex's own `.system`) are left out; Claude's synced skills are read
 * from the folders it syncs them into.
 */
export async function detectSkills(): Promise<DetectedSkill[]> {
  const transport = getTransport();
  const home = await transport.homeDir().catch(() => null);
  if (!home) return [];
  const sep = home.includes("\\") ? "\\" : "/";
  const found: DetectedSkill[] = [];

  const readFolder = async (dir: string, source: SkillSource) => {
    const text = await transport.readFileAbs(join(sep, dir, "SKILL.md")).catch(() => null);
    const parsed = text ? parseSkillMd(text) : null;
    if (!parsed) return;
    const same = found.find(f => f.name.toLowerCase() === parsed.name.toLowerCase());
    if (same) {
      if (!same.sources.includes(source)) same.sources.push(source);
      return;
    }
    found.push({ ...parsed, dir, sources: [source] });
  };

  for (const { rel, source } of SKILL_ROOTS) {
    const root = join(sep, home, ...rel.split("/"));
    for (const entry of (await transport.listDir(root).catch(() => null)) ?? []) {
      if (!entry.isDir || entry.name.startsWith(".")) continue;
      if (source === "claude-code" && entry.name === "synced") {
        // synced/<account>/<skill>/SKILL.md
        for (const bucket of (await transport.listDir(join(sep, root, "synced")).catch(() => null)) ?? []) {
          if (!bucket.isDir || bucket.name.startsWith(".")) continue;
          for (const skill of (await transport.listDir(join(sep, root, "synced", bucket.name)).catch(() => null)) ?? []) {
            if (skill.isDir && !skill.name.startsWith(".")) await readFolder(join(sep, root, "synced", bucket.name, skill.name), "claude-synced");
          }
        }
        continue;
      }
      await readFolder(join(sep, root, entry.name), source);
    }
  }
  return found;
}

/** Whether ainess already has this skill, by name. */
export function skillKnown(skills: Skill[], name: string): boolean {
  return skills.some(s => s.name.toLowerCase() === name.toLowerCase() || skillSlug(s) === name.toLowerCase());
}

/** A found skill as ainess keeps it: pointing at its folder, for every agent. */
export function skillFromDetected(d: DetectedSkill): Skill {
  return {
    id: crypto.randomUUID(),
    name: d.name,
    ...(d.description ? { description: d.description } : {}),
    content: d.body,
    enabledFor: "all",
    dir: d.dir,
    source: d.sources[0],
  };
}

/**
 * Whether something came from Claude itself — a skill or a plugin it synced or installed. Claude
 * Code already has those; writing them back into its own folders would show each one twice.
 */
export function cameFromClaude(item: { source?: string; plugin?: string }, plugins: Plugin[] | undefined): boolean {
  if (item.source === "claude-code" || item.source === "claude-synced") return true;
  if (!item.plugin) return false;
  const plugin = (plugins ?? []).find(p => p.id === item.plugin);
  return plugin?.source === "claude-synced" || plugin?.source === "claude-code";
}

// ---- Writing into each CLI ---------------------------------------------------------------------

export type SkillTarget = "claude-code" | "agents";
export const SKILL_TARGETS: Array<{ target: SkillTarget; rel: string }> = [
  { target: "claude-code", rel: ".claude/skills" },
  { target: "agents", rel: ".agents/skills" },
];

export interface SkillTargetResult {
  status: "synced" | "not-installed" | "error";
  added: number;
  updated: number;
  removed: number;
  skipped: string[];
  error?: string;
}

let lastResults: Partial<Record<SkillTarget, SkillTargetResult>> = {};
const listeners = new Set<() => void>();
export function subscribeNativeSkills(fn: () => void): () => void {
  listeners.add(fn);
  return () => { listeners.delete(fn); };
}
export function nativeSkillsResults(): Partial<Record<SkillTarget, SkillTargetResult>> {
  return lastResults;
}

/** What a skill's SKILL.md says, wherever it lives: its folder's file, or the one ainess writes. */
async function skillText(skill: Skill, sep: string): Promise<string | null> {
  if (!skill.dir) return skillMarkdown(skill);
  const s = skill.dir.includes("\\") ? "\\" : sep;
  return getTransport().readFileAbs(`${skill.dir}${s}SKILL.md`).catch(() => null);
}

/** Puts one skill into `folder`: its own folder copied whole, or a SKILL.md written for it. */
async function install(skill: Skill, folder: string, sep: string): Promise<void> {
  const transport = getTransport();
  if (skill.dir) await transport.copySkillDir(skill.dir, folder);
  else await transport.writeFileAbs(`${folder}${sep}SKILL.md`, skillMarkdown(skill));
}

/**
 * Brings each skills folder the user has in step with ainess's shared skills. A skill already
 * there under its name that ainess did not write is the user's, and is left alone.
 */
export async function syncNativeSkills(): Promise<Partial<Record<SkillTarget, SkillTargetResult>>> {
  const store = useAppStore.getState();
  if (store.config.skillsNativeSync === false) return {};
  const transport = getTransport();
  const home = await transport.homeDir().catch(() => null);
  if (!home) return {};
  const sep = home.includes("\\") ? "\\" : "/";
  // Only the shared ones, and never one whose folder already is one of these folders' own skills.
  const shared = store.config.skills.filter(s => s.enabledFor === "all" && (s.content.trim() || s.dir));
  const ownedNow = { ...(store.config.skillsOwned ?? {}) };
  const results: Partial<Record<SkillTarget, SkillTargetResult>> = {};

  for (const { target, rel } of SKILL_TARGETS) {
    const root = join(sep, home, ...rel.split("/"));
    const entries = await transport.listDir(root).catch(() => null);
    // A tool that is not used here has no skills folder; one is not made for it.
    if (entries === null) { results[target] = { status: "not-installed", added: 0, updated: 0, removed: 0, skipped: [] }; continue; }
    const existing = new Set(entries.filter(e => e.isDir).map(e => e.name));
    const mine = new Set(ownedNow[target] ?? []);
    // Claude Code already has what came from Claude; copying it into its folder would list it twice.
    const forTarget = target === "claude-code" ? shared.filter(s => !cameFromClaude(s, store.config.plugins)) : shared;
    const result: SkillTargetResult = { status: "synced", added: 0, updated: 0, removed: 0, skipped: [] };
    const owned: string[] = [];
    try {
      for (const skill of forTarget) {
        const slug = skillSlug(skill);
        const folder = join(sep, root, slug);
        if (!existing.has(slug)) {
          await install(skill, folder, sep);
          result.added++;
          owned.push(slug);
        } else if (mine.has(slug)) {
          owned.push(slug);
          const [want, have] = await Promise.all([skillText(skill, sep), transport.readFileAbs(join(sep, folder, "SKILL.md")).catch(() => null)]);
          if (want !== null && want !== have) { await install(skill, folder, sep); result.updated++; }
        } else {
          result.skipped.push(skill.name);
        }
      }
      const wanted = new Set(forTarget.map(skillSlug));
      for (const slug of mine) {
        if (!wanted.has(slug) && existing.has(slug)) { await transport.removeSkillDir(join(sep, root, slug)); result.removed++; }
      }
      ownedNow[target] = owned;
    } catch (e) {
      result.status = "error";
      result.error = e instanceof Error ? e.message : String(e);
      ownedNow[target] = [...new Set([...owned, ...mine])];
      log.warn("skills-native", `${target}: ${result.error}`);
    }
    if (result.added || result.updated || result.removed) log.info("skills-native", `${target}: +${result.added} ~${result.updated} -${result.removed}`);
    results[target] = result;
  }

  if (JSON.stringify(ownedNow) !== JSON.stringify(store.config.skillsOwned ?? {})) {
    useAppStore.getState().updateConfig({ skillsOwned: ownedNow });
  }
  lastResults = results;
  for (const fn of listeners) fn();
  return results;
}

let timer: ReturnType<typeof setTimeout> | null = null;
let attached = false;

/** Syncs once now and again a second after the skills or the switch change. */
export function startNativeSkillsSync(): void {
  if (attached) return;
  attached = true;
  const schedule = () => {
    if (timer) clearTimeout(timer);
    timer = setTimeout(() => { timer = null; void syncNativeSkills(); }, 1000);
  };
  schedule();
  useAppStore.subscribe((state, prev) => {
    if (state.config.skills !== prev.config.skills || state.config.skillsNativeSync !== prev.config.skillsNativeSync) schedule();
  });
}
