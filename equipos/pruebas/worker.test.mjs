// Pruebas del Worker con criptografía real (RSA) y Google/Firestore/FCM simulados.
// Uso: node pruebas/worker.test.mjs
import assert from "node:assert/strict";
import worker, { verifyIdToken, decodeValue, _test } from "../worker/src/index.js";

const enc = new TextEncoder();
const b64url = (b) => Buffer.from(b).toString("base64url");
const PROJECT = "lanzador-prueba";
const ORIGIN = "https://lanzador-prueba.web.app";
let passed = 0;
const check = async (label, fn) => { _test.reset(); await fn(); passed++; console.log("  ✓", label); };

// Llaves: una simula a Google (firma tokens de sesión), otra la cuenta de servicio.
const gen = () => crypto.subtle.generateKey({ name: "RSASSA-PKCS1-v1_5", modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: "SHA-256" }, true, ["sign", "verify"]);
const google = await gen(), sa = await gen(), intruder = await gen();
const jwk = { ...(await crypto.subtle.exportKey("jwk", google.publicKey)), kid: "k1", alg: "RS256", use: "sig" };
const pkcs8 = Buffer.from(await crypto.subtle.exportKey("pkcs8", sa.privateKey)).toString("base64");
const saJson = JSON.stringify({ client_email: "notificador@lanzador-prueba.iam.gserviceaccount.com", private_key_id: "sa1", private_key: `-----BEGIN PRIVATE KEY-----\n${pkcs8.match(/.{1,64}/g).join("\n")}\n-----END PRIVATE KEY-----\n` });

async function idToken(uid, { key = google.privateKey, kid = "k1", aud = PROJECT, exp = 3600 } = {}) {
  const now = Math.floor(Date.now() / 1000);
  const head = b64url(JSON.stringify({ alg: "RS256", kid, typ: "JWT" }));
  const body = b64url(JSON.stringify({ iss: `https://securetoken.google.com/${aud}`, aud, sub: uid, iat: now - 10, exp: now + exp, auth_time: now - 10 }));
  const sig = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(head + "." + body));
  return `${head}.${body}.${b64url(sig)}`;
}

// ---------- Google simulado ----------
const enc$ = (v) => v === null ? { nullValue: null } : typeof v === "boolean" ? { booleanValue: v } : typeof v === "number" ? { integerValue: String(v) }
  : typeof v === "string" ? { stringValue: v } : Array.isArray(v) ? { arrayValue: { values: v.map(enc$) } } : { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, enc$(x)])) } };
const fields = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, enc$(v)]));

