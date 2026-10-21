/*
 * Service worker del Asesor IA (app web propia).
 * - La página: primero internet (para tener la última versión); sin conexión, la copia guardada.
 * - Librerías y fuentes de los CDN (URLs con versión fija): se guardan la primera vez y luego salen de la copia.
 * Así, después de abrirla una vez, funciona sin internet (menos el dictado por voz, que necesita a Google).
 */
const VERSION = "asesor-__VERSION__";
const CDN = /^https:\/\/(cdnjs\.cloudflare\.com|cdn\.jsdelivr\.net|unpkg\.com|fonts\.googleapis\.com|fonts\.gstatic\.com)\//;

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => c.addAll(["./", "./manifest.webmanifest", "./icon-192.png", "./icon-512.png"])).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== "asesor-cdn").map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});
self.addEventListener("fetch", (event) => {
  const req = event.request;
  if (req.method !== "GET") return;
  const url = new URL(req.url);
  if (CDN.test(req.url)) {
    event.respondWith(caches.open("asesor-cdn").then((c) => c.match(req).then((hit) => hit || fetch(req).then((res) => {
      if (res.ok || res.type === "opaque") c.put(req, res.clone());
      return res;
    }))));
    return;
  }
  if (url.origin !== location.origin) return;
  event.respondWith(fetch(req).then((res) => {
    if (res.ok) { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req.mode === "navigate" ? "./" : req, copy)); }
    return res;
  }).catch(() => caches.match(req.mode === "navigate" ? "./" : req).then((r) => r || caches.match("./"))));
});
