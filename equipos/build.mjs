// Prepara la carpeta public/ para Firebase Hosting.
//  - Copia las librerías (React, htm, lucide, QR, Firebase) desde node_modules a public/vendor (sin CDN).
//  - Extrae el motor del Lanzador (búsqueda, auditor, archivos) desde ../gestor-scripts/lanzador.html: una sola fuente.
//  - Copia el Asesor IA a public/asesor/ con el puente para enviar prompts al equipo.
//  - Compila Tailwind solo con las clases usadas.
// Uso: npm run build
import { readFileSync, writeFileSync, mkdirSync, copyFileSync, existsSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const pub = join(here, "public");
const nm = (p) => join(here, "node_modules", p);
const out = (p) => join(pub, p);

mkdirSync(out("vendor"), { recursive: true });
const vendor = {
  "react.production.min.js": "react/umd/react.production.min.js",
  "react-dom.production.min.js": "react-dom/umd/react-dom.production.min.js",
  "htm.js": "htm/dist/htm.umd.js",
  "lucide-react.min.js": "lucide-react/dist/umd/lucide-react.min.js",
  "qrcode.js": "qrcode-generator/qrcode.js",
  "firebase-app-compat.js": "firebase/firebase-app-compat.js",
  "firebase-auth-compat.js": "firebase/firebase-auth-compat.js",
  "firebase-firestore-compat.js": "firebase/firebase-firestore-compat.js",
  "firebase-messaging-compat.js": "firebase/firebase-messaging-compat.js",
};
for (const [dest, src] of Object.entries(vendor)) {
  if (!existsSync(nm(src))) throw new Error("Falta " + src + ": ejecuta «npm ci» primero.");
  // Sin el comentario del mapa de fuentes: el .map no se publica.
  writeFileSync(out("vendor/" + dest), readFileSync(nm(src), "utf8").replace(/\n?\/\/# sourceMappingURL=\S+\s*$/, "\n"));
}

// Motor compartido con el Lanzador original.
const lanzador = readFileSync(join(here, "..", "gestor-scripts", "lanzador.html"), "utf8");
const m = /<script id="engine">([\s\S]*?)<\/script>/.exec(lanzador);
if (!m || !m[1].includes("root.GestorEngine")) throw new Error("No encontré el motor en gestor-scripts/lanzador.html");
writeFileSync(out("motor.js"), "/* Generado por build.mjs desde gestor-scripts/lanzador.html: no editar aquí. */\n" + m[1].trim() + "\n");

// Asesor IA con puente al equipo.
const asesorSrc = join(here, "..", "asesor-ia", "artifact", "asesor-ia.html");
if (existsSync(asesorSrc)) {
  mkdirSync(out("asesor"), { recursive: true });
  let page = readFileSync(asesorSrc, "utf8");
  // Primero las librerías propias (/vendor): carga más rápida y funciona sin internet; los CDN quedan de respaldo.
  for (const [cdn, local] of [
    ["https://cdnjs.cloudflare.com/ajax/libs/react/18.3.1/umd/react.production.min.js", "react.production.min.js"],
    ["https://cdnjs.cloudflare.com/ajax/libs/react-dom/18.3.1/umd/react-dom.production.min.js", "react-dom.production.min.js"],
    ["https://cdn.jsdelivr.net/npm/htm@3.1.1/dist/htm.umd.js", "htm.js"],
    ["https://cdn.jsdelivr.net/npm/lucide-react@0.263.1/dist/umd/lucide-react.min.js", "lucide-react.min.js"],
  ]) {
    const q = JSON.stringify(cdn);
    if (page.split(q).length !== 2) throw new Error("El cargador del Asesor cambió: no encuentro " + cdn);
    page = page.replace(q, JSON.stringify("/vendor/" + local) + ",\n      " + q);
  }
  // El archivo es un artifact (sin <html>/<head>): aquí se le pone el esqueleto de una página normal.
  const head = '<!doctype html><html lang="es"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1,viewport-fit=cover"><link rel="manifest" href="/manifest.webmanifest"><link rel="icon" href="/icono-192.png"></head><body>\n';
  writeFileSync(out("asesor/index.html"), head + page + '\n<script src="/asesor-puente.js" defer></script>\n</body></html>\n');
}

// Estilos.
writeFileSync(join(here, ".tw-in.css"), "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
try {
  execFileSync(process.execPath, [nm("tailwindcss/lib/cli.js"), "-c", "tailwind.config.cjs", "-i", ".tw-in.css", "-o", out("lanzador.css"), "--minify"], { cwd: here, stdio: ["ignore", "ignore", "inherit"] });
} finally { rmSync(join(here, ".tw-in.css"), { force: true }); }

if (!existsSync(out("config.js"))) console.log("Aviso: no hay public/config.js. En Firebase Hosting la app funciona sin él, pero sin avisos push (ver config.ejemplo.js).");
console.log("Listo: public/ preparada para «firebase deploy».");
