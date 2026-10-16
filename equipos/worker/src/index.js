// Worker de notificaciones (Cloudflare Workers, plan gratis).
// La app llama POST /notify con el token de sesión de Firebase y el id del mensaje o pedido
// que acaba de crear. El Worker comprueba quién es, lee el documento con la cuenta de
// servicio y envía la notificación push (FCM HTTP v1) a los dispositivos del destinatario.
//
// Variables: FIREBASE_PROJECT_ID, APP_URL, ALLOWED_ORIGINS (separados por coma).
// Secreto:   GOOGLE_SERVICE_ACCOUNT (el JSON completo de la cuenta de servicio).

const JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const TOKEN_URL = "https://oauth2.googleapis.com/token";
const SCOPES = "https://www.googleapis.com/auth/datastore https://www.googleapis.com/auth/firebase.messaging";
const MAX_TEXT = 140;

const enc = new TextEncoder();
const b64url = (bytes) => btoa(String.fromCharCode(...new Uint8Array(bytes))).replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
const b64urlJson = (obj) => b64url(enc.encode(JSON.stringify(obj)));
const fromB64url = (s) => Uint8Array.from(atob(s.replace(/-/g, "+").replace(/_/g, "/") + "===".slice((s.length + 3) % 4)), (c) => c.charCodeAt(0));
const parseJson = (bytes) => JSON.parse(new TextDecoder().decode(bytes));

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

// ---------- Verificación del token de Firebase Auth ----------
let jwksCache = { keys: null, until: 0 };

async function getJwks(env) {
  const now = Date.now();
  if (jwksCache.keys && now < jwksCache.until) return jwksCache.keys;
  const res = await env.fetch(JWKS_URL);
  if (!res.ok) throw new HttpError(503, "No se pudieron leer las llaves de Google");
  const { keys } = await res.json();
  const maxAge = Number(/max-age=(\d+)/.exec(res.headers.get("cache-control") || "")?.[1] || 3600);
  jwksCache = { keys, until: now + Math.min(maxAge, 86400) * 1000 };
  return keys;
}

export async function verifyIdToken(token, env) {
  const parts = String(token || "").split(".");
  if (parts.length !== 3) throw new HttpError(401, "Sesión inválida");
  let header, payload;
  try { header = parseJson(fromB64url(parts[0])); payload = parseJson(fromB64url(parts[1])); }
  catch { throw new HttpError(401, "Sesión inválida"); }
  const project = env.FIREBASE_PROJECT_ID;
  const now = Math.floor(Date.now() / 1000);

  // Emuladores locales: tokens sin firma, solo en proyectos "demo-" (no pueden existir en producción).
  const emulator = project.startsWith("demo-") && env.EMULATOR === "1";
  if (!emulator) {
    if (header.alg !== "RS256" || !header.kid) throw new HttpError(401, "Sesión inválida");
    const jwk = (await getJwks(env)).find((k) => k.kid === header.kid);
    if (!jwk) throw new HttpError(401, "Sesión vencida, vuelve a entrar");
    const key = await crypto.subtle.importKey("jwk", jwk, { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["verify"]);
    const valid = await crypto.subtle.verify("RSASSA-PKCS1-v1_5", key, fromB64url(parts[2]), enc.encode(parts[0] + "." + parts[1]));
    if (!valid) throw new HttpError(401, "Sesión inválida");
  }
  if (payload.aud !== project || payload.iss !== `https://securetoken.google.com/${project}`) throw new HttpError(401, "La sesión es de otro proyecto");
  if (typeof payload.sub !== "string" || !payload.sub || payload.sub.length > 128) throw new HttpError(401, "Sesión inválida");
  if (!(payload.exp > now) || !(payload.iat <= now + 300)) throw new HttpError(401, "Sesión vencida, vuelve a entrar");
  return payload.sub;
}

// ---------- Token OAuth de la cuenta de servicio ----------
let accessCache = { token: null, until: 0 };

function pemToPkcs8(pem) {
  const body = pem.replace(/-----[^-]+-----/g, "").replace(/\s+/g, "");
  return Uint8Array.from(atob(body), (c) => c.charCodeAt(0));
}

export async function getAccessToken(env) {
  if (env.EMULATOR === "1" && env.FIREBASE_PROJECT_ID.startsWith("demo-")) return "owner";
  const now = Math.floor(Date.now() / 1000);
  if (accessCache.token && now < accessCache.until) return accessCache.token;
  let sa;
  try { sa = JSON.parse(env.GOOGLE_SERVICE_ACCOUNT); } catch { throw new HttpError(500, "Falta configurar GOOGLE_SERVICE_ACCOUNT"); }
  const key = await crypto.subtle.importKey("pkcs8", pemToPkcs8(sa.private_key), { name: "RSASSA-PKCS1-v1_5", hash: "SHA-256" }, false, ["sign"]);
  const unsigned = b64urlJson({ alg: "RS256", typ: "JWT", kid: sa.private_key_id }) + "." +
    b64urlJson({ iss: sa.client_email, scope: SCOPES, aud: TOKEN_URL, iat: now, exp: now + 3600 });
  const signature = await crypto.subtle.sign("RSASSA-PKCS1-v1_5", key, enc.encode(unsigned));
  const res = await env.fetch(TOKEN_URL, {
    method: "POST",
    headers: { "content-type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer", assertion: unsigned + "." + b64url(signature) }),
  });
  if (!res.ok) throw new HttpError(500, "Google rechazó la cuenta de servicio");
  const data = await res.json();
  accessCache = { token: data.access_token, until: now + Math.max(60, (data.expires_in || 3600) - 120) };
  return accessCache.token;
}

