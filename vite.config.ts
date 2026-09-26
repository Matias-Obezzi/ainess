/// <reference types="vitest/config" />
import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import tailwindcss from "@tailwindcss/vite";
import path from "node:path";
import { readFileSync } from "node:fs";

const pkg = JSON.parse(readFileSync(new URL("./package.json", import.meta.url), "utf-8")) as { version: string };

const host = process.env.TAURI_DEV_HOST;

// https://vite.dev/config/
export default defineConfig(async () => ({
  plugins: [react(), tailwindcss()],
  // Version shown in Configuración > Acerca de outside Tauri (there it comes from getVersion()).
  define: { __APP_VERSION__: JSON.stringify(pkg.version) },
  resolve: {
    alias: { "@": path.resolve(import.meta.dirname, "./src") },
  },
  clearScreen: false,
  server: {
    port: 1420,
    strictPort: true,
    host: host || false,
    hmr: host ? { protocol: "ws", host, port: 1421 } : undefined,
    // `.ainess/` is written by the app itself whenever the board changes (see
    // src/lib/project-folder.ts). Watched, moving a card in the window reloads the window.
    watch: { ignored: ["**/src-tauri/**", "**/.ainess/**"] },
  },
  test: {
    /**
     * Vitest cuts a test off at five seconds by default. A good part of this suite starts a real
     * process — an ACP adapter, an agent, a CLI — and waits for it to answer, which on a machine
     * that is also building something else takes longer than that. Those tests were green alone
     * and red whenever the rest of the suite ran beside them, which reads as a bug in the code
     * rather than in the clock. Nothing here hangs on purpose, so a bigger number costs nothing:
     * it is only ever spent by a test that was going to fail anyway.
     */
    testTimeout: 30_000,
    projects: [
      {
        extends: true,
        test: {
          name: "unit",
          environment: "node",
          include: ["src/**/*.test.ts"],
        },
      },
      {
        extends: true,
        test: {
          name: "components",
          environment: "jsdom",
          include: ["src/**/*.test.tsx"],
          setupFiles: ["src/test/setup.ts"],
        },
      },
    ],
  },
}));

