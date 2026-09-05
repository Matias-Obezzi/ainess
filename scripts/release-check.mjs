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

console.log(`Versión consistente: ${unique[0]}`);
