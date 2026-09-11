import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { installConsoleCapture, log } from "@/lib/logger";

// Before anything else, so a crash while mounting still ends up in the log file.
installConsoleCapture();
log.info("app", "webview iniciado");

// A made-up workspace for the README's screenshots, reached only with `?demo=<screen>` in the URL.
// `import.meta.env.DEV` is replaced with `false` in a production build, so vite drops the whole
// branch and neither the fixture nor its installer ends up in what ships.
if (import.meta.env.DEV) {
  const screen = new URLSearchParams(window.location.search).get("demo");
  if (screen) {
    const { installDemo, openDemoScreen } = await import("./demo/install");
    installDemo();
    // The store is filled once `runInit` has read the config and settled.
    const store = (await import("@/store")).useAppStore;
    const stop = store.subscribe(state => {
      if (!state.loaded) return;
      stop();
      openDemoScreen(screen as never);
      // The store, for a script driving the app from outside: `scripts/repro-chat.mjs` sends a
      // message the way the box does and watches what the render makes of it.
      (window as unknown as { __ainess?: unknown }).__ainess = store;
      // Something for the screenshot script to wait on that means "drawn", not "mounted".
      requestAnimationFrame(() => document.documentElement.setAttribute("data-demo-ready", "1"));
    });
  }
}

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
