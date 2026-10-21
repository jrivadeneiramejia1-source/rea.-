// Prueba de extremo a extremo con dos personas reales en navegadores separados.
// Emuladores de Firebase (Auth, Firestore, Hosting) + el Worker real + un FCM simulado que registra los avisos.
// Uso (con Playwright instalado):
//   npx firebase emulators:exec --only auth,firestore,hosting --project demo-equipos "node pruebas/e2e.mjs"
import http from "node:http";
import assert from "node:assert/strict";
import { writeFileSync, rmSync, mkdirSync, readFileSync } from "node:fs";
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
  // El ofrecimiento de avisos al entrar se prueba aparte (al final): aquí ya cuenta como ofrecido.
  await ctx.addInitScript(() => { try { if (!localStorage.getItem("__e2e")) { localStorage.setItem("__e2e", "1"); localStorage.setItem("equipos.avisosOfrecidos", String(Date.now())); } } catch (e) {} });
  const page = await ctx.newPage();
  page.ctx = ctx;
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

let A, B;
try {
  A = await person(); B = await person();

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
  await B.getByText("Falta contar para qué lo necesitas.").waitFor();
  assert.ok(await B.getByRole("button", { name: "Pedir al equipo" }).isDisabled(), "sin «para qué» no deja pedir");
  await B.getByPlaceholder(/la impresora de la sala 3/).fill("El PC de la sala 2 se quedó sin sonido");
  await B.getByRole("button", { name: "Windows 11" }).click();
  await B.getByRole("button", { name: "Audio" }).click();
  await B.screenshot({ path: new URL("11-pedido-para-que.png", SHOTS).pathname });
  await B.getByRole("button", { name: "Pedir al equipo" }).click();
  step("pedir al equipo exige decir para qué; se elige sistema y tema");
  await A.getByText("📣 Amigo Técnico pide un script al equipo").waitFor();
  step("Jeiler recibe el aviso dentro de la app");
  const p1 = await waitFor(() => pushes.find((p) => p.token === "tok-jeiler"), "push del pedido");
  assert.equal(p1.webpush.notification.title, "📣 Amigo Técnico pide un script al equipo");
  assert.match(p1.webpush.fcm_options.link, /\?pedido=/);
  assert.ok(!pushes.some((p) => p.token === "tok-amigo"), "quien pide no se avisa a sí mismo");
  step("el Worker manda la notificación push solo a los demás");

  console.log("Responder el pedido con un script");
  await A.getByText("Necesito uno para reiniciar el audio").first().waitFor();
  await A.getByText("El PC de la sala 2 se quedó sin sonido").waitFor();
  await A.getByText("Windows 11").first().waitFor();
  step("el pedido muestra qué necesita, para qué y en qué sistema");
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

  console.log("Chat interactivo: cómo usarlo, preguntar citando y «Me sirvió»");
  await B.getByRole("button", { name: "¿Cómo lo uso?" }).click();
  await B.getByText("Antes de empezar").waitFor();
  await B.getByText("Necesita permisos de administrador.").waitFor();
  assert.equal(await B.locator("code", { hasText: "-ExecutionPolicy Bypass -File" }).count(), 1, "trae el comando para ejecutarlo");
  await B.screenshot({ path: new URL("12-como-usarlo.png", SHOTS).pathname });
  step("«¿Cómo lo uso?» abre la guía automática: qué hace, permisos y pasos con comandos");
  await B.getByRole("button", { name: "¿Dudas? Pregúntale a Jeiler" }).click();
  await B.getByText("Respondiendo a Jeiler").waitFor();
  const caja = B.getByPlaceholder(/Escribe a Jeiler/);
  assert.equal(await caja.inputValue(), "¿Cómo uso «Reparar servicio de audio (Audiosrv)»? ");
  await caja.press("End"); await caja.pressSequentially("¿Lo corro en PowerShell 7?");
  await caja.press("Enter");
  const pregunta = B.locator('[id^="msg-"]', { hasText: "¿Lo corro en PowerShell 7?" });
  await pregunta.waitFor();
  assert.equal(await pregunta.locator("button.border-l-2").count(), 1, "la pregunta sale citando el script");
  step("desde la guía pregunta en el mismo chat, citando el script");
  await B.getByRole("button", { name: "Me sirvió" }).click();
  await B.getByText(/verá que te sirvió/).waitFor();
  assert.equal(await B.getByRole("button", { name: "Me sirvió" }).getAttribute("aria-pressed"), "true");
  step("Amigo marca «Me sirvió»");

  await A.getByRole("button", { name: "Chats" }).click();
  await A.getByText("Amigo Técnico").first().click();
  await A.getByText("Visto").first().waitFor();
  step("Jeiler ve «Visto» en su mensaje");
  await A.getByText("A Amigo le sirvió").waitFor();
  const preguntaA = A.locator('[id^="msg-"]', { hasText: "¿Lo corro en PowerShell 7?" });
  await preguntaA.waitFor();
  assert.ok((await preguntaA.locator("button.border-l-2").textContent()).startsWith("Tú"), "Jeiler ve que le citan su script");
  step("Jeiler ve «A Amigo le sirvió» y la pregunta citando su script");
  await preguntaA.getByRole("button", { name: "Opciones del mensaje" }).click();
  await A.getByRole("button", { name: "Responder", exact: true }).click();
  await A.getByText("Respondiendo a Amigo").waitFor();
  await A.getByPlaceholder(/Escribe a Amigo/).fill("Sí, en PowerShell 7 y como administrador");
  await A.keyboard.press("Enter");
  const respuesta = B.locator('[id^="msg-"]', { hasText: "Sí, en PowerShell 7 y como administrador" });
  await respuesta.waitFor();
  assert.ok((await respuesta.locator("button.border-l-2").textContent()).includes("¿Lo corro en PowerShell 7?"), "Amigo ve la respuesta citando su pregunta");
  await respuesta.locator("button.border-l-2").click();
  await B.locator('[id^="msg-"] .ring-2', { hasText: "¿Lo corro en PowerShell 7?" }).waitFor();
  await A.screenshot({ path: new URL("13-chat-citas.png", SHOTS).pathname });
  for (const pg of [A, B]) {
    const fuera = await pg.evaluate(() => [...document.querySelectorAll('[id^="msg-"] > div')].filter((e) => { const r = e.getBoundingClientRect(); return r.left < 0 || r.right > innerWidth + 1; }).length);
    assert.equal(fuera, 0, "ningún mensaje se sale de la pantalla");
  }
  step("responder citando desde el menú del mensaje; tocar la cita lleva al mensaje original");

  await B.getByPlaceholder(/Escribe a Jeiler/).fill("¡Gracias, funcionó!");
  await B.keyboard.press("Enter");
  const bubble = A.locator("p.whitespace-pre-wrap", { hasText: "¡Gracias, funcionó!" });
  await bubble.first().waitFor();
  await A.waitForTimeout(800);
  assert.equal(await bubble.count(), 1, "el mensaje no se duplica");
  step("chat de texto en tiempo real, sin duplicados");

  console.log("Pedido directo y biblioteca");
  await A.getByRole("button", { name: "Pedir script" }).click();
  await A.getByPlaceholder("Ej.: uno que limpie la cola de impresión").fill("¿Tienes uno para la impresora?");
  await A.getByPlaceholder(/la impresora de la sala 3/).fill("La de recepción no imprime");
  await A.getByRole("button", { name: "Pedir", exact: true }).click();
  await B.getByText("Te pide un script").waitFor();
  await B.getByText("La de recepción no imprime").waitFor();
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
  await B.getByText("Enviar a alguien del equipo").click();
  await B.getByRole("dialog").getByText("Jeiler").click();
  await B.getByText("Enviado a Jeiler. Quedó en su chat (pestaña Chats).").waitFor();
  await B.getByPlaceholder(/Escribe a Jeiler/).waitFor();
  assert.ok(await B.locator("p.font-medium", { hasText: "Reparar servicio de audio (Audiosrv)" }).count() >= 2, "el script enviado aparece en el chat");
  await waitFor(async () => (await A.locator("p.font-medium", { hasText: "Reparar servicio de audio (Audiosrv)" }).count()) >= 2, "Jeiler recibe el script en el chat");
  step("Compartir → Enviar a alguien: abre el chat y el script queda ahí para los dos");

  console.log("Scripts publicados al equipo (como un grupo)");
  await A.getByRole("button", { name: "Volver" }).click();
  await A.getByRole("button", { name: "Scripts" }).click();
  await A.getByRole("button", { name: /^Del equipo/ }).click();
  await A.getByRole("button", { name: "Publicar un script al equipo" }).click();
  await A.getByRole("dialog").getByText("Reparar servicio de audio (Audiosrv)").click();
  await A.getByText("Publicaste al equipo").waitFor();
  await A.screenshot({ path: new URL("7-grupo-jeiler.png", SHOTS).pathname });
  step("Jeiler publica y su script sale a su lado («Publicaste al equipo»)");
  await B.goto(APP + "/?vista=scripts");
  await B.getByRole("button", { name: /^Del equipo/ }).click();
  await B.getByText("Publicó al equipo").waitFor();
  assert.ok(await B.locator("p.text-xs.font-semibold", { hasText: "Jeiler" }).count() >= 1, "sale el nombre de quien publicó");
  await B.getByRole("button", { name: "Guardado", exact: true }).first().waitFor();
  await B.screenshot({ path: new URL("8-grupo-amigo.png", SHOTS).pathname });
  step("Amigo lo ve al otro lado con el nombre de Jeiler (y marca que ya lo guardó)");

  console.log("Con las reglas de Firestore anteriores no se pierde nada");
  const RULES = "http://127.0.0.1:8080/emulator/v1/projects/demo-equipos:securityRules";
  const reglas = readFileSync(new URL("../firestore.rules", import.meta.url), "utf8");
  const ponerReglas = (content) => fetch(RULES, { method: "PUT", body: JSON.stringify({ rules: { files: [{ name: "firestore.rules", content }] } }) }).then((r) => assert.ok(r.ok, "reglas cargadas"));
  await ponerReglas(reglas.replace(/, 'purpose', 'system'(, 'replyTo')?/g, ""));
  await A.locator("nav").getByRole("button", { name: /^Equipo/ }).click();
  await A.getByRole("button", { name: "Pedir un script" }).click();
  await A.getByPlaceholder("Ej.: uno que limpie la cola de impresión").fill("Uno para liberar espacio");
  await A.getByPlaceholder(/la impresora de la sala 3/).fill("El disco C está lleno");
  await A.getByRole("button", { name: "Pedir al equipo" }).click();
  await A.getByText(/Enviado sin los datos nuevos/).waitFor();
  await A.getByText(/Para: El disco C está lleno/).waitFor();
  await ponerReglas(reglas);
  step("si aún no se pegan las reglas nuevas, el «para qué» va dentro del texto y se avisa");

  console.log("El Lanzador va sin el Asesor IA (son apps aparte)");
  await A.goto(APP);
  await A.getByRole("button", { name: /^Equipo/ }).first().waitFor();
  assert.equal(await A.getByRole("link", { name: "Abrir el Asesor IA" }).count(), 0, "sin enlace al Asesor");
  assert.equal(await A.evaluate(() => [...document.scripts].some((x) => /asesor/i.test(x.src))), false);
  step("el Lanzador ya no trae el Asesor IA ni enlaces a él");


  console.log("Limpieza automática (plan gratis de Firebase)");
  const dias = (n) => new Date(Date.now() - n * 864e5).toISOString();
  const crear = (col, id, f) => admin(`${col}?documentId=${id}`, { method: "POST", body: JSON.stringify({ fields: f }) });
  const S = (v) => ({ stringValue: v }), T = (n) => ({ timestampValue: dias(n) }), Bo = (v) => ({ booleanValue: v });
  const msg = (read, n) => ({ from: S(uidA), to: S(uidB), team: S(code.replace(/-/g, "")), kind: S("texto"), text: S("viejo"), script: { nullValue: null }, requestId: { nullValue: null }, createdAt: T(n), read: Bo(read) });
  await crear("messages", "viejoLeido", msg(true, 8));
  await crear("messages", "viejoSinLeer", msg(false, 8));
  await crear("messages", "muyViejo", msg(false, 31));
  await crear("messages", "recienLeido", msg(true, 2));
  const req = (from, status, n) => ({ from: S(from), team: S(code.replace(/-/g, "")), text: S("pedido viejo"), lang: S(""), category: S(""), createdAt: T(n), status: S(status) });
  await crear("requests", "pedidoResuelto", req(uidB, "resuelto", 8));
  await crear("requests", "pedidoAbierto", req(uidB, "abierto", 8));
  await crear("requests", "pedidoDeOtro", req(uidA, "resuelto", 8));
  const limpieza = await B.evaluate((team) => window.Equipos.cleanup({ team: team }, { force: true }), code.replace(/-/g, ""));
  const existe = async (p) => !(await admin(p)).error;
  assert.equal(await existe("messages/viejoLeido"), false, "leído hace 8 días: se borra");
  assert.equal(await existe("messages/muyViejo"), false, "31 días: se borra aunque no se haya leído");
  assert.equal(await existe("messages/viejoSinLeer"), true, "sin leer y de 8 días: se guarda");
  assert.equal(await existe("messages/recienLeido"), true, "leído hace 2 días: se guarda");
  assert.equal(await existe("requests/pedidoResuelto"), false, "pedido resuelto hace 8 días: se borra");
  assert.equal(await existe("requests/pedidoAbierto"), true, "pedido abierto de 8 días: se guarda");
  assert.equal(await existe("requests/pedidoDeOtro"), true, "lo de otra persona no lo borra");
  assert.equal(limpieza.deleted, 3);
  step("se borran solos lo leído de más de 7 días, todo lo de más de 30 y los pedidos resueltos");
  assert.equal((await B.evaluate(() => window.Equipos.cleanup({}))).skipped, true);
  step("la limpieza corre máximo dos veces al día por dispositivo");

  console.log("Avisos: el token del teléfono se mantiene al día");
  await B.ctx.grantPermissions(["notifications"], { origin: APP });
  const tokensB = async () => ((await admin(`devices/${uidB}`)).fields.tokens.arrayValue.values || []).map((v) => v.mapValue.fields.token.stringValue);
  const r1 = await B.evaluate(async () => {
    localStorage.setItem("equipos.fcmToken", "tok-amigo");   // el que este teléfono tenía guardado
    window.firebase.messaging = () => ({ getToken: async () => "tok-amigo-2", deleteToken: async () => true });
    return window.Equipos.refreshPush();
  });
  assert.equal(r1.changed, true);
  assert.deepEqual(await tokensB(), ["tok-amigo-2"], "el token viejo de este teléfono se reemplaza");
  assert.equal(await B.evaluate(() => localStorage.getItem("equipos.fcmToken")), "tok-amigo-2");
  assert.equal((await B.evaluate(() => window.Equipos.refreshPush())).changed, false, "si nada cambió no escribe");
  step("al abrir la app, si Firebase cambió el token se actualiza solo (sin eso los avisos no llegaban)");
  const antes = pushes.length;
  await A.goto(APP + "/?chat=" + uidB);
  await A.getByLabel("Mensaje para Amigo Técnico").fill("¿Te llegó este aviso?");
  await A.keyboard.press("Enter");
  const p4 = await waitFor(() => pushes.slice(antes).find((p) => p.webpush.notification.title === "💬 Jeiler"), "push del chat interno");
  assert.equal(p4.token, "tok-amigo-2");
  step("el mensaje del chat interno avisa al token nuevo");
  await A.getByText("Los mensajes se borran solos 7 días después de leídos").waitFor();
  step("el chat dice cuándo se borran los mensajes");

  console.log("Teléfono nuevo: se ofrecen los avisos");
  await A.evaluate(() => localStorage.removeItem("equipos.avisosOfrecidos"));
  await A.goto(APP);
  await A.getByText("¿Avisos en este dispositivo?").waitFor({ timeout: 10000 });
  await A.screenshot({ path: new URL("12-ofrecer-avisos.png", SHOTS).pathname });
  await A.getByRole("button", { name: "Ahora no" }).click();
  await A.reload();
  await A.getByRole("button", { name: /^Equipo/ }).first().waitFor();
  await new Promise((ok) => setTimeout(ok, 3500));
  assert.equal(await A.getByText("¿Avisos en este dispositivo?").count(), 0, "no insiste otra vez el mismo día");
  step("en un teléfono sin avisos se ofrece activarlos una vez (y no insiste)");

  assert.deepEqual(errors, [], "sin errores de JavaScript");
  step("sin errores de JavaScript en la consola");
  console.log(`\n${passed} comprobaciones OK · ${pushes.length} avisos push enviados`);
} catch (e) {
  console.error("FALLÓ:", e.message, "\nErrores de página:", errors);
  for (const [n, pg] of [["A", A], ["B", B]]) if (pg) await pg.screenshot({ path: new URL("falla-" + n + ".png", SHOTS).pathname }).catch(() => {});
  if (B) console.error("Diagnóstico B:", JSON.stringify(await B.evaluate(async () => {
    try {
      const E = window.Equipos, u = E.me();
      const p = await new Promise((ok) => { let off = () => {}; off = E.watchProfile(u.uid, (x) => { setTimeout(() => off(), 0); ok(x); }, (e) => ok({ err: e.code })); });
      const m = await new Promise((ok) => { let off = () => {}; off = E.watchMembers(p.team, (l) => { setTimeout(() => off(), 0); ok(l.map((x) => x.name + "/" + x.team)); }, (e) => ok("ERR " + e.code + " " + e.message)); });
      return { uid: u.uid, team: p.team, m };
    } catch (e) { return "excepción " + e.message; }
  }).catch((e) => e.message)));
  process.exitCode = 1;
} finally {
  await browser.close();
  fcm.close(); notifier.close();
  rmSync(configPath, { force: true });
}
