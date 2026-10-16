// Arma lanzador-equipos.zip para publicar SIN instalar nada: todo se pega en las páginas de Firebase y Cloudflare.
//   1-sitio/              → se arrastra a Cloudflare Pages (antes se edita 1-sitio/config.js con el Bloc de notas)
//   2-worker.js           → se pega en el editor del Worker de Cloudflare
//   3-reglas-firestore.txt → se pega en Firestore → Reglas
// Uso: npm run build && node empaquetar.mjs
import { readFileSync, readdirSync, statSync, writeFileSync } from "node:fs";
import { join, relative, sep } from "node:path";
import vm from "node:vm";
import { dirname } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, "public");
const sandbox = { TextEncoder, Uint8Array, DataView, ArrayBuffer, Date, Math, Object, Array, String, Number, Set, Map, JSON, RegExp, Error };
sandbox.globalThis = sandbox;
vm.runInNewContext(readFileSync(join(pub, "motor.js"), "utf8"), sandbox); // zip del mismo motor de la app
const G = sandbox.GestorEngine;

const files = [];
const add = (name, bytes) => files.push({ name: "lanzador-equipos/" + name, bytes: new Uint8Array(bytes) });
const skip = new Set(["config.js", "config.ejemplo.js"]);
(function walk(dir) {
  for (const f of readdirSync(dir).sort()) {
    const p = join(dir, f), rel = relative(pub, p).split(sep).join("/");
    if (statSync(p).isDirectory()) walk(p);
    else if (!skip.has(rel) && !f.startsWith(".")) add("1-sitio/" + rel, readFileSync(p));
  }
})(pub);
if (!files.some((f) => f.name.endsWith("/vendor/react.production.min.js"))) throw new Error("Primero ejecuta: npm run build");
add("1-sitio/config.js", readFileSync(join(pub, "config.ejemplo.js")));
add("2-worker.js", readFileSync(join(here, "worker", "src", "index.js")));
add("3-reglas-firestore.txt", readFileSync(join(here, "firestore.rules")));
add("LEEME.txt", Buffer.from([
  "LANZADOR · EQUIPOS — publicar sin instalar nada",
  "",
  "1-sitio/config.js        Ábrelo con el Bloc de notas y pega los datos de Firebase y del Worker.",
  "1-sitio/                 Luego arrastra esta carpeta a Cloudflare Pages (Upload assets).",
  "2-worker.js              Pégalo completo en el editor del Worker de Cloudflare (Edit code).",
  "3-reglas-firestore.txt   Pégalo en Firebase → Firestore Database → Reglas → Publicar.",
  "",
  "La guía paso a paso está en equipos/README.md (sección «Publicar desde el navegador»).",
  "",
].join("\r\n"), "utf8"));

const zip = G.zipStore(files);
writeFileSync(join(here, "lanzador-equipos.zip"), zip);
console.log("lanzador-equipos.zip: " + files.length + " archivos, " + Math.round(zip.length / 1024) + " KB");
