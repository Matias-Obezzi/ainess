// Fails when package.json, src-tauri/tauri.conf.json and src-tauri/Cargo.toml disagree on the
// version. The release workflow tags `v<version>` from tauri.conf.json, so a mismatch would
// publish an installer whose version does not match the tag or the CLI.
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const read = (p) => readFileSync(join(root, p), "utf-8");

const pkg = JSON.parse(read("package.json")).version;
const conf = JSON.parse(read("src-tauri/tauri.conf.json")).version;
const cargo = read("src-tauri/Cargo.toml").match(/^\s*version\s*=\s*"([^"]+)"/m)?.[1];

const found = { "package.json": pkg, "src-tauri/tauri.conf.json": conf, "src-tauri/Cargo.toml": cargo };
const unique = [...new Set(Object.values(found))];

if (unique.length !== 1 || !unique[0]) {
  console.error("Las versiones no coinciden:");
  for (const [file, version] of Object.entries(found)) console.error(`  ${file}: ${version ?? "(no encontrada)"}`);
  console.error("Subí la misma versión en los tres archivos antes de mergear a main.");
  process.exit(1);
}

// Every language shows the changelog in its own file (src/lib/changelog.ts); English is
// CHANGELOG.md. A translation that skipped a release would leave that reader looking at an older
// version than the one they are running, so the release stops here until they all have it.
const version = unique[0];
const languages = ["es", "pt", "zh", "ja", "fr", "de"];
const missing = languages.filter(lang => {
  const path = `docs/changelog/${lang}.md`;
  try {
    return !read(path).includes(`## ${version}`);
  } catch {
    return true;
  }
});

if (missing.length > 0) {
  console.error(`Falta la ${version} en el changelog de: ${missing.join(", ")}`);
  console.error("Agregá la sección en docs/changelog/<idioma>.md antes de mergear a main.");
  process.exit(1);
}

console.log(`Versión consistente: ${version} (changelog en ${languages.length + 1} idiomas)`);
