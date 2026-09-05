// Entry point of the phone page (see vite.remote.config.ts). No console capture here: there
// is no log file on the phone, only the browser console.
import ReactDOM from "react-dom/client";
import "@/index.css";
import { setTransport } from "@/lib/transport";
import { remoteTransport } from "@/lib/transport-remote";
import { RemoteApp } from "./RemoteApp";

// Before the store is ever touched: nothing here may spawn, read or persist anything.
setTransport(remoteTransport);

ReactDOM.createRoot(document.getElementById("root") as HTMLElement).render(<RemoteApp />);
