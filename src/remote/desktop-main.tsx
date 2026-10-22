// Entry point of the desktop remote page (see vite.remote-desktop.config.ts). No console capture here: there
// is no log file on the client, only the browser console.
import ReactDOM from "react-dom/client";
import "@/index.css";
import { markRemoteBuild } from "@/lib/platform";
import { setTransport } from "@/lib/transport";
import { remoteTransport } from "@/lib/transport-remote";
import { RemoteDesktopApp } from "./RemoteDesktopApp";
import { ComponentLabels } from "@/i18n/ComponentLabels";

// Before the store is ever touched: nothing here may spawn, read or persist anything.
setTransport(remoteTransport);
markRemoteBuild();

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
  <ComponentLabels>
    <RemoteDesktopApp />
  </ComponentLabels>,
);
