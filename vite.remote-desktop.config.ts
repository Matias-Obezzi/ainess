import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import { viteSingleFile } from "vite-plugin-singlefile";
import path from "node:path";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as { version: string };

/**
 * The desktop remote page (`npm run build:remote`): the full desktop shell, built into a single
 * self-contained `dist-remote/desktop.html` with the JS and the CSS inlined.
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
    emptyOutDir: false,
    assetsInlineLimit: 100000000,
    cssCodeSplit: false,
    chunkSizeWarningLimit: 100000,
    rollupOptions: {
      input: path.resolve(import.meta.dirname, "src/remote/desktop.html"),
      external: ["@agentclientprotocol/sdk"],
    },
  },
});
