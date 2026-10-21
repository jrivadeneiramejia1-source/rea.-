// Publica el Lanzador (sitio + Worker de avisos) y el Asesor IA en Cloudflare, sin tocar variables ni secretos.
// Pensado para que lo corra un agente (Claude) o tú:  node publicar.mjs [lanzador] [worker] [asesor] [--simular]
//   sin nombres = los tres. --simular arma todo y revisa, pero no publica nada.
//
// Variables de entorno:
//   CLOUDFLARE_API_TOKEN     permiso de edición de Pages y Workers Scripts (secreto; nunca va en un archivo)
//   CLOUDFLARE_ACCOUNT_ID    ID de la cuenta de Cloudflare
//   PAGES_LANZADOR           nombre del proyecto de Pages del Lanzador (debe existir; por defecto lanzador-jeiler)
//   PAGES_ASESOR             nombre del proyecto de Pages del Asesor (se crea si no existe; por defecto asesor-ia)
//   WORKER_NOMBRE            nombre del Worker de avisos (por defecto lanzado-notificaciones, el que ya tienes)
//   LANZADOR_CONFIG_B64      contenido de config.js en base64 (o deja el archivo public/config.js)
import { spawnSync } from "node:child_process";
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, rmSync, statSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const here = dirname(fileURLToPath(import.meta.url));
const args = process.argv.slice(2);
const simular = args.includes("--simular");
const pedidos = args.filter((a) => !a.startsWith("--"));
for (const p of pedidos) if (!["lanzador", "worker", "asesor"].includes(p)) fallar(`No conozco «${p}». Usa: lanzador, worker, asesor.`);
const quiere = (n) => !pedidos.length || pedidos.includes(n);

const env = process.env;
const PAGES_LANZADOR = env.PAGES_LANZADOR || "lanzador-jeiler";
const PAGES_ASESOR = env.PAGES_ASESOR || "asesor-ia";
const WORKER = env.WORKER_NOMBRE || "lanzado-notificaciones";
const wrangler = join(here, "node_modules", ".bin", process.platform === "win32" ? "wrangler.cmd" : "wrangler");

function fallar(msg) { console.error("✗ " + msg); process.exit(1); }
function paso(msg) { console.log("\n▶ " + msg); }
function correr(cmd, cmdArgs, opts = {}) {
  console.log("  $ " + [cmd.replace(here, "."), ...cmdArgs].join(" "));
  const r = spawnSync(cmd, cmdArgs, { cwd: opts.cwd || here, stdio: opts.capturar ? ["ignore", "pipe", "pipe"] : "inherit", encoding: "utf8", env: process.env });
  if (r.status !== 0 && !opts.tolerar) fallar(`Falló: ${cmdArgs.join(" ")}${opts.capturar ? "\n" + r.stdout + r.stderr : ""}`);
  return r;
}

if (!simular) {
  if (!env.CLOUDFLARE_API_TOKEN) fallar("Falta CLOUDFLARE_API_TOKEN (secreto del entorno).");
  if (!env.CLOUDFLARE_ACCOUNT_ID) fallar("Falta CLOUDFLARE_ACCOUNT_ID.");
  if (!existsSync(wrangler)) fallar("Falta wrangler: corre «npm ci» en la carpeta equipos primero.");
}

