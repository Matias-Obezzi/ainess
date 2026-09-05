import { defineConfig } from "vite";
import path from "node:path";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as { version: string };

export default defineConfig({
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  build: {
    ssr: "src/cli/main.ts",
    outDir: "dist-cli",
    target: "node22",
    rollupOptions: {
      output: {
        entryFileNames: "ais.js",
        format: "es",
      },
    },
  },
  ssr: {
    noExternal: true,
  },
});
