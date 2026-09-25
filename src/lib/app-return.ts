// Coming back to the app, counted.
//
// "Back" is a narrow thing on purpose: the window was minimized and is not any more, the tray icon
// was clicked, or a second launch was turned back into a focus of the one already running. Those
// are the three moments Rust knows about (see `src-tauri/src/tray.rs` and `src-tauri/src/lib.rs`),
// and they all arrive here as one event.
//
// Not the window's focus. Focus comes back every time you alt-tab from the browser, from Slack, or
// from the terminal you just ran something in — animating the whole body on each of those is not a
// detail, it is a flicker that never stops. Alt-tab deliberately does nothing.
import { isRemoteBuild } from "@/lib/platform";
import { isTauri, listenOnce } from "@/lib/tauri";

/** The event Rust emits from every point where the window comes back. */
export const APP_RETURN_EVENT = "window-returned";

let tick = 0;
const subscribers = new Set<() => void>();

/** How many times the app has been come back to. Only ever compared with itself. */
export function appReturnTick(): number {
  return tick;
}

export function subscribeAppReturn(onChange: () => void): () => void {
  subscribers.add(onChange);
  return () => {
    subscribers.delete(onChange);
  };
}

/** Exported for the tests and for the Rust event to land on. */
export function bumpAppReturn(): void {
  tick += 1;
  for (const notify of [...subscribers]) notify();
}

/**
 * Starts listening, once. In the page the phone loads, and in the browser preview, there is no
 * Tauri to listen to: nothing is registered and nothing throws — the app simply never counts a
 * return, which is the truth there.
 */
export async function watchAppReturn(): Promise<void> {
  if (isRemoteBuild() || !isTauri()) return;
  await listenOnce(APP_RETURN_EVENT, () => bumpAppReturn());
}
