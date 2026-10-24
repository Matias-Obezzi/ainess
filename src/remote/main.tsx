// Entry point of the phone page (see vite.remote.config.ts). No console capture here: there
// is no log file on the phone, only the browser console.
import ReactDOM from "react-dom/client";
import "@/index.css";
import { markRemoteBuild } from "@/lib/platform";
import { setTransport } from "@/lib/transport";
import { remoteTransport } from "@/lib/transport-remote";
import { RemoteApp } from "./RemoteApp";
import { ComponentLabels } from "@/i18n/ComponentLabels";
import { desktopHref, pickRemoteLayout, readRemoteLayout } from "./remote-nav";

/**
 * A computer opening the remote root goes to the desktop view before anything is drawn, unless this
 * browser chose the phone page. Only this page redirects: `/desktop` never sends anyone back.
 */
function openedOnDesktop(): boolean {
  try {
    const layout = pickRemoteLayout(readRemoteLayout(localStorage), {
      finePointer: window.matchMedia("(pointer: fine)").matches,
      hover: window.matchMedia("(hover: hover)").matches,
      width: window.innerWidth,
    });
    if (layout !== "desktop") return false;
    window.location.replace(desktopHref(window.location));
    return true;
  } catch {
    // No storage or no matchMedia: the phone page works everywhere.
    return false;
  }
}

if (!openedOnDesktop()) {
  // Before the store is ever touched: nothing here may spawn, read or persist anything.
  setTransport(remoteTransport);
  // A confirmation here is the island, not a dialog in the middle of the screen (lib/confirm.ts).
  markRemoteBuild();

  ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(
    <ComponentLabels>
      <RemoteApp />
    </ComponentLabels>,
  );
}
