// Prueba de la interfaz del Asesor IA en un navegador real (Playwright), a 390 px y en escritorio.
// Las librerías de los CDN se sirven desde equipos/node_modules (mismas versiones); las fuentes de Google se bloquean.
// Uso, desde asesor-ia/artifact (con «npm ci» hecho en ../../equipos):
//   PLAYWRIGHT_MODULE=… CHROMIUM_PATH=… AXE_PATH=…/axe.min.js node pruebas/interfaz.mjs
import http from "node:http";
import { readFileSync, existsSync } from "node:fs";
import assert from "node:assert/strict";
const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const NM = new URL("../../../equipos/node_modules/", import.meta.url);
const LIBS = [[/react-dom[@/].*react-dom\.production\.min\.js$/, "react-dom/umd/react-dom.production.min.js"], [/react[@/].*\/react\.production\.min\.js$/, "react/umd/react.production.min.js"],
  [/htm@3\.1\.1\/dist\/htm\.umd\.js$/, "htm/dist/htm.umd.js"], [/lucide-react@0\.263\.1\/dist\/umd\/lucide-react\.min\.js$/, "lucide-react/dist/umd/lucide-react.min.js"]];
const page0 = readFileSync(new URL("../asesor-ia.html", import.meta.url), "utf8");
// En claude.ai el archivo va dentro de un esqueleto de página: aquí se arma uno sin lang para comprobar que el Asesor lo pone.
const srv = http.createServer((q, r) => { r.writeHead(200, { "content-type": "text/html; charset=utf-8" }); r.end("<!doctype html><html><head><meta charset=utf-8><meta name=viewport content='width=device-width,initial-scale=1'></head><body>" + page0 + "</body></html>"); }).listen(8766);
const AXE = process.env.AXE_PATH && existsSync(process.env.AXE_PATH) ? readFileSync(process.env.AXE_PATH, "utf8") : "";
let ok = 0; const errores = [];
const paso = (n) => { ok++; console.log("  ✓", n); };
const b = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
async function abrir(viewport, memoria) {
  const ctx = await b.newContext({ viewport, colorScheme: "dark", locale: "es-CO", permissions: ["clipboard-read", "clipboard-write"] });
  if (memoria) await ctx.addInitScript((m) => { try { localStorage.setItem("asesor.v3", JSON.stringify(m)); } catch (e) {} }, memoria);
  const pg = await ctx.newPage();
  pg.on("pageerror", (e) => errores.push(e.message));
  pg.on("console", (m) => { if (m.type() === "error" && !/Failed to load resource|fonts\.g/.test(m.text())) errores.push(m.text()); });
  await pg.route(/^https:\/\//, (route) => {
    const u = route.request().url(), hit = LIBS.find(([re]) => re.test(u));
    return hit ? route.fulfill({ status: 200, contentType: "text/javascript", body: readFileSync(new URL(hit[1], NM), "utf8") }) : route.abort();
  });
  await pg.goto("http://127.0.0.1:8766/"); await pg.waitForSelector("#idea");
  return pg;
}
const sinDesborde = (pg) => pg.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1);
async function axe(pg, nombre) {
  if (!AXE) return;
  await pg.addScriptTag({ content: AXE });
  const v = await pg.evaluate(async () => (await window.axe.run(document, { runOnly: ["wcag2a", "wcag2aa", "wcag21a", "wcag21aa", "best-practice"] })).violations.map((x) => x.id + " (" + x.nodes.length + "): " + x.nodes[0].target.join(" ")));
  assert.deepEqual(v, [], "axe: " + nombre);
  paso("accesibilidad sin fallas: " + nombre);
}
try {
  const largo = "C:\\Users\\Jeiler\\AppData\\Local\\Programs\\Microsoft VS Code\\resources\\app\\extensions\\ms-vscode.powershell\\modules\\PSScriptAnalyzer\\1.21.0\\Settings";
  const mem = { v: 3, favorites: [{ id: "f1", ts: 1, idea: largo + " no carga", prompt: "x", type: "general", framework: "xml", provider: "claude", score: 50, level: 2, answers: {} }],
    templates: [{ id: "t1", name: "PlantillaConUnNombreMuyLargoSinEspaciosParaVerSiRompeLaPantallaDelCelular", text: largo, ts: 1 }], facts: { "Ruta larga": largo } };
  const P = await abrir({ width: 390, height: 844 }, mem);
  assert.equal(await P.evaluate(() => document.documentElement.lang), "es"); paso("la página queda en español (lang=es)");
  assert.equal(await P.locator('[role="status"][aria-live="polite"]').count(), 1); paso("la región de avisos existe siempre (lectores de pantalla)");

  console.log("Respuestas de otra idea");
  await P.fill("#idea", "mi flujo de n8n falla con error 401 en el nodo de Gmail");
  const q1 = P.locator('input[id^="q-"]').first(); await q1.fill("401 invalid_grant");
  await P.fill("#idea", "outlook no abre en el equipo de un cliente");
  await P.waitForTimeout(200);
  const vacias = await P.locator('input[id^="q-"]').evaluateAll((l) => l.every((i) => !i.value));
  assert.ok(vacias, "las respuestas de la idea anterior no pasan a la nueva");
  assert.doesNotMatch(await P.locator('textarea[aria-label^="Prompt mejorado"]').inputValue(), /invalid_grant/);
  paso("al cambiar a una idea distinta se borran las respuestas anteriores");

  console.log("Edición a mano");
  const caja = P.locator('textarea[aria-label^="Prompt mejorado"]');
  await caja.fill((await caja.inputValue()) + "\nNOTA MÍA");
  await P.locator('input[id^="q-"]').first().fill("HP ProBook 440 con Windows 11");
  await P.getByText("lo habías editado a mano").waitFor();
  assert.match(await caja.inputValue(), /NOTA MÍA/);
  await P.getByRole("button", { name: "Mantener mi edición" }).click();
  await P.waitForTimeout(100);
  assert.equal(await P.getByText("lo habías editado a mano").count(), 0); assert.match(await caja.inputValue(), /NOTA MÍA/);
  paso("tu edición no se pierde: se pregunta si dejar la tuya o el prompt nuevo");

  console.log("Datos sensibles y plantillas");
  await P.fill("#idea", "revisa mi configuración de n8n: password=Sup3rSecreta y Authorization: Bearer abcdefghijklmnop1234 no conecta");
  await P.getByText(/Oculté \d+ datos sensibles/).waitFor();
  assert.doesNotMatch(await caja.inputValue(), /Sup3rSecreta|abcdefghijklmnop1234/);
  paso("oculta contraseñas y tokens del prompt y lo avisa");
  await P.getByRole("button", { name: "Biblioteca" }).click();
  await P.locator("li", { hasText: "Diagnóstico de un equipo" }).getByRole("button", { name: "Usar" }).click();
  await P.getByText("Faltan por llenar:").waitFor();
  paso("una plantilla sin llenar avisa qué partes faltan");
  await P.getByRole("button", { name: "Nueva idea" }).click();
  await P.getByRole("button", { name: /Toca otra vez/ }).click();
  assert.equal(await P.inputValue("#idea"), ""); paso("«Nueva idea» (con doble toque) deja todo en blanco");
  await axe(P, "Crear (390 px)");

  console.log("Celular: nada se sale de la pantalla");
  for (const tab of ["Biblioteca", "Perfil", "Crear"]) {
    await P.getByRole("button", { name: new RegExp("^" + tab) }).click(); await P.waitForTimeout(150);
    assert.ok(await sinDesborde(P), "desborde en " + tab);
    if (tab !== "Crear") await axe(P, tab + " (390 px)");
  }
  paso("Crear, Biblioteca y Perfil caben en 390 px con rutas y nombres largos");
  const alto = await P.evaluate(() => Math.min(...[...document.querySelectorAll("main button")].filter((x) => x.offsetParent).map((x) => x.getBoundingClientRect().height)));
  assert.ok(alto >= 40, "botón más bajo: " + alto); paso("botones de 40 px o más");

  const D = await abrir({ width: 1280, height: 800 });
  await D.fill("#idea", "la impresora no imprime");
  await D.getByText("Soporte técnico").first().waitFor();
  assert.ok(await D.locator('input[id^="q-"]').count() >= 1); paso("escritorio: «la impresora no imprime» es soporte técnico y pregunta");
  await axe(D, "Crear (escritorio)");

  assert.deepEqual(errores, [], "sin errores de JavaScript"); paso("sin errores de JavaScript");
  console.log(`\n${ok} comprobaciones OK`);
} catch (e) {
  console.error("FALLÓ:", e.message, errores);
  process.exitCode = 1;
} finally { await b.close(); srv.close(); }