// ---------- Firestore REST ----------
export function decodeValue(v) {
  if (!v || typeof v !== "object") return null;
  if ("stringValue" in v) return v.stringValue;
  if ("booleanValue" in v) return v.booleanValue;
  if ("integerValue" in v) return Number(v.integerValue);
  if ("doubleValue" in v) return v.doubleValue;
  if ("timestampValue" in v) return v.timestampValue;
  if ("nullValue" in v) return null;
  if ("mapValue" in v) return decodeFields(v.mapValue.fields || {});
  if ("arrayValue" in v) return (v.arrayValue.values || []).map(decodeValue);
  return null;
}
const decodeFields = (fields) => Object.fromEntries(Object.entries(fields || {}).map(([k, v]) => [k, decodeValue(v)]));

function encodeValue(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === "boolean") return { booleanValue: v };
  if (typeof v === "number") return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === "string") return { stringValue: v };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(encodeValue) } };
  return { mapValue: { fields: Object.fromEntries(Object.entries(v).map(([k, x]) => [k, encodeValue(x)])) } };
}

function firestore(env, access) {
  const base = (env.FIRESTORE_BASE || "https://firestore.googleapis.com") + `/v1/projects/${env.FIREBASE_PROJECT_ID}/databases/(default)/documents`;
  const headers = { authorization: `Bearer ${access}`, "content-type": "application/json" };
  const call = async (url, init = {}) => {
    const res = await env.fetch(url, { ...init, headers });
    if (res.status === 404) return null;
    if (!res.ok) throw new HttpError(502, `Firestore respondió ${res.status}`);
    return res.json();
  };
  return {
    async get(path) {
      const doc = await call(`${base}/${path}`);
      return doc ? decodeFields(doc.fields) : null;
    },
    async getMany(paths) {
      if (!paths.length) return {};
      const root = base.slice(base.indexOf("projects/"));
      const out = await call(`${base}:batchGet`, { method: "POST", body: JSON.stringify({ documents: paths.map((p) => `${root}/${p}`) }) });
      const map = {};
      for (const r of out || []) if (r.found) map[r.found.name.split("/documents/")[1]] = decodeFields(r.found.fields);
      return map;
    },
    async usersInTeam(team) {
      const out = await call(`${base}:runQuery`, {
        method: "POST",
        body: JSON.stringify({ structuredQuery: { from: [{ collectionId: "users" }], where: { fieldFilter: { field: { fieldPath: "team" }, op: "EQUAL", value: { stringValue: team } } }, limit: 500 } }),
      });
      return (out || []).filter((r) => r.document).map((r) => ({ uid: r.document.name.split("/").pop(), ...decodeFields(r.document.fields) }));
    },
    async patch(path, fields) {
      const mask = Object.keys(fields).map((f) => `updateMask.fieldPaths=${encodeURIComponent(f)}`).join("&");
      return call(`${base}/${path}?${mask}&currentDocument.exists=true`, {
        method: "PATCH",
        body: JSON.stringify({ fields: Object.fromEntries(Object.entries(fields).map(([k, v]) => [k, encodeValue(v)])) }),
      });
    },
  };
}

