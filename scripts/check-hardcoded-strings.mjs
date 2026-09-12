// Fails when a string the user can read is written in the source instead of in the dictionaries.
//
// The app ships in seven languages, and a sentence hardcoded in Spanish is a sentence six of those
// readers get in a language they did not pick — silently, because nothing else notices. That is how
// the app came to have a hundred of them: every one of them was one line at the time.
//
// What it looks for is Spanish, not "text": the source is written in English, so English prose in a
// log line or a comment is correct and must not be flagged. A literal counts as Spanish when it has
// a character only Spanish uses, or two words only Spanish uses.
//
// Run by `npm test` through `src/lib/__tests__/no-hardcoded-strings.test.ts`, and on its own with
// `node scripts/check-hardcoded-strings.mjs`.
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), "..");

/** Folders whose strings are not read by a user in the app. */
const SKIP_DIRS = new Set([
  "node_modules",
  "__tests__",
  // The dictionaries are where Spanish belongs.
  "i18n",
  // Dev-only fixture for the README screenshots; dropped from production builds.
  "demo",
]);

const ONLY_SPANISH_CHARS = /[áéíóúüñ¿¡ÁÉÍÓÚÜÑ]/;

/**
 * Words that exist in Spanish and not in English.
 *
 * Deliberately without `no`, `es`, `un`, `me`, `son` and the like: those are English words too, or
 * common enough in identifiers that they would flag lines nobody needs to look at.
 */
const ONLY_SPANISH_WORDS = [
  "el", "la", "los", "las", "del", "que", "para", "con", "una", "por", "se", "su", "sus",
  "este", "esta", "esto", "estos", "estas", "desde", "hasta", "pero", "porque", "cuando",
  "donde", "cada", "todo", "toda", "todos", "todas", "sin", "más", "ya", "muy", "hay",
  "está", "están", "fue", "tiene", "puede", "debe", "hacer", "usar", "solo", "sólo",
  // The app's own nouns, which a sentence about it can hardly avoid. "MCP ya existe" and
  // "Agente no encontrado en este proyecto" slipped past a list of stopwords alone.
  "agente", "agentes", "proyecto", "proyectos", "encontrado", "encontrada", "existe", "existen",
  "falta", "faltan", "nombre", "archivo", "carpeta", "corrida", "tarea", "tareas", "equipo",
  "guardado", "guardada", "agregado", "agregada", "editado", "editada", "eliminado", "eliminada",
];
const WORD_RE = new RegExp(`(^|[^\\p{L}])(${ONLY_SPANISH_WORDS.join("|")})([^\\p{L}]|$)`, "giu");

/**
 * Words that settle it on their own.
 *
 * Two stopwords is the rule for prose, but a CLI speaks in fragments — "No encontrado", "Falta
 * --url", "Eliminado" — and a fragment has one word that matters and no stopwords at all. These are
 * not English words in any spelling, so one of them is enough.
 */
const STRONG_SPANISH_WORDS = new Set([
  "encontrado", "encontrada", "eliminado", "eliminada", "agregado", "agregada", "editado", "editada",
  "falta", "faltan", "uso", "existe", "existen", "guardado", "guardada",
]);

/**
 * Lines allowed to keep a Spanish literal, as `<path>:<line>` with why.
 *
 * An entry here is a promise that no user ever reads that string as a sentence. The reason goes
 * next to it, so the next person does not have to work out whether it was a decision or an escape.
 */
const ALLOWED = new Map([
  // Not labels: these are the values that land in an agent's system prompt ("tu rol es …") and are
  // stored on the chat. The label the user picks from is translated separately, through
  // `CHAT_ROLE_KEY` right below them. Changing the value would change saved data, not a translation.
  ["src/components/ChatDialog.tsx:23", "role values stored on the chat, not labels"],
  ["src/components/ChatDialog.tsx:28", "the map from those values to their label keys"],
]);

const STRING = /(["'`])((?:\\.|(?!\1)[^\\])*?)\1/g;

/** Whether a literal reads as Spanish prose rather than as a key, a path or a bit of English. */
function looksSpanish(text) {
  if (text.length < 8) return false;
  // Identifiers, paths, css, format strings: no spaces between words means no prose.
  if (!/\s/.test(text) && !ONLY_SPANISH_CHARS.test(text)) return false;
  if (ONLY_SPANISH_CHARS.test(text)) return true;
  const found = new Set();
  let m;
  WORD_RE.lastIndex = 0;
  while ((m = WORD_RE.exec(text))) {
    found.add(m[2].toLowerCase());
    // The regex eats the separator that the next match needs, so step back one.
    WORD_RE.lastIndex--;
  }
  if (found.size >= 2) return true;
  for (const word of found) if (STRONG_SPANISH_WORDS.has(word)) return true;
  return false;
}

/** Whether the line is inside a comment, where Spanish is nobody's problem. */
function isComment(line) {
  return /^\s*(\/\/|\*|\/\*)/.test(line);
}

function scan(dir, out) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      scan(full, out);
      continue;
    }
    if (!/\.(ts|tsx)$/.test(entry.name)) continue;
    const rel = path.relative(root, full).replace(/\\/g, "/");
    const lines = fs.readFileSync(full, "utf8").split(/\r?\n/);
    lines.forEach((line, i) => {
      if (isComment(line)) return;
      STRING.lastIndex = 0;
      let m;
      while ((m = STRING.exec(line))) {
        if (!looksSpanish(m[2])) continue;
        const at = `${rel}:${i + 1}`;
        if (ALLOWED.has(at)) continue;
        out.push({ at, text: m[2].slice(0, 100) });
      }
    });
  }
}

const found = [];
scan(path.join(root, "src"), found);

/** Exported so the test can assert on it without shelling out. */
export function hardcodedSpanish() {
  const out = [];
  scan(path.join(root, "src"), out);
  return out;
}

if (import.meta.url === `file://${process.argv[1]}` || process.argv[1]?.endsWith("check-hardcoded-strings.mjs")) {
  if (found.length === 0) {
    console.log("No hardcoded Spanish outside the dictionaries.");
    process.exit(0);
  }
  console.error(`${found.length} string(s) the user can read are written in the source instead of the dictionaries:\n`);
  for (const f of found) console.error(`  ${f.at}  ${f.text}`);
  console.error("\nMove them to src/i18n/*.ts and read them with `t(...)` or `translateNow(...)`.");
  console.error("A line that no user ever reads (a log) should be written in English instead.");
  process.exit(1);
}
