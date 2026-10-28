/**
 * A kill switch for a service worker this app never registered.
 *
 * An earlier app on this origin left one behind; its script is gone (the server logs /sw.js 404),
 * so it keeps serving its cached build. Browsers still fetch /sw.js for updates, so this file is
 * served instead: it takes over, drops every cache, unregisters itself and reloads the clients.
 * A browser with no worker never runs it.
 */
self.addEventListener("install", () => self.skipWaiting());

self.addEventListener("activate", event => {
  event.waitUntil((async () => {
    for (const key of await caches.keys()) await caches.delete(key);
    await self.registration.unregister();
    const clients = await self.clients.matchAll({ type: "window" });
    for (const client of clients) client.navigate(client.url);
  })());
});
