// Copia los archivos compartidos a la extensión y arma el .zip.
// Uso: node build.mjs [carpeta-para-version-artifact]
import { copyFileSync, mkdirSync, readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const ext = join(here, "extension");
for (const f of ["index.html", "app.js", "advisor.js", "icon.svg", "icon-192.png", "manifest.webmanifest"]) copyFileSync(join(here, f), join(ext, f));

rmSync(join(here, "asesor-ia-extension.zip"), { force: true });
execFileSync("zip", ["-qr", "asesor-ia-extension.zip", "extension"], { cwd: here });

const out = process.argv[2];
if (out) {
  // Versión para publicar como página: sin <html>/<head>/<body> ni manifest.
  mkdirSync(out, { recursive: true });
  let html = readFileSync(join(here, "index.html"), "utf8")
    .replace(/<!doctype html>\s*<html[^>]*>\s*<head>\s*/i, "")
    .replace(/<meta charset="utf-8">\n|<meta name="viewport"[^>]*>\n|<link rel="manifest"[^>]*>\n/g, "")
    .replace("</head>\n<body>\n", "")
    .replace("</body>\n</html>\n", "");
  writeFileSync(join(out, "asesor-ia.html"), html);
  for (const f of ["app.js", "advisor.js", "icon.svg", "icon-192.png"]) copyFileSync(join(here, f), join(out, f));
}
console.log("listo");
