// Guarda la app para que funcione sin internet.
const CACHE = "asesor-ia-v2";
const FILES = ["./", "index.html", "advisor.js", "app.js", "manifest.webmanifest", "icon.svg", "icon-192.png", "icon-512.png"];
self.addEventListener("install", (e) => e.waitUntil(caches.open(CACHE).then((c) => c.addAll(FILES)).then(() => self.skipWaiting())));
self.addEventListener("activate", (e) =>
  e.waitUntil(caches.keys().then((ks) => Promise.all(ks.filter((k) => k !== CACHE).map((k) => caches.delete(k)))).then(() => self.clients.claim())));
self.addEventListener("fetch", (e) => {
  if (e.request.method !== "GET") return;
  // Red primero (para recibir mejoras); si no hay internet, usa la copia guardada.
  e.respondWith(
    fetch(e.request)
      .then((r) => { if (r.ok && new URL(e.request.url).origin === location.origin) { const c = r.clone(); caches.open(CACHE).then((k) => k.put(e.request, c)); } return r; })
      .catch(() => caches.match(e.request).then((m) => m || caches.match("index.html")))
  );
});
