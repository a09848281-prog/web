/* Local notification display only. Background Push delivery is not configured. */
"use strict";

self.addEventListener("install", event => {
  event.waitUntil(self.skipWaiting());
});

self.addEventListener("activate", event => {
  event.waitUntil(self.clients.claim());
});

self.addEventListener("notificationclick", event => {
  event.notification.close();
  const target = new URL("./", self.registration.scope).href;
  event.waitUntil(self.clients.matchAll({ type: "window", includeUncontrolled: true }).then(clients => {
    for (const client of clients) {
      if ("focus" in client) {
        client.focus();
        return;
      }
    }
    if (self.clients.openWindow) return self.clients.openWindow(target);
  }));
});
