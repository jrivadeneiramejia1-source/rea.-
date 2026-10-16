/*
 * Service worker de Lanzador · Equipos
 *  1) Notificaciones push de Firebase Cloud Messaging cuando la app está cerrada o en segundo plano.
 *  2) Recibir archivos desde el menú Compartir del sistema (Bluetooth, WhatsApp, Archivos…).
 *  3) Abrir la app sin internet (guarda la interfaz en caché).
 */
const VERSION = "equipos-v1";
const SHELL = [
  "/", "/index.html", "/manifest.webmanifest", "/lanzador.css", "/motor.js", "/equipos.js", "/lanzador.js",
  "/icono-192.png", "/icono-512.png", "/insignia-72.png",
  "/vendor/react.production.min.js", "/vendor/react-dom.production.min.js", "/vendor/htm.js", "/vendor/lucide-react.min.js", "/vendor/qrcode.js",
  "/vendor/firebase-app-compat.js", "/vendor/firebase-auth-compat.js", "/vendor/firebase-firestore-compat.js", "/vendor/firebase-messaging-compat.js",
];
const SHARED = "compartidos";

// Firebase: /__/firebase/init.js lo genera Firebase Hosting con la configuración del proyecto.
try {
  importScripts("/vendor/firebase-app-compat.js", "/vendor/firebase-messaging-compat.js", "/__/firebase/init.js");
  // Si el aviso trae "notification", Firebase lo muestra solo y al tocarlo abre fcm_options.link.
  if (self.firebase && self.firebase.apps && self.firebase.apps.length) self.firebase.messaging();
} catch (e) {
  // En pruebas locales (sin Firebase Hosting) no hay init.js: la app sigue funcionando sin push.
}

self.addEventListener("install", (event) => {
  event.waitUntil(caches.open(VERSION).then((c) => Promise.all(SHELL.map((u) => c.add(u).catch(() => null)))).then(() => self.skipWaiting()));
});
self.addEventListener("activate", (event) => {
  event.waitUntil(caches.keys().then((keys) => Promise.all(keys.filter((k) => k !== VERSION && k !== SHARED).map((k) => caches.delete(k)))).then(() => self.clients.claim()));
});

self.addEventListener("fetch", (event) => {
  const req = event.request;
  const url = new URL(req.url);
  if (url.origin !== location.origin) return;

  // Archivos que llegan desde "Compartir" de otra app.
  if (req.method === "POST" && url.pathname === "/compartir") {
    event.respondWith((async () => {
      try {
        const form = await req.formData();
        const files = form.getAll("archivos").filter((f) => f && typeof f.text === "function").slice(0, 20);
        const items = [];
        for (const f of files) {
          if (f.size > 1024 * 1024) continue;
          items.push({ name: f.name, bytes: Array.from(new Uint8Array(await f.arrayBuffer())) });
        }
        const text = [form.get("titulo"), form.get("texto"), form.get("enlace")].filter((x) => typeof x === "string" && x.trim()).join("\n");
        const cache = await caches.open(SHARED);
        await cache.put("/compartido.json", new Response(JSON.stringify({ items: items, text: text, at: Date.now() }), { headers: { "content-type": "application/json" } }));
      } catch (e) { /* si falla, la app abre sin archivo */ }
      return Response.redirect("/?compartido=1", 303);
    })());
    return;
  }
  if (req.method !== "GET" || url.pathname.startsWith("/__/")) return;

  // Páginas y código propio: primero internet (para tener la última versión), si no hay, la copia guardada.
  if (req.mode === "navigate" || /\.(js|css|json|webmanifest)$/.test(url.pathname)) {
    event.respondWith(fetch(req).then((res) => {
      if (res.ok && url.pathname !== "/config.json") { const copy = res.clone(); caches.open(VERSION).then((c) => c.put(req.mode === "navigate" ? "/index.html" : req, copy)); }
      return res;
    }).catch(() => caches.match(req.mode === "navigate" ? "/index.html" : req).then((r) => r || caches.match(req))));
    return;
  }
  event.respondWith(caches.match(req).then((r) => r || fetch(req)));
});

// Toque en un aviso mostrado por la propia app (no por Firebase).
self.addEventListener("notificationclick", (event) => {
  const link = event.notification.data && event.notification.data.link;
  if (!link) return;
  event.notification.close();
  event.waitUntil((async () => {
    const target = new URL(link, location.origin).href;
    const wins = await self.clients.matchAll({ type: "window", includeUncontrolled: true });
    for (const w of wins) {
      if (new URL(w.url).origin === location.origin) { await w.focus(); w.postMessage({ tipo: "abrir", link: target }); return; }
    }
    await self.clients.openWindow(target);
  })());
});
