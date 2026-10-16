// Prueba de extremo a extremo con dos personas reales en navegadores separados.
// Emuladores de Firebase (Auth, Firestore, Hosting) + el Worker real + un FCM simulado que registra los avisos.
// Uso (con Playwright instalado):
//   npx firebase emulators:exec --only auth,firestore,hosting --project demo-equipos "node pruebas/e2e.mjs"
import http from "node:http";
import assert from "node:assert/strict";
import { writeFileSync, rmSync, mkdirSync } from "node:fs";
import worker from "../worker/src/index.js";

const { chromium } = await import(process.env.PLAYWRIGHT_MODULE || "playwright");
const APP = "http://127.0.0.1:5000";
const FS = "http://127.0.0.1:8080/v1/projects/demo-equipos/databases/(default)/documents";
const SHOTS = new URL("./capturas/", import.meta.url);
mkdirSync(SHOTS, { recursive: true });
let passed = 0;
const step = (label) => { passed++; console.log("  ✓", label); };

// ---------- FCM simulado y Worker ----------
const pushes = [];
const fcm = http.createServer((req, res) => {
  let body = ""; req.on("data", (c) => (body += c));
  req.on("end", () => { pushes.push(JSON.parse(body).message); res.writeHead(200, { "content-type": "application/json" }); res.end('{"name":"ok"}'); });
}).listen(8788);
const env = { FIREBASE_PROJECT_ID: "demo-equipos", EMULATOR: "1", FIRESTORE_BASE: "http://127.0.0.1:8080", FCM_BASE: "http://127.0.0.1:8788", APP_URL: APP, ALLOWED_ORIGINS: APP };
const notifier = http.createServer(async (req, res) => {
  let body = ""; for await (const c of req) body += c;
  const r = await worker.fetch(new Request("http://127.0.0.1:8787" + req.url, { method: req.method, headers: Object.fromEntries(Object.entries(req.headers).filter(([k]) => !["host", "content-length", "connection"].includes(k))), body: req.method === "POST" ? body : undefined }), env);
  res.writeHead(r.status, Object.fromEntries(r.headers)); res.end(await r.text());
}).listen(8787);

const configPath = new URL("../public/config.js", import.meta.url);
writeFileSync(configPath, "self.LANZADOR_CONFIG = " + JSON.stringify({
  firebase: { apiKey: "demo-key", authDomain: "demo-equipos.firebaseapp.com", projectId: "demo-equipos", appId: "1:1:web:1", messagingSenderId: "1" },
  emulators: { auth: "http://127.0.0.1:9099", firestore: "127.0.0.1:8080" },
  notifyUrl: "http://127.0.0.1:8787", vapidKey: "prueba",
}) + ";\n");

const admin = (path, init = {}) => fetch(`${FS}/${path}`, { ...init, headers: { authorization: "Bearer owner", "content-type": "application/json" } }).then((r) => r.json());
const waitFor = async (fn, label, ms = 15000) => {
  const end = Date.now() + ms;
  for (;;) { const v = await fn(); if (v) return v; if (Date.now() > end) throw new Error("Tiempo agotado: " + label); await new Promise((r) => setTimeout(r, 200)); }
};

const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
const errors = [];
async function person() {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true, locale: "es-CO" });
  const page = await ctx.newPage();
  page.on("pageerror", (e) => errors.push(e.message));
  page.on("console", (m) => { if (m.type() === "error" && !/emulator|ERR_|Failed to load resource|messaging|net::/i.test(m.text())) errors.push(m.text()); });
  return page;
}
async function signUp(page, url, name, email) {
  await page.goto(url);
  await page.getByRole("button", { name: "Crear cuenta" }).click();
  await page.getByLabel("Tu nombre (así te verá el equipo)").fill(name);
  await page.getByLabel("Correo").fill(email);
  await page.getByLabel("Contraseña").fill("clave-segura-1");
  await page.getByRole("button", { name: "Crear cuenta" }).last().click();
  await page.getByText("¿Cómo te verá tu equipo?").waitFor();
  assert.equal(await page.getByLabel("Nombre visible").inputValue(), name);
  await page.getByLabel("Cargo o rol (opcional)").fill("Soporte técnico");
  await page.getByRole("button", { name: "Continuar" }).click();
  await page.getByText("Unirme con un código").waitFor();
}
const uidOf = (page) => page.evaluate(() => window.Equipos.me().uid);

