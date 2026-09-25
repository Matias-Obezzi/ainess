// Builds `dist-remote/index.html` before the tests, but only when it is not there.
//
// `src/lib/remote-node.ts` inlines that file with `?raw`: it is the whole phone page in one file,
// which the CLI's LAN server answers with, and it is produced by `npm run build:remote`. Being a
// build artifact it is gitignored, so it does not exist on a fresh clone — and a CI runner is a
// fresh clone that runs `npm test` before it builds anything. Three suites then failed to even
// load, with an ENOENT pointing at a path nobody had written. It passed on a developer machine only
// because an earlier build had left the file lying around.
//
// Hooked as `pretest` so `npm test` carries it: whoever just cloned the repo gets the bundle built
// once, and every run after that finds it and costs nothing. Deliberately not a step in the
// workflows — the hole is in `npm test` itself, and it is a new contributor who walks into it.
import { existsSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const bundle = join(root, "dist-remote", "index.html");

if (existsSync(bundle)) process.exit(0);

console.log("Falta dist-remote/index.html (lo importa src/lib/remote-node.ts): lo construyo primero.");

// Through npm itself — the same `build:remote` the rest of the repo runs, so this cannot drift from
// it — and through `node` on npm's own entry point rather than the `npm`/`npm.cmd` on PATH, which on
// Windows would need a shell. Run by hand with plain `node`, npm has set nothing: then it is vite,
// with exactly the arguments that script passes it.
const npmCli = process.env.npm_execpath;
const args = npmCli
  ? [npmCli, "run", "build:remote"]
  : [join(root, "node_modules", "vite", "bin", "vite.js"), "build", "--config", "vite.remote.config.ts"];
const built = spawnSync(process.execPath, args, { cwd: root, stdio: "inherit" });

if (built.status !== 0 || !existsSync(bundle)) {
  console.error("No se pudo construir dist-remote/index.html. Corré `npm run build:remote` para ver el error.");
  process.exit(built.status || 1);
}
