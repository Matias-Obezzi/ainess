import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "node:path";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as { version: string };

/**
 * The phone page (`npm run build:remote`): the same React app, built into a single
 * self-contained `dist-remote/index.html` with the JS and the CSS inlined. Both servers embed
 * that file verbatim (`src-tauri/src/remote.rs` and `src/lib/remote-node.ts`), so it must not
 * reference any sibling asset.
 */
export default defineConfig({
  root: path.resolve(import.meta.dirname, "src/remote"),
  base: "./",
  plugins: [react(), tailwindcss(), viteSingleFile()],
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  build: {
    outDir: path.resolve(import.meta.dirname, "dist-remote"),
    emptyOutDir: true,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    // One file is the whole point here; the size warning would fire on every build.
    chunkSizeWarningLimit: 100000,
  },
});
