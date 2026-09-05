import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./index.css";
import { installConsoleCapture, log } from "@/lib/logger";

// Before anything else, so a crash while mounting still ends up in the log file.
installConsoleCapture();
log.info("app", "webview iniciado");

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