// ---------- Lanzador (sitio) ----------
function configDelLanzador() {
  const archivo = join(here, "public", "config.js");
  let texto = existsSync(archivo) ? readFileSync(archivo, "utf8") : env.LANZADOR_CONFIG_B64 ? Buffer.from(env.LANZADOR_CONFIG_B64, "base64").toString("utf8") : "";
  if (!texto) fallar("No tengo el config.js del Lanzador: pon el archivo en equipos/public/config.js o la variable LANZADOR_CONFIG_B64.");
  // La plantilla en blanco dejaría la app sin abrir: se revisa antes de publicar.
  const vacios = texto.split("\n").filter((l) => /^\s*const (vapidKey|notifyUrl) = "PEGA/.test(l) || /firebaseConfig\s*=\s*\{\s*\}/.test(l));
  if (!/const firebaseConfig\s*=\s*\{[^}]*apiKey:\s*"AIza/.test(texto) || vacios.length) fallar("El config.js está en blanco o incompleto (faltan los datos de Firebase, la clave push o la dirección del Worker).");
  return texto;
}

if (quiere("lanzador")) {
  paso("Lanzador: armar el sitio");
  correr(process.execPath, [join(here, "build.mjs")]);
  const config = configDelLanzador();
  const carpeta = mkdtempSync(join(tmpdir(), "lanzador-sitio-"));
  try {
    (function copiar(origen, destino) {
      mkdirSync(destino, { recursive: true });
      for (const f of readdirSync(origen)) {
        if (f.startsWith(".") || f === "config.ejemplo.js" || f === "config.js") continue;
        const o = join(origen, f), d = join(destino, f);
        statSync(o).isDirectory() ? copiar(o, d) : cpSync(o, d);
      }
    })(join(here, "public"), carpeta);
    writeFileSync(join(carpeta, "config.js"), config);
    if (existsSync(join(carpeta, "asesor"))) fallar("El sitio todavía trae /asesor/: el Lanzador va sin el Asesor.");
    console.log("  Sitio listo en una carpeta temporal (sin /asesor/, con tu config.js).");
    if (simular) console.log("  (simulación) Publicaría en el proyecto de Pages «" + PAGES_LANZADOR + "».");
    else {
      const lista = correr(wrangler, ["pages", "project", "list"], { capturar: true }).stdout || "";
      if (!lista.includes(PAGES_LANZADOR)) fallar(`No existe un proyecto de Pages llamado «${PAGES_LANZADOR}» en esa cuenta. Pon el nombre correcto en PAGES_LANZADOR (no creo uno nuevo para no dejar tu Lanzador viejo aparte).`);
      correr(wrangler, ["pages", "deploy", carpeta, "--project-name", PAGES_LANZADOR, "--branch", "main", "--commit-dirty=true"]);
    }
  } finally { rmSync(carpeta, { recursive: true, force: true }); }
}

// ---------- Worker de avisos (solo el código: variables y secretos quedan como están) ----------
if (quiere("worker")) {
  paso("Worker de avisos: «" + WORKER + "»");
  const carpeta = mkdtempSync(join(tmpdir(), "lanzador-worker-"));
  try {
    mkdirSync(join(carpeta, "src"));
    cpSync(join(here, "worker", "src", "index.js"), join(carpeta, "src", "index.js"));
    // Sin [vars]: así no se pisan FIREBASE_PROJECT_ID, APP_URL ni ALLOWED_ORIGINS que ya tienes en Cloudflare.
    writeFileSync(join(carpeta, "wrangler.toml"), `name = "${WORKER}"\nmain = "src/index.js"\ncompatibility_date = "2026-09-01"\n`);
    if (simular) console.log("  (simulación) Subiría solo el código al Worker «" + WORKER + "» con --keep-vars.");
    else correr(wrangler, ["deploy", "--config", join(carpeta, "wrangler.toml"), "--keep-vars"], { cwd: carpeta });
  } finally { rmSync(carpeta, { recursive: true, force: true }); }
}

// ---------- Asesor IA ----------
if (quiere("asesor")) {
  paso("Asesor IA: armar la app");
  const web = join(here, "..", "asesor-ia", "web");
  correr(process.execPath, [join(web, "build.mjs")], { cwd: web });
  if (simular) console.log("  (simulación) Publicaría web/dist en el proyecto de Pages «" + PAGES_ASESOR + "» (lo crea si no existe).");
  else {
    const lista = correr(wrangler, ["pages", "project", "list"], { capturar: true }).stdout || "";
    if (!lista.includes(PAGES_ASESOR)) correr(wrangler, ["pages", "project", "create", PAGES_ASESOR, "--production-branch", "main"]);
    correr(wrangler, ["pages", "deploy", join(web, "dist"), "--project-name", PAGES_ASESOR, "--branch", "main", "--commit-dirty=true"]);
  }
}

console.log(simular ? "\n✓ Simulación terminada: nada se publicó." : "\n✓ Publicado. Abre las direcciones y revisa que carguen.");