// ---------- Envío FCM ----------
async function sendToUsers(env, access, db, uids, note) {
  const devices = await db.getMany(uids.map((u) => `devices/${u}`));
  const base = (env.FCM_BASE || "https://fcm.googleapis.com") + `/v1/projects/${env.FIREBASE_PROJECT_ID}/messages:send`;
  let sent = 0;
  for (const uid of uids) {
    const tokens = (devices[`devices/${uid}`]?.tokens || []).filter((t) => t && typeof t.token === "string");
    if (!tokens.length) continue;
    const dead = [];
    await Promise.all(tokens.map(async (t) => {
      // Un fallo de red con un dispositivo no debe impedir avisar a los demás.
      const res = await env.fetch(base, {
        method: "POST",
        headers: { authorization: `Bearer ${access}`, "content-type": "application/json" },
        body: JSON.stringify({
          message: {
            token: t.token,
            data: { tipo: note.tipo, id: note.id, link: note.link },
            webpush: {
              headers: { Urgency: "high", TTL: "86400" },
              notification: { title: note.title, body: note.body, icon: "/icono-192.png", badge: "/insignia-72.png", tag: note.tag, renotify: true },
              fcm_options: { link: note.link },
            },
          },
        }),
      }).catch(() => null);
      if (!res) return;
      if (res.ok) { sent++; return; }
      const err = await res.json().catch(() => ({}));
      const code = err?.error?.details?.find?.((d) => d.errorCode)?.errorCode || err?.error?.status;
      if (res.status === 404 || code === "UNREGISTERED" || code === "INVALID_ARGUMENT") dead.push(t.token);
    }));
    if (dead.length) {
      await db.patch(`devices/${uid}`, { tokens: tokens.filter((t) => !dead.includes(t.token)) }).catch(() => {});
    }
  }
  return sent;
}

const clip = (s, n = MAX_TEXT) => { const t = String(s || "").replace(/\s+/g, " ").trim(); return t.length > n ? t.slice(0, n - 1) + "…" : t; };

