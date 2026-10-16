// Compila Tailwind con las clases que usa lanzador.html y las pega dentro del archivo.
// Uso: node build.mjs   (requiere: npm i -D tailwindcss@3.4.17)
import { readFileSync, writeFileSync, rmSync } from "node:fs";
import { execFileSync } from "node:child_process";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
const here = dirname(fileURLToPath(import.meta.url));
const file = join(here, "lanzador.html");
const START = "/* tailwind:start */", END = "/* tailwind:end */";
const html = readFileSync(file, "utf8");
const a = html.indexOf(START), b = html.indexOf(END);
if (a < 0 || b < a) throw new Error("No encuentro los marcadores de Tailwind");
writeFileSync(join(here, ".tw-content.html"), html.slice(0, a) + html.slice(b));
writeFileSync(join(here, ".tw-in.css"), "@tailwind base;\n@tailwind components;\n@tailwind utilities;\n");
const css = execFileSync("npx", ["--no-install", "tailwindcss", "-c", "tailwind.config.cjs", "-i", ".tw-in.css", "--minify"], { cwd: here, encoding: "utf8" });
rmSync(join(here, ".tw-content.html")); rmSync(join(here, ".tw-in.css"));
writeFileSync(file, html.slice(0, a + START.length) + "\n" + css.trim() + "\n" + html.slice(b));
console.log("Tailwind compilado: " + css.length + " bytes");