try {
  const A = await person(), B = await person();

  console.log("Sesión y equipo");
  await A.goto(APP);
  await A.getByText("Continuar con Google").waitFor();
  await A.screenshot({ path: new URL("1-inicio-sesion.png", SHOTS).pathname });
  step("sin sesión se muestra la pantalla de inicio de sesión");
  await signUp(A, APP, "Jeiler", "jeiler@prueba.co");
  step("cuenta con correo y perfil (nombre y cargo)");
  await A.getByPlaceholder("Ej.: Soporte").fill("Soporte");
  await A.getByRole("button", { name: "Crear y obtener código" }).click();
  await A.getByRole("button", { name: "Equipo" }).click();
  const code = (await A.locator(".select-all").textContent()).trim();
  assert.match(code, /^[A-Z2-9]{4}-[A-Z2-9]{4}-[A-Z2-9]{4}$/);
  step("equipo creado con código " + code);

  await signUp(B, APP + "/?equipo=" + code.replace(/-/g, ""), "Amigo Técnico", "amigo@prueba.co");
  await B.getByText("Equipo encontrado: Soporte").waitFor();
  await B.getByRole("button", { name: "Unirme" }).click();
  await B.getByRole("button", { name: "Equipo" }).click();
  await B.getByText("Jeiler").first().waitFor();
  step("la segunda persona se une con el enlace de invitación");

  await A.getByText("Amigo Técnico").first().waitFor();
  await waitFor(async () => (await A.getByText("2 persona(s) · 2 conectada(s)").count()) > 0, "presencia");
  await A.screenshot({ path: new URL("2-equipo.png", SHOTS).pathname });
  step("Jeiler ve a Amigo conectado (presencia)");

  const [uidA, uidB] = [await uidOf(A), await uidOf(B)];
  for (const [uid, tok] of [[uidA, "tok-jeiler"], [uidB, "tok-amigo"]])
    await admin(`devices/${uid}`, { method: "PATCH", body: JSON.stringify({ fields: { tokens: { arrayValue: { values: [{ mapValue: { fields: { token: { stringValue: tok }, label: { stringValue: "Android · Chrome" }, addedAt: { integerValue: "1" } } } }] } } } }) });

  console.log("Pedido al equipo → aviso");
  await B.getByRole("button", { name: "Pedir un script" }).click();
  await B.getByPlaceholder("Ej.: uno que limpie la cola de impresión").fill("Necesito uno para reiniciar el audio");
  await B.getByRole("button", { name: "Audio" }).click();
  await B.getByRole("button", { name: "Pedir al equipo" }).click();
  await A.getByText("📣 Amigo Técnico pide un script al equipo").waitFor();
  step("Jeiler recibe el aviso dentro de la app");
  const p1 = await waitFor(() => pushes.find((p) => p.token === "tok-jeiler"), "push del pedido");
  assert.equal(p1.webpush.notification.title, "📣 Amigo Técnico pide un script al equipo");
  assert.match(p1.webpush.fcm_options.link, /\?pedido=/);
  assert.ok(!pushes.some((p) => p.token === "tok-amigo"), "quien pide no se avisa a sí mismo");
  step("el Worker manda la notificación push solo a los demás");

  console.log("Responder el pedido con un script");
  await A.getByText("Necesito uno para reiniciar el audio").first().waitFor();
  await A.getByRole("button", { name: "Tengo uno: enviar" }).click();
  await A.getByText("Reparar servicio de audio (Audiosrv)").click();
  await B.getByText(/📜 Jeiler te envió «Reparar servicio de audio/).waitFor();
  const p2 = await waitFor(() => pushes.find((p) => p.token === "tok-amigo"), "push del script");
  assert.equal(p2.webpush.notification.title, "📜 Jeiler te envió «Reparar servicio de audio (Audiosrv)»");
  assert.equal(p2.webpush.fcm_options.link, `${APP}/?chat=${uidA}`);
  step("Amigo recibe el script con aviso push y enlace al chat");

  await B.getByText(/📜 Jeiler te envió/).click();
  await B.getByText("Para tu pedido: «Necesito uno para reiniciar el audio»").waitFor();
  await B.getByRole("button", { name: "Guardar", exact: true }).click();
  await B.getByText("Guardado en tus scripts.").waitFor();
  await B.getByRole("button", { name: "Guardado", exact: true }).waitFor();
  await B.screenshot({ path: new URL("3-chat-amigo.png", SHOTS).pathname });
  step("abre el chat desde el aviso y guarda el script en su biblioteca");

  await A.getByRole("button", { name: "Chats" }).click();
  await A.getByText("Amigo Técnico").first().click();
  await A.getByText("Visto").waitFor();
  step("Jeiler ve «Visto» en su mensaje");

  await B.getByPlaceholder(/Escribe a Jeiler/).fill("¡Gracias, funcionó!");
  await B.keyboard.press("Enter");
  const bubble = A.locator("p.whitespace-pre-wrap", { hasText: "¡Gracias, funcionó!" });
  await bubble.first().waitFor();
  await A.waitForTimeout(800);
  assert.equal(await bubble.count(), 1, "el mensaje no se duplica");
  step("chat de texto en tiempo real, sin duplicados");

  console.log("Pedido directo y biblioteca");
  await A.getByRole("button", { name: "Pedir script" }).click();
  await A.getByPlaceholder("Escribe qué script necesitas").fill("¿Tienes uno para la impresora?");
  await A.getByRole("button", { name: "Enviar" }).last().click();
  await B.getByText("Te pide un script").waitFor();
  await A.screenshot({ path: new URL("4-chat-jeiler.png", SHOTS).pathname });
  step("pedido directo a una persona dentro del chat");

  await B.getByRole("button", { name: "Volver" }).click();
  await B.getByRole("button", { name: "Scripts" }).click();
  await B.getByText(/de Jeiler/).waitFor();
  await B.getByText("Reparar servicio de audio (Audiosrv)").first().click();
  await B.getByRole("button", { name: "Compartir" }).click();
  await B.getByText("Bluetooth, WhatsApp, Gmail, Drive…").waitFor();
  await B.screenshot({ path: new URL("5-compartir.png", SHOTS).pathname });
  step("menú Compartir con Bluetooth/WhatsApp, descarga, QR y envío al equipo");

  console.log("Asesor IA conectado al equipo");
  await B.goto(APP + "/asesor/");
  await B.getByRole("button", { name: "Enviar a un compañero" }).waitFor({ timeout: 20000 });
  await B.getByRole("button", { name: "Enviar a un compañero" }).click();
  await B.getByText("¿A quién le envías el prompt?").waitFor();
  await B.locator("button", { hasText: "Jeiler" }).last().click();
  await A.getByText("Prompt del Asesor IA").waitFor(); // Jeiler tiene abierto el chat con Amigo: llega directo ahí, sin aviso flotante
  await A.screenshot({ path: new URL("6-prompt-recibido.png", SHOTS).pathname });
  const p3 = await waitFor(() => pushes.find((p) => p.webpush.notification.title.startsWith("✨")), "push del prompt");
  assert.equal(p3.token, "tok-jeiler");
  step("el Asesor IA envía el prompt a un compañero con notificación");

  assert.deepEqual(errors, [], "sin errores de JavaScript");
  step("sin errores de JavaScript en la consola");
  console.log(`\n${passed} comprobaciones OK · ${pushes.length} avisos push enviados`);
} catch (e) {
  console.error("FALLÓ:", e.message, "\nErrores de página:", errors);
  process.exitCode = 1;
} finally {
  await browser.close();
  fcm.close(); notifier.close();
  rmSync(configPath, { force: true });
}
