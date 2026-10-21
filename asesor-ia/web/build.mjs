// Arma el Asesor IA como app web propia (instalable en el celular) en web/dist, para Cloudflare Pages.
// Fuente única: ../artifact/asesor-ia.html (la misma versión que está en claude.ai).
// Uso (desde esta carpeta):  node build.mjs
// Publicar:                  npx wrangler pages deploy dist --project-name asesor-ia
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, rmSync } from "node:fs";
import { createHash } from "node:crypto";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const dist = join(here, "dist");
const page = readFileSync(join(here, "..", "artifact", "asesor-ia.html"), "utf8");
if (!page.includes('<script id="loader">')) throw new Error("No encuentro el cargador en artifact/asesor-ia.html");

rmSync(dist, { recursive: true, force: true });
mkdirSync(dist, { recursive: true });

// El artifact no trae <html>/<head>: aquí se le pone el esqueleto de una página normal, el manifiesto y el service worker.
const head = `<!doctype html>
<html lang="es">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover">
<meta name="theme-color" content="#0b1117">
<link rel="manifest" href="./manifest.webmanifest">
<link rel="icon" href="./icon-192.png">
<link rel="apple-touch-icon" href="./icon-192.png">
<meta name="apple-mobile-web-app-capable" content="yes">
</head>
<body>
`;
const sw = `<script>
if ("serviceWorker" in navigator) addEventListener("load", function () { navigator.serviceWorker.register("./sw.js").catch(function () {}); });
</script>
`;
writeFileSync(join(dist, "index.html"), head + page + "\n" + sw + "</body>\n</html>\n");

// La versión del service worker cambia con el contenido: así cada publicación se actualiza sola en el celular.
const version = createHash("sha256").update(page).digest("hex").slice(0, 10);
writeFileSync(join(dist, "sw.js"), readFileSync(join(here, "sw.js"), "utf8").replace("__VERSION__", version));

writeFileSync(join(dist, "manifest.webmanifest"), JSON.stringify({
  name: "Asesor IA",
  short_name: "Asesor IA",
  description: "Convierte una idea en un prompt profesional, lo evalúa y te dice qué modelo usar.",
  lang: "es",
  start_url: "./",
  scope: "./",
  display: "standalone",
  background_color: "#0b1117",
  theme_color: "#0b1117",
  icons: [
    { src: "icon-192.png", sizes: "192x192", type: "image/png" },
    { src: "icon-512.png", sizes: "512x512", type: "image/png" },
  ],
}, null, 2) + "\n");
for (const f of ["icon-192.png", "icon-512.png"]) copyFileSync(join(here, "..", f), join(dist, f));
copyFileSync(join(here, "_headers"), join(dist, "_headers"));

console.log("Listo: web/dist (versión " + version + "). Publica con: npx wrangler pages deploy dist --project-name asesor-ia");
