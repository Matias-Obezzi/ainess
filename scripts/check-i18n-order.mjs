// Every dictionary in src/i18n must hold the same keys as Spanish, in the same order. The unit
// test in src/lib/__tests__/i18n.test.ts checks the keys; this one also checks the order, so a
// dictionary stays readable next to the base one.
//
//   node scripts/check-i18n-order.mjs
import { readFileSync, readdirSync } from "node:fs";
import { join, dirname } from "node:path";
import { fileURLToPath } from "node:url";

const dir = join(dirname(fileURLToPath(import.meta.url)), "..", "src", "i18n");

// A dictionary is a file that declares one: `export const es: Dictionary = {`. Not every module in
// this folder is a language — `node.ts` is the CLI's language fallback — and a filename is not
// enough to tell them apart, which is what once had this reporting `node` as missing every key.
const langs = readdirSync(dir)
  .filter(f => f.endsWith(".ts"))
  .map(f => f.replace(/\.ts$/, ""))
  .filter(lang => readFileSync(join(dir, `${lang}.ts`), "utf8").includes(`export const ${lang}: Dictionary`));

/** The keys of one dictionary file, in the order they are written. */
function keysOf(lang) {
  const text = readFileSync(join(dir, `${lang}.ts`), "utf8");
  return [...text.matchAll(/^\s{2}"([^"]+)":/gm)].map(m => m[1]);
}

const base = keysOf("es");
const problems = [];

const duplicates = base.filter((k, i) => base.indexOf(k) !== i);
if (duplicates.length > 0) problems.push(`es repeats: ${[...new Set(duplicates)].join(", ")}`);

for (const lang of langs) {
  if (lang === "es") continue;
  const keys = keysOf(lang);
  const missing = base.filter(k => !keys.includes(k));
  const extra = keys.filter(k => !base.includes(k));
  if (missing.length > 0) problems.push(`${lang} is missing: ${missing.join(", ")}`);
  if (extra.length > 0) problems.push(`${lang} has extra: ${extra.join(", ")}`);
  if (missing.length === 0 && extra.length === 0) {
    const at = keys.findIndex((k, i) => k !== base[i]);
    if (at !== -1) problems.push(`${lang} is out of order at #${at + 1}: "${keys[at]}" where es has "${base[at]}"`);
  }
}

if (problems.length > 0) {
  console.error(problems.join("\n"));
  process.exit(1);
}
console.log(`${langs.length} dictionaries, ${base.length} keys, same order.`);
