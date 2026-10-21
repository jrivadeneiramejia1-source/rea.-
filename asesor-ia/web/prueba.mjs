// Prueba de la app web propia del Asesor IA (web/dist) en un navegador real: carga, se puede instalar,
// funciona sin internet después de abrirla una vez y no trae nada del Lanzador.
// Uso (después de «node build.mjs», con «npm ci» hecho en ../../equipos para las librerías):
//   PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… node prueba.mjs
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import { extname } from "node:path";
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const DIST = new URL("./dist/", import.meta.url);
const NM = new URL("../../equipos/node_modules/", import.meta.url);
const LIBS = [[/react-dom[@/].*react-dom\.production\.min\.js$/, "react-dom/umd/react-dom.production.min.js"], [/react[@/].*\/react\.production\.min\.js$/, "react/umd/react.production.min.js"],
  [/htm@3\.1\.1\/dist\/htm\.umd\.js$/, "htm/dist/htm.umd.js"], [/lucide-react@0\.263\.1\/dist\/umd\/lucide-react\.min\.js$/, "lucide-react/dist/umd/lucide-react.min.js"]];
const TIPOS = { ".html": "text/html; charset=utf-8", ".js": "text/javascript", ".webmanifest": "application/manifest+json", ".png": "image/png" };
const srv = http.createServer((q, r) => {
  const p = decodeURIComponent(new URL(q.url, "http://x").pathname).replace(/^\/+/, "") || "index.html";
  const f = new URL(p, DIST);
  if (!f.href.startsWith(DIST.href) || !existsSync(f)) { r.writeHead(404); return r.end(); }
  r.writeHead(200, { "content-type": TIPOS[extname(f.pathname)] || "application/octet-stream" }); r.end(readFileSync(f));
}).listen(8767);
const URL0 = "http://127.0.0.1:8767/";
let ok = 0; const errores = [];
const paso = (n) => { ok++; console.log("  ✓", n); };
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const ctx = await b.newContext({ viewport: { width: 390, height: 844 }, colorScheme: "dark", locale: "es-CO", serviceWorkers: "allow" });
  // Los CDN se sirven desde node_modules (mismas versiones); las fuentes de Google se bloquean.
  await ctx.route(/^https:\/\//, (route) => {
    const u = route.request().url(), hit = LIBS.find(([re]) => re.test(u));
    return hit ? route.fulfill({ status: 200, contentType: "text/javascript", headers: { "access-control-allow-origin": "*" }, body: readFileSync(new URL(hit[1], NM), "utf8") }) : route.abort();
  });
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => errores.push(e.message));
  pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g|ERR_INTERNET_DISCONNECTED/.test(m.text())) errores.push(m.text()); });

  await pg.goto(URL0);
  await pg.getByRole("textbox").first().waitFor({ timeout: 20000 });
  assert.equal(await pg.title(), "Asesor IA");
  assert.equal(await pg.evaluate(() => document.documentElement.lang), "es");
  paso("abre la app con su título y en español");

  const man = await pg.evaluate(async () => (await fetch(document.querySelector('link[rel="manifest"]').href)).json());
  assert.equal(man.name, "Asesor IA"); assert.equal(man.display, "standalone");
  assert.ok(man.icons.some((i) => i.sizes === "512x512"));
  paso("tiene manifiesto para instalarla (nombre, pantalla completa e ícono de 512)");

  await pg.evaluate(() => navigator.serviceWorker.ready);
  await pg.reload(); await pg.getByRole("textbox").first().waitFor();
  assert.ok(await pg.evaluate(() => !!navigator.serviceWorker.controller), "el service worker controla la página");
  paso("el service worker queda activo");

  const html = await pg.content();
  assert.ok(!/Enviar a un compañero|asesor-puente|equipos\.promptEntrante|Lanzador/.test(html), "nada del Lanzador");
  assert.equal(await pg.getByRole("button", { name: "Enviar a un compañero" }).count(), 0);
  paso("no trae nada del Lanzador (ni botón ni conexión)");

  // Sin el atajo a node_modules: las librerías tienen que salir de la copia del service worker.
  await ctx.unrouteAll({ behavior: "ignoreErrors" });
  await ctx.route(/^https:\/\//, (route) => route.abort("internetdisconnected"));
  await ctx.setOffline(true);
  await pg.reload(); await pg.getByRole("textbox").first().waitFor({ timeout: 15000 });
  await pg.getByRole("textbox").first().fill("Necesito un script de PowerShell que borre los temporales de Windows");
  await pg.getByText(/PowerShell/).first().waitFor();
  paso("sin internet abre y funciona igual (después de abrirla una vez)");
  await ctx.setOffline(false);
  await pg.screenshot({ path: new URL("./dist-captura.png", import.meta.url).pathname });

  assert.deepEqual(errores, [], "sin errores de JavaScript");
  paso("sin errores de JavaScript");
  console.log(`\n${ok} comprobaciones OK`);
} catch (e) {
  console.error("FALLÓ:", e.message, errores); process.exitCode = 1;
} finally { await b.close(); srv.close(); }
