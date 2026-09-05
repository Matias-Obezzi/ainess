import { defineConfig } from "vite";
import path from "node:path";

export default defineConfig({
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
