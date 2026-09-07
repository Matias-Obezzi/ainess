// Service worker of the phone page.
//
// It exists for two reasons, and does nothing else: an installed app needs one to be treated as
// one (on iOS a notification can only be shown through `registration.showNotification`), and a
// notification has to know where to take you when it is tapped.
//
// It deliberately caches nothing. The page is served by the PC that runs the orchestrator — with
// `Cache-Control: no-store`, so a new version of the app is the one you get — and an offline copy
// of a page whose whole purpose is to talk to that PC would only show a shell that cannot do
// anything.
//
// Served by both servers at `/sw.js` (see src-tauri/src/remote.rs and src/lib/remote-node.ts).

self.addEventListener("install", () => {
  // No waiting: the page that registered this one is the page that should be running it.
  self.skipWaiting();
});

self.addEventListener("activate", (event) => {
  event.waitUntil(self.clients.claim());
});

// Tapping a notification brings the page forward, or opens it if it is not there any more.
self.addEventListener("notificationclick", (event) => {
  event.notification.close();
  event.waitUntil(
    self.clients.matchAll({ type: "window", includeUncontrolled: true }).then((clients) => {
      for (const client of clients) {
        if ("focus" in client) return client.focus();
      }
      return self.clients.openWindow("./");
    }),
  );
});
