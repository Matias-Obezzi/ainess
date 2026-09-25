// The tests that look at the screen. Local only, on purpose: they need a browser and a minute, and
// every push to a pull request already builds an installer. `npm run e2e` runs them against vite
// serving the made-up workspace in `src/demo` (`?demo=<screen>`), in the Chrome that is installed
// rather than one downloaded for the occasion.
import { defineConfig } from "@playwright/test";

const PORT = 5179;

export default defineConfig({
  testDir: "e2e",
  outputDir: "e2e/out",
  fullyParallel: true,
  workers: 2,
  retries: 0,
  reporter: [["list"]],
  // A minute: the first time vite serves a screen it transforms it, and two tests may be asking.
  timeout: 60_000,
  use: {
    baseURL: `http://localhost:${PORT}`,
    channel: "chrome",
    viewport: { width: 1400, height: 900 },
    // The app fades the body of every screen up when it arrives, and a shot taken mid-fade is a
    // shot of a half-transparent screen eight pixels off. The app already honours the system asking
    // for less motion, so the honest way to a still frame is to ask for it — not to sleep.
    reducedMotion: "reduce",
    screenshot: "only-on-failure",
    trace: "retain-on-failure",
  },
  webServer: {
    command: `npx vite --port ${PORT} --strictPort`,
    url: `http://localhost:${PORT}/`,
    reuseExistingServer: true,
    timeout: 60_000,
  },
});