function fakeGoogle(docs, { fcmDead = [] } = {}) {
  const log = { pushes: [], patches: [], tokenCalls: 0 };
  const root = `projects/${PROJECT}/databases/(default)/documents`;
  const fetch = async (url, init = {}) => {
    const u = new URL(url);
    const ok = (data) => new Response(JSON.stringify(data), { status: 200, headers: { "content-type": "application/json", "cache-control": "public, max-age=600" } });
    if (url.startsWith("https://www.googleapis.com/service_accounts")) return ok({ keys: [jwk] });
    if (url === "https://oauth2.googleapis.com/token") {
      log.tokenCalls++;
      const assertion = new URLSearchParams(init.body.toString()).get("assertion");
      const [h, b, s] = assertion.split(".");
      const pub = await crypto.subtle.importKey("jwk", await crypto.subtle.exportKey("jwk", sa.publicKey), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
      assert.ok(await crypto.subtle.verify("RSASSA-PKCS1-v1_5", pub, Buffer.from(s, "base64url"), enc.encode(h + "." + b)), "la firma de la cuenta de servicio debe validar");
      const claims = JSON.parse(Buffer.from(b, "base64url"));
      assert.match(claims.scope, /firebase\.messaging/);
      return ok({ access_token: "ya29.prueba", expires_in: 3600 });
    }
    assert.equal(init.headers?.authorization, "Bearer ya29.prueba", "Firestore/FCM deben recibir el token OAuth");
    if (u.host === "fcm.googleapis.com") {
      const msg = JSON.parse(init.body).message;
      if (fcmDead.includes(msg.token)) return new Response(JSON.stringify({ error: { status: "NOT_FOUND", details: [{ errorCode: "UNREGISTERED" }] } }), { status: 404 });
      log.pushes.push(msg);
      return ok({ name: "projects/x/messages/1" });
    }
    const path = decodeURIComponent(u.pathname).split(`${root}`)[1] || "";
    if (path === ":batchGet") {
      return ok(JSON.parse(init.body).documents.map((name) => {
        const p = name.split("/documents/")[1];
        return docs[p] ? { found: { name: `${root}/${p}`, fields: fields(docs[p]) } } : { missing: name };
      }));
    }
    if (path === ":runQuery") {
      const team = JSON.parse(init.body).structuredQuery.where.fieldFilter.value.stringValue;
      return ok(Object.entries(docs).filter(([p, d]) => /^users\/[^/]+$/.test(p) && d.team === team).map(([p, d]) => ({ document: { name: `${root}/${p}`, fields: fields(d) } })));
    }
    const p = path.replace(/^\//, "");
    if (init.method === "PATCH") {
      const body = JSON.parse(init.body);
      log.patches.push({ path: p, mask: u.searchParams.getAll("updateMask.fieldPaths"), fields: Object.fromEntries(Object.entries(body.fields).map(([k, v]) => [k, decodeValue(v)])) });
      Object.assign(docs[p], log.patches.at(-1).fields);
      return ok({});
    }
    return docs[p] ? ok({ name: `${root}/${p}`, fields: fields(docs[p]) }) : new Response("{}", { status: 404 });
  };
  return { fetch, log };
}

const seed = () => ({
  "users/jeiler": { name: "Jeiler", team: "equipoSoporte01", status: "disponible" },
  "users/amigo": { name: "Amigo", team: "equipoSoporte01", status: "ocupado" },
  "users/tercero": { name: "Tercero", team: "equipoSoporte01", status: "disponible" },
  "users/extrano": { name: "Extraño", team: "otroEquipo0001", status: "disponible" },
  "devices/amigo": { tokens: [{ token: "tok-amigo-cel", label: "Android" }, { token: "tok-amigo-viejo", label: "PC" }] },
  "devices/jeiler": { tokens: [{ token: "tok-jeiler", label: "Android" }] },
  "devices/tercero": { tokens: [{ token: "tok-tercero", label: "iPhone" }] },
  "devices/extrano": { tokens: [{ token: "tok-extrano", label: "PC" }] },
  "messages/m1": { from: "jeiler", to: "amigo", team: "equipoSoporte01", kind: "script", text: "Prueba esto en el PC del aula", script: { id: "s1", name: "Reparar audio", lang: "ps5", code: "x" }, read: false },
  "messages/m2": { from: "amigo", to: "jeiler", team: "equipoSoporte01", kind: "pedido", text: "¿Tienes uno para la impresora?", script: null, read: false },
  "requests/r1": { from: "amigo", team: "equipoSoporte01", text: "Necesito un script para resetear Winsock", status: "abierto" },
});

async function call(docs, { uid = "jeiler", body, origin = ORIGIN, token, method = "POST", opts } = {}) {
  const g = fakeGoogle(docs, opts);
  const env = { FIREBASE_PROJECT_ID: PROJECT, APP_URL: ORIGIN, ALLOWED_ORIGINS: `${ORIGIN},https://lanzador-prueba.firebaseapp.com`, GOOGLE_SERVICE_ACCOUNT: saJson, fetch: g.fetch };
  const headers = { origin, "content-type": "application/json" };
  if (token !== null) headers.authorization = `Bearer ${token || await idToken(uid)}`;
  const res = await worker.fetch(new Request("https://notificador.workers.dev/notify", { method, headers, body: method === "POST" ? JSON.stringify(body) : undefined }), env);
  return { status: res.status, data: res.status === 204 ? null : await res.json(), cors: res.headers.get("access-control-allow-origin"), log: g.log };
}

console.log("Sesión y seguridad");
await check("token válido de Google", async () => {
  const env = { FIREBASE_PROJECT_ID: PROJECT, fetch: fakeGoogle({}).fetch };
  assert.equal(await verifyIdToken(await idToken("jeiler"), env), "jeiler");
});
await check("rechaza token firmado por otra llave", async () => {
  const r = await call(seed(), { token: await idToken("jeiler", { key: intruder.privateKey }), body: { messageId: "m1" } });
  assert.equal(r.status, 401);
});
await check("rechaza token de otro proyecto", async () => {
  assert.equal((await call(seed(), { token: await idToken("jeiler", { aud: "otro-proyecto" }), body: { messageId: "m1" } })).status, 401);
});
await check("rechaza token vencido", async () => {
  assert.equal((await call(seed(), { token: await idToken("jeiler", { exp: -60 }), body: { messageId: "m1" } })).status, 401);
});
await check("rechaza sin sesión", async () => {
  assert.equal((await call(seed(), { token: null, body: { messageId: "m1" } })).status, 401);
});
await check("rechaza un origen web no permitido", async () => {
  const r = await call(seed(), { origin: "https://pagina-mala.com", body: { messageId: "m1" } });
  assert.equal(r.status, 403); assert.equal(r.cors, null);
});
await check("CORS preflight del origen permitido", async () => {
  const r = await call(seed(), { method: "OPTIONS" });
  assert.equal(r.status, 204); assert.equal(r.cors, ORIGIN);
});
await check("no se puede avisar por un mensaje ajeno", async () => {
  const r = await call(seed(), { uid: "amigo", body: { messageId: "m1" } });
  assert.equal(r.status, 403); assert.equal(r.log.pushes.length, 0);
});
await check("id con caracteres raros se rechaza", async () => {
  assert.equal((await call(seed(), { body: { messageId: "../users/amigo" } })).status, 400);
});

console.log("Notificaciones");
await check("script enviado: avisa al destinatario y limpia el dispositivo muerto", async () => {
  const docs = seed();
  const r = await call(docs, { body: { messageId: "m1" }, opts: { fcmDead: ["tok-amigo-viejo"] } });
  assert.equal(r.status, 200); assert.equal(r.data.sent, 1);
  const p = r.log.pushes[0];
  assert.equal(p.token, "tok-amigo-cel");
  assert.equal(p.webpush.notification.title, "📜 Jeiler te envió «Reparar audio»");
  assert.equal(p.webpush.fcm_options.link, `${ORIGIN}/?chat=jeiler`);
  assert.deepEqual(docs["devices/amigo"].tokens.map((t) => t.token), ["tok-amigo-cel"]);
  assert.equal(docs["messages/m1"].notified, true);
});
await check("no repite el aviso del mismo mensaje", async () => {
  const docs = seed(); await call(docs, { body: { messageId: "m1" } });
  const r = await call(docs, { body: { messageId: "m1" } });
  assert.equal(r.data.already, true); assert.equal(r.log.pushes.length, 0);
});
await check("pedido directo: «Amigo te pide un script»", async () => {
  const r = await call(seed(), { uid: "amigo", body: { messageId: "m2" } });
  assert.equal(r.log.pushes[0].token, "tok-jeiler");
  assert.equal(r.log.pushes[0].webpush.notification.title, "📩 Amigo te pide un script");
  assert.equal(r.log.pushes[0].webpush.notification.body, "¿Tienes uno para la impresora?");
});
await check("pedido al equipo: avisa a todos menos a quien pide y a otros equipos", async () => {
  const r = await call(seed(), { uid: "amigo", body: { requestId: "r1" } });
  assert.deepEqual(r.log.pushes.map((p) => p.token).sort(), ["tok-jeiler", "tok-tercero"]);
  assert.equal(r.log.pushes[0].webpush.notification.title, "📣 Amigo pide un script al equipo");
  assert.equal(r.log.pushes[0].webpush.fcm_options.link, `${ORIGIN}/?pedido=r1`);
});
await check("notificación de prueba a mis propios dispositivos", async () => {
  const r = await call(seed(), { body: { test: true } });
  assert.equal(r.data.sent, 1); assert.equal(r.log.pushes[0].token, "tok-jeiler");
});
await check("reutiliza el token OAuth entre avisos", async () => {
  const docs = seed();
  const g = fakeGoogle(docs);
  const env = { FIREBASE_PROJECT_ID: PROJECT, APP_URL: ORIGIN, ALLOWED_ORIGINS: ORIGIN, GOOGLE_SERVICE_ACCOUNT: saJson, fetch: g.fetch };
  for (const [uid, body] of [["jeiler", { messageId: "m1" }], ["amigo", { messageId: "m2" }]]) {
    const res = await worker.fetch(new Request("https://x/notify", { method: "POST", headers: { origin: ORIGIN, authorization: `Bearer ${await idToken(uid)}` }, body: JSON.stringify(body) }), env);
    assert.equal(res.status, 200);
  }
  assert.equal(g.log.tokenCalls, 1);
});

console.log(`\n${passed} comprobaciones OK`);