export async function handleNotify(uid, body, env) {
  const access = await getAccessToken(env);
  const db = firestore(env, access);
  const app = (env.APP_URL || "").replace(/\/+$/, "");
  const idOk = (v) => typeof v === "string" && /^[A-Za-z0-9_-]{1,60}$/.test(v);

  if (body.test === true) {
    const me = await db.get(`users/${uid}`);
    const sent = await sendToUsers(env, access, db, [uid], { tipo: "prueba", id: "prueba", link: `${app}/`, tag: "prueba", title: "🔔 Notificaciones activas", body: `Hola ${clip(me?.name || "", 40)}, así te llegarán los avisos del equipo.` });
    return { sent };
  }

  if (idOk(body.messageId)) {
    const m = await db.get(`messages/${body.messageId}`);
    if (!m) throw new HttpError(404, "El mensaje no existe");
    if (m.from !== uid) throw new HttpError(403, "Solo quien envía puede avisar");
    if (m.notified) return { sent: 0, already: true };
    const from = await db.get(`users/${uid}`);
    const name = clip(from?.name || "Alguien del equipo", 40);
    const kinds = {
      pedido: { title: `📩 ${name} te pide un script`, body: clip(m.text) || "Toca para responder" },
      script: { title: `📜 ${name} te envió «${clip(m.script?.name || "un script", 60)}»`, body: clip(m.text) || "Toca para verlo y guardarlo" },
      prompt: { title: `✨ ${name} te envió un prompt`, body: clip(m.prompt?.title || m.text) || "Toca para abrirlo" },
      texto: { title: `💬 ${name}`, body: clip(m.text) },
    };
    const k = kinds[m.kind] || kinds.texto;
    await db.patch(`messages/${body.messageId}`, { notified: true });
    const sent = await sendToUsers(env, access, db, [m.to], { tipo: m.kind, id: body.messageId, link: `${app}/?chat=${encodeURIComponent(uid)}`, tag: `chat-${uid}`, ...k });
    return { sent };
  }

  if (idOk(body.requestId)) {
    const r = await db.get(`requests/${body.requestId}`);
    if (!r) throw new HttpError(404, "El pedido no existe");
    if (r.from !== uid) throw new HttpError(403, "Solo quien pide puede avisar");
    if (r.notified) return { sent: 0, already: true };
    const members = await db.usersInTeam(r.team);
    const from = members.find((u) => u.uid === uid);
    if (!from || from.team !== r.team) throw new HttpError(403, "Ya no estás en ese equipo");
    const to = members.filter((u) => u.uid !== uid).map((u) => u.uid);
    await db.patch(`requests/${body.requestId}`, { notified: true });
    const sent = await sendToUsers(env, access, db, to, {
      tipo: "pedido-equipo", id: body.requestId, link: `${app}/?pedido=${encodeURIComponent(body.requestId)}`, tag: `pedido-${body.requestId}`,
      title: `📣 ${clip(from.name || "Alguien", 40)} pide un script al equipo`, body: clip(r.text),
    });
    return { sent, members: to.length };
  }

  throw new HttpError(400, "Falta messageId, requestId o test");
}

// ---------- HTTP ----------
function corsHeaders(request, env) {
  const origin = request.headers.get("origin") || "";
  const allowed = String(env.ALLOWED_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  const h = { "access-control-allow-methods": "POST, OPTIONS", "access-control-allow-headers": "authorization, content-type", "access-control-max-age": "86400", vary: "origin" };
  if (allowed.includes(origin)) h["access-control-allow-origin"] = origin;
  return { headers: h, ok: allowed.includes(origin) };
}

export default {
  async fetch(request, env) {
    env = { ...env, fetch: env.fetch || ((...a) => fetch(...a)) };
    const url = new URL(request.url);
    const cors = corsHeaders(request, env);
    const json = (status, data) => new Response(JSON.stringify(data), { status, headers: { ...cors.headers, "content-type": "application/json; charset=utf-8" } });

    if (request.method === "OPTIONS") return new Response(null, { status: cors.ok ? 204 : 403, headers: cors.headers });
    if (url.pathname === "/" && request.method === "GET") return json(200, { ok: true, servicio: "notificaciones-equipos" });
    if (url.pathname !== "/notify" || request.method !== "POST") return json(404, { error: "No encontrado" });
    if (!cors.ok) return json(403, { error: "Origen no permitido" });

    try {
      const auth = request.headers.get("authorization") || "";
      const uid = await verifyIdToken(auth.startsWith("Bearer ") ? auth.slice(7) : "", env);
      const text = await request.text();
      if (text.length > 2000) throw new HttpError(413, "Petición muy grande");
      let body;
      try { body = JSON.parse(text || "{}"); } catch { throw new HttpError(400, "JSON inválido"); }
      return json(200, await handleNotify(uid, body || {}, env));
    } catch (e) {
      const status = e instanceof HttpError ? e.status : 500;
      if (status === 500) console.error(e);
      return json(status, { error: e instanceof HttpError ? e.message : "Error interno" });
    }
  },
};

export const _test = { reset() { jwksCache = { keys: null, until: 0 }; accessCache = { token: null, until: 0 }; } };
