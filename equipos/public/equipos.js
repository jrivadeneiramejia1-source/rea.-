/*
 * Capa de datos de Lanzador · Equipos (sin interfaz).
 * Firebase Auth = quién eres · Firestore = equipo, chat, pedidos y biblioteca · FCM + Worker = avisos push.
 * La interfaz (lanzador.js) y el Asesor IA usan solo este objeto: window.Equipos.
 */
(function (root) {
  "use strict";
  const G = root.GestorEngine;
  const ONLINE_MS = 5 * 60 * 1000;      // sin latido en 5 min = desconectado
  const HEARTBEAT_MS = 2 * 60 * 1000;   // latido de presencia cada 2 min mientras la app está abierta
  const STATUSES = { disponible: "Disponible", ocupado: "Ocupado", ausente: "Ausente" };
  const CODE_ABC = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // sin 0/O ni 1/I para dictarlo sin errores

  let app = null, auth = null, db = null, cfg = {}, swReg = null;
  const FV = () => root.firebase.firestore.FieldValue;

  // ---------- Arranque ----------
  // Configuración: public/config.js (window.LANZADOR_CONFIG). Si no trae los datos de Firebase,
  // se usan los que Firebase Hosting publica en /__/firebase/init.json.
  const filled = (v) => typeof v === "string" && v.trim() !== "" && !/PEGA/i.test(v);
  async function loadConfig() {
    if (root.__configError) throw new Error("El archivo config.js quedó con un error (" + root.__configError + "). Revisa que pegaste solo el bloque «const firebaseConfig = { … };» y que no borraste comillas.");
    const own = root.LANZADOR_CONFIG && typeof root.LANZADOR_CONFIG === "object" ? root.LANZADOR_CONFIG : {};
    let firebaseCfg = own.firebase || null;
    if (firebaseCfg && !filled(firebaseCfg.apiKey)) throw new Error("En el archivo config.js falta pegar los datos de Firebase (el bloque «const firebaseConfig = {…}»).");
    if (!firebaseCfg) firebaseCfg = await fetch("/__/firebase/init.json").then((r) => r.json()).catch(() => null);
    if (!firebaseCfg || !filled(firebaseCfg.apiKey)) throw new Error("Falta el archivo config.js con los datos de Firebase.");
    const url = filled(own.notifyUrl) && /^https?:\/\//.test(own.notifyUrl.trim()) ? own.notifyUrl.trim() : "";
    return Object.assign({}, own, { firebase: firebaseCfg, vapidKey: filled(own.vapidKey) ? own.vapidKey.trim() : "", notifyUrl: url });
  }

  async function init() {
    if (app) return api;
    cfg = await loadConfig();
    app = root.firebase.initializeApp(cfg.firebase);
    auth = root.firebase.auth();
    db = root.firebase.firestore();
    if (cfg.emulators) {
      auth.useEmulator(cfg.emulators.auth, { disableWarnings: true });
      const [h, p] = cfg.emulators.firestore.split(":");
      db.useEmulator(h, Number(p));
    } else {
      // Funciona sin internet: lo ya visto queda en el dispositivo y lo escrito se sube al volver la conexión.
      await db.enablePersistence({ synchronizeTabs: true }).catch(() => {});
    }
    auth.languageCode = "es";
    if ("serviceWorker" in navigator) swReg = await navigator.serviceWorker.register("/sw.js").catch(() => null);
    return api;
  }

  // ---------- Sesión ----------
  const AUTH_ERRORS = {
    "auth/invalid-credential": "Correo o contraseña incorrectos.",
    "auth/wrong-password": "Correo o contraseña incorrectos.",
    "auth/user-not-found": "No hay una cuenta con ese correo.",
    "auth/email-already-in-use": "Ya existe una cuenta con ese correo: entra con «Iniciar sesión».",
    "auth/weak-password": "La contraseña debe tener al menos 6 caracteres.",
    "auth/invalid-email": "Ese correo no es válido.",
    "auth/too-many-requests": "Demasiados intentos. Espera unos minutos.",
    "auth/network-request-failed": "Sin conexión a internet.",
    "auth/popup-closed-by-user": "Cerraste la ventana de Google antes de terminar.",
    "auth/operation-not-allowed": "Ese método de inicio de sesión no está activado en Firebase (Authentication → Sign-in method).",
    "auth/unauthorized-domain": "Este dominio no está autorizado en Firebase (Authentication → Settings → Authorized domains).",
  };
  const authMessage = (e) => AUTH_ERRORS[e && e.code] || (e && e.message) || "No se pudo iniciar sesión.";

  async function signInGoogle() {
    const provider = new root.firebase.auth.GoogleAuthProvider();
    provider.setCustomParameters({ prompt: "select_account" });
    try { await auth.signInWithPopup(provider); }
    catch (e) {
      // En el iPhone con la app instalada las ventanas emergentes se bloquean: se usa redirección.
      if (e && (e.code === "auth/popup-blocked" || e.code === "auth/operation-not-supported-in-this-environment")) return auth.signInWithRedirect(provider);
      throw e;
    }
  }
  async function signUpEmail(name, email, password) {
    // El perfil se crea antes de que Firebase guarde el nombre: se pasa por sessionStorage.
    try { sessionStorage.setItem("equipos.nombre", name.trim().slice(0, 60)); } catch (e) { /* sin almacenamiento */ }
    const cred = await auth.createUserWithEmailAndPassword(email.trim(), password);
    await cred.user.updateProfile({ displayName: name.trim().slice(0, 60) });
    return cred.user;
  }
  const signInEmail = (email, password) => auth.signInWithEmailAndPassword(email.trim(), password);
  const resetPassword = (email) => auth.sendPasswordResetEmail(email.trim());
  async function signOut() {
    stopPresence();
    await removeThisDevice().catch(() => {});
    await auth.signOut();
  }
  const onAuth = (fn) => auth.onAuthStateChanged(fn);
  const me = () => auth.currentUser;
  const providerLabel = (u) => (u && u.providerData && u.providerData.some((p) => p.providerId === "google.com") ? "Google" : "correo y contraseña");

  // ---------- Perfil y equipo ----------
  const userRef = (uid) => db.collection("users").doc(uid);
  // "confirmed" = el servidor ya guardó el perfil (las reglas de Firestore leen esa versión, no la local).
  const watchProfile = (uid, fn, err) => userRef(uid).onSnapshot({ includeMetadataChanges: true },
    (d) => fn(d.exists ? Object.assign({ uid: uid }, d.data()) : null, !d.metadata.hasPendingWrites && !d.metadata.fromCache), err);

  async function saveProfile(fields) {
    const u = me();
    const ref = userRef(u.uid);
    const snap = await ref.get();
    const base = snap.exists ? snap.data() : { name: "", photoURL: "", cargo: "", status: "disponible", team: "", createdAt: Date.now() };
    const data = Object.assign({}, base, fields, { lastSeen: FV().serverTimestamp() });
    data.name = String(data.name || u.displayName || (u.email || "").split("@")[0] || "Sin nombre").trim().slice(0, 60);
    data.photoURL = String(data.photoURL || u.photoURL || "").slice(0, 500);
    data.cargo = String(data.cargo || "").slice(0, 80);
    await ref.set(data);
    if (!snap.exists) await seedLibrary();
    return data;
  }

  function newTeamCode() {
    const bytes = crypto.getRandomValues(new Uint8Array(12));
    return Array.from(bytes, (b) => CODE_ABC[b % CODE_ABC.length]).join("");
  }
  const cleanCode = (c) => String(c || "").toUpperCase().replace(/[^A-Z0-9]/g, "");
  const formatCode = (c) => cleanCode(c).replace(/(.{4})(?=.)/g, "$1-");

  async function createTeam(name) {
    const code = newTeamCode();
    await db.collection("teams").doc(code).set({ name: String(name).trim().slice(0, 60), owner: me().uid, createdAt: FV().serverTimestamp() });
    await saveProfile({ team: code });
    return code;
  }
  async function getTeam(code) {
    const c = cleanCode(code);
    if (c.length < 10 || c.length > 40) return null;
    const d = await db.collection("teams").doc(c).get().catch(() => null);
    return d && d.exists ? Object.assign({ id: c }, d.data()) : null;
  }
  async function joinTeam(code) {
    const t = await getTeam(code);
    if (!t) throw new Error("No existe un equipo con ese código. Revísalo con quien te invitó.");
    await saveProfile({ team: t.id });
    return t;
  }
  const leaveTeam = () => saveProfile({ team: "" });
  const renameTeam = (code, name) => db.collection("teams").doc(code).update({ name: String(name).trim().slice(0, 60) });
  const inviteLink = (code) => location.origin + "/?equipo=" + encodeURIComponent(code);

  function watchMembers(team, fn, err) {
    return db.collection("users").where("team", "==", team).onSnapshot((s) => {
      fn(s.docs.map((d) => Object.assign({ uid: d.id }, d.data())).sort((a, b) => a.name.localeCompare(b.name, "es")));
    }, err);
  }

  // ---------- Presencia ----------
  let beatTimer = null, beatUid = null;
  const beat = () => { if (beatUid && document.visibilityState === "visible") userRef(beatUid).update({ lastSeen: FV().serverTimestamp() }).catch(() => {}); };
  const onVisible = () => beat();
  function startPresence(uid) {
    stopPresence();
    beatUid = uid;
    beat();
    beatTimer = setInterval(beat, HEARTBEAT_MS);
    document.addEventListener("visibilitychange", onVisible);
  }
  function stopPresence() {
    if (beatTimer) clearInterval(beatTimer);
    beatTimer = null; beatUid = null;
    document.removeEventListener("visibilitychange", onVisible);
  }
  const setStatus = (status) => (STATUSES[status] ? userRef(me().uid).update({ status: status, lastSeen: FV().serverTimestamp() }) : Promise.reject(new Error("Estado inválido")));
  const millis = (t) => (t && typeof t.toMillis === "function" ? t.toMillis() : typeof t === "number" ? t : 0);
  function presence(member, now) {
    const seen = millis(member.lastSeen);
    const online = seen && (now || Date.now()) - seen < ONLINE_MS;
    if (!online) return { key: "desconectado", label: seen ? "Desconectado · " + ago(seen, now) : "Desconectado", online: false };
    return { key: member.status, label: STATUSES[member.status] || "Disponible", online: true };
  }
  function ago(ms, now) {
    const s = Math.max(0, Math.round(((now || Date.now()) - ms) / 1000));
    if (s < 60) return "hace un momento";
    if (s < 3600) return "hace " + Math.round(s / 60) + " min";
    if (s < 86400) return "hace " + Math.round(s / 3600) + " h";
    const d = Math.round(s / 86400);
    return d === 1 ? "ayer" : "hace " + d + " días";
  }

  // ---------- Mensajes (chat 1 a 1) ----------
  const messages = () => db.collection("messages");
  const cleanForSend = (s) => {
    const c = G.sanitizeScript(s);
    if (!c) throw new Error("Script inválido");
    delete c.shared; delete c.deleted; delete c.origin;
    return c;
  };
  // Sin internet Firestore guarda la escritura y la sube al reconectar; la interfaz no se queda esperando.
  async function committed(write, after) {
    if (navigator.onLine === false) { write.then(after).catch(() => {}); return { ok: false, reason: "sin internet: se enviará y avisará al reconectar", queued: true }; }
    await write;
    return after();
  }
  // Datos nuevos de un mensaje o pedido: para qué lo necesita, en qué sistema y a qué mensaje responde.
  const KINDS = ["texto", "script", "pedido", "prompt"];
  const REACTIONS = ["", "sirvio", "no-sirvio"];
  const clip = (v, n) => String(v || "").trim().slice(0, n);
  function extrasOf({ purpose, system, replyTo }) {
    const x = {};
    if (clip(purpose, 300)) x.purpose = clip(purpose, 300);
    if (clip(system, 40)) x.system = clip(system, 40);
    if (replyTo && replyTo.id) {
      x.replyTo = { id: clip(replyTo.id, 60), kind: KINDS.includes(replyTo.kind) ? replyTo.kind : "texto", text: clip(replyTo.text, 140), name: clip(replyTo.name, 120) };
    }
    return x;
  }
  // Con las reglas de Firestore anteriores esos datos no se aceptan: se mandan dentro del texto para no perderlos.
  let oldRules = false;
  const rulesOutdated = () => oldRules;
  function legacyText(text, x, max) {
    return [x.replyTo ? "↪ «" + (x.replyTo.name || x.replyTo.text) + "»" : "", text, x.purpose ? "Para: " + x.purpose : "", x.system ? "Sistema: " + x.system : ""].filter(Boolean).join("\n").slice(0, max);
  }
  function setWithFallback(ref, base, extra, max) {
    if (!Object.keys(extra).length) return ref.set(base);
    return ref.set(Object.assign({}, base, extra)).catch((e) => {
      if (!e || e.code !== "permission-denied") throw e;
      oldRules = true;
      return ref.set(Object.assign({}, base, { text: legacyText(base.text, extra, max) }));
    });
  }
  async function sendMessage(profile, to, { kind, text, script, prompt, requestId, purpose, system, replyTo }) {
    const ref = messages().doc();
    const write = setWithFallback(ref, {
      from: me().uid, to: to, team: profile.team, kind: kind || "texto",
      text: String(text || "").slice(0, 2000),
      script: script ? cleanForSend(script) : null,
      prompt: prompt ? { title: String(prompt.title || "").slice(0, 120), text: String(prompt.text).slice(0, 20000), model: String(prompt.model || "").slice(0, 60) } : null,
      requestId: requestId || null,
      createdAt: FV().serverTimestamp(), read: false,
    }, extrasOf({ purpose, system, replyTo }), 2000);
    return { id: ref.id, pushed: await committed(write, () => notify({ messageId: ref.id })) };
  }
  // «Me sirvió» / «No me funcionó» sobre un script recibido (solo quien lo recibió).
  function react(id, reaction) {
    if (!REACTIONS.includes(reaction)) return Promise.reject(new Error("Reacción inválida"));
    return messages().doc(id).update({ read: true, reaction: reaction }).catch((e) => {
      if (e && e.code === "permission-denied") { oldRules = true; throw new Error("Quien administra la app debe actualizar las reglas de Firestore para usar esta opción."); }
      throw e;
    });
  }
  // Las listas ordenadas por fecha necesitan un índice compuesto de Firestore. Si todavía no existe
  // (proyecto nuevo o índice construyéndose), se escucha la misma consulta sin orden y se ordena aquí,
  // y se le pide al Worker que cree los índices. Así nadie ve errores ni tiene que entrar a la consola.
  function watchOrdered(base, field, max, map, fn, err) {
    let unsub = null, stopped = false, current = 0;
    const emit = (s) => {
      const all = s.docs.map(map).filter(Boolean).sort((a, b) => b.at - a.at).slice(0, max);
      const keep = new Set(all.map((x) => x.id));
      fn(all, s.docChanges().filter((c) => c.type === "added").map((c) => map(c.doc)).filter((x) => x && keep.has(x.id)));
    };
    const start = (fallback) => {
      const gen = ++current;
      const u = (fallback ? base : base.orderBy(field, "desc").limit(max)).onSnapshot(emit, (e) => {
        if (!fallback && e && e.code === "failed-precondition") { prepareIndexes(); if (!stopped) start(true); }
        else if (err) err(e);
      });
      // Si el error llegó antes de que onSnapshot devolviera, ya se abrió la consulta simple: esta se cierra.
      if (gen === current) unsub = u; else u();
    };
    start(false);
    return () => { stopped = true; if (unsub) unsub(); };
  }
  let preparing = null;
  const prepareIndexes = () => (preparing = preparing || callWorker("/preparar", {}));

  const LIMIT = 300;
  const watchInbox = (uid, fn, err) => watchOrdered(messages().where("to", "==", uid), "createdAt", LIMIT, msgFromDoc, fn, err);
  const watchOutbox = (uid, fn, err) => watchOrdered(messages().where("from", "==", uid), "createdAt", LIMIT, msgFromDoc, (all) => fn(all), err);
  function msgFromDoc(d) {
    const m = Object.assign({ id: d.id }, d.data({ serverTimestamps: "estimate" }));
    m.at = millis(m.createdAt) || Date.now();
    return m;
  }
  function markRead(list) {
    const pending = list.filter((m) => !m.read && m.to === me().uid);
    if (!pending.length) return Promise.resolve();
    const batch = db.batch();
    pending.slice(0, 400).forEach((m) => batch.update(messages().doc(m.id), { read: true }));
    return batch.commit();
  }
  const deleteMessage = (id) => messages().doc(id).delete();

  // ---------- Pedidos al equipo ----------
  async function createRequest(profile, text, category, more) {
    const ref = db.collection("requests").doc();
    const x = extrasOf({ purpose: more && more.purpose, system: more && more.system });
    const write = setWithFallback(ref, { from: me().uid, team: profile.team, text: String(text).trim().slice(0, 300), lang: "", category: String(category || "").slice(0, 40), createdAt: FV().serverTimestamp(), status: "abierto" }, x, 300);
    return { id: ref.id, pushed: await committed(write, () => notify({ requestId: ref.id })) };
  }
  const watchRequests = (team, fn, err) => watchOrdered(db.collection("requests").where("team", "==", team), "createdAt", 60, msgFromDoc, fn, err);
  const setRequestStatus = (id, status) => db.collection("requests").doc(id).update({ status: status });
  const deleteRequest = (id) => db.collection("requests").doc(id).delete();

  // ---------- Biblioteca privada ----------
  const lib = () => db.collection("users").doc(me().uid).collection("scripts");
  function watchLibrary(fn, err) {
    return lib().onSnapshot((s) => fn(G.sanitizeList(s.docs.map((d) => d.data())).filter((x) => !x.deleted)), err);
  }
  function saveScript(s) {
    const c = G.sanitizeScript(Object.assign({}, s, { updatedAt: Date.now() }));
    if (!c) return Promise.reject(new Error("Script inválido"));
    delete c.deleted;
    return lib().doc(c.id).set(c).then(() => c);
  }
  const deleteScript = (id) => lib().doc(id).delete();
  async function seedLibrary() {
    const batch = db.batch();
    G.sanitizeList(G.SAMPLES).forEach((s) => batch.set(lib().doc(s.id), Object.assign({}, s, { createdAt: Date.now(), updatedAt: Date.now() })));
    await batch.commit().catch(() => {});
  }
  const saveCopy = (s, authorId) => saveScript(G.adoptScript(s, authorId));

  // ---------- Scripts publicados en el equipo ----------
  const communityId = (sid) => me().uid + "_" + sid;
  const publish = (profile, s) => db.collection("community").doc(communityId(s.id)).set({ owner: me().uid, team: profile.team, script: cleanForSend(s), publishedAt: FV().serverTimestamp() });
  const unpublish = (sid) => db.collection("community").doc(communityId(sid)).delete();
  function communityFromDoc(d) {
    const x = d.data({ serverTimestamps: "estimate" });
    const script = G.sanitizeScript(x.script);
    return script ? { id: d.id, owner: x.owner, at: millis(x.publishedAt) || Date.now(), script: script } : null;
  }
  const watchCommunity = (team, fn, err) => watchOrdered(db.collection("community").where("team", "==", team), "publishedAt", 200, communityFromDoc, (all) => fn(all), err);

  // ---------- Notificaciones push ----------
  const pushSupported = () => "Notification" in root && "serviceWorker" in navigator && "PushManager" in root;
  const isIOS = () => /iPad|iPhone|iPod/.test(navigator.userAgent) || (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1);
  const isStandalone = () => (root.matchMedia && root.matchMedia("(display-mode: standalone)").matches) || navigator.standalone === true;
  function deviceLabel() {
    const ua = navigator.userAgent;
    const os = /Android/.test(ua) ? "Android" : isIOS() ? "iPhone/iPad" : /Windows/.test(ua) ? "Windows" : /Mac OS/.test(ua) ? "Mac" : /Linux/.test(ua) ? "Linux" : "Dispositivo";
    const br = /Edg\//.test(ua) ? "Edge" : /SamsungBrowser/.test(ua) ? "Samsung Internet" : /Firefox\//.test(ua) ? "Firefox" : /Chrome\//.test(ua) ? "Chrome" : /Safari\//.test(ua) ? "Safari" : "Navegador";
    return os + " · " + br + (isStandalone() ? " (app)" : "");
  }
  const TOKEN_KEY = "equipos.fcmToken";
  const pushReady = () => !!(cfg.vapidKey && cfg.notifyUrl);

  async function enablePush() {
    if (!pushSupported()) throw new Error(isIOS() && !isStandalone() ? "En iPhone primero agrega la app a la pantalla de inicio (Compartir → Agregar a inicio) y ábrela desde el ícono." : "Este navegador no permite notificaciones push.");
    if (!pushReady()) throw new Error("Las notificaciones push aún no están configuradas (falta la clave web push o la dirección del Worker en config.js).");
    const perm = await Notification.requestPermission();
    if (perm !== "granted") throw new Error(perm === "denied" ? "Bloqueaste las notificaciones. Actívalas en el candado de la barra de direcciones → Notificaciones → Permitir." : "No diste permiso para notificaciones.");
    const reg = swReg || (await navigator.serviceWorker.ready);
    const token = await root.firebase.messaging().getToken({ vapidKey: cfg.vapidKey, serviceWorkerRegistration: reg });
    if (!token) throw new Error("Firebase no entregó el token de notificaciones.");
    const ref = db.collection("devices").doc(me().uid);
    await db.runTransaction(async (tx) => {
      const d = await tx.get(ref);
      const list = (d.exists && Array.isArray(d.data().tokens) ? d.data().tokens : []).filter((t) => t && t.token !== token);
      list.unshift({ token: token, label: deviceLabel(), addedAt: Date.now() });
      tx.set(ref, { tokens: list.slice(0, 10) });
    });
    try { localStorage.setItem(TOKEN_KEY, token); } catch (e) { /* sin almacenamiento */ }
    return token;
  }
  const thisToken = () => { try { return localStorage.getItem(TOKEN_KEY) || ""; } catch (e) { return ""; } };
  function watchDevices(fn) {
    return db.collection("devices").doc(me().uid).onSnapshot((d) => fn(d.exists && Array.isArray(d.data().tokens) ? d.data().tokens : []), () => fn([]));
  }
  async function removeDevice(token) {
    const ref = db.collection("devices").doc(me().uid);
    await db.runTransaction(async (tx) => {
      const d = await tx.get(ref);
      const list = d.exists && Array.isArray(d.data().tokens) ? d.data().tokens : [];
      tx.set(ref, { tokens: list.filter((t) => t.token !== token) });
    });
    if (token === thisToken()) {
      await root.firebase.messaging().deleteToken().catch(() => {});
      try { localStorage.removeItem(TOKEN_KEY); } catch (e) { /* sin almacenamiento */ }
    }
  }
  async function removeThisDevice() { const t = thisToken(); if (t && me()) await removeDevice(t); }

  // Pide al Worker que mande el aviso. Si falla, el mensaje igual quedó enviado (lo verá al abrir la app).
  const notify = (body) => callWorker("/notify", body);
  async function callWorker(path, body) {
    if (!cfg.notifyUrl) return { ok: false, reason: "sin-configurar" };
    try {
      const token = await me().getIdToken();
      const r = await fetch(cfg.notifyUrl.replace(/\/+$/, "") + path, { method: "POST", headers: { authorization: "Bearer " + token, "content-type": "application/json" }, body: JSON.stringify(body) });
      const data = await r.json().catch(() => ({}));
      return r.ok ? Object.assign({ ok: true }, data) : { ok: false, reason: data.error || "HTTP " + r.status };
    } catch (e) {
      return { ok: false, reason: "sin conexión con el servidor de avisos" };
    }
  }
  const testPush = () => notify({ test: true });

  // Aviso local (cuando la app está abierta en segundo plano y no hay push configurado).
  async function localNotify(title, body, link, tag) {
    if (!("Notification" in root) || Notification.permission !== "granted") return false;
    const reg = swReg || (await navigator.serviceWorker.getRegistration().catch(() => null));
    if (!reg) return false;
    await reg.showNotification(title, { body: body, icon: "/icono-192.png", badge: "/insignia-72.png", tag: tag, renotify: true, data: { link: link } });
    return true;
  }

  const api = {
    init, config: () => cfg, STATUSES,
    signInGoogle, signUpEmail, signInEmail, resetPassword, signOut, onAuth, me, providerLabel, authMessage,
    watchProfile, saveProfile, createTeam, getTeam, joinTeam, leaveTeam, renameTeam, inviteLink, cleanCode, formatCode, watchMembers,
    startPresence, stopPresence, setStatus, presence, ago, millis,
    sendMessage, watchInbox, watchOutbox, markRead, deleteMessage, react, rulesOutdated,
    createRequest, watchRequests, setRequestStatus, deleteRequest,
    watchLibrary, saveScript, deleteScript, saveCopy,
    publish, unpublish, watchCommunity, watchOrdered,
    pushSupported, pushReady, isIOS, isStandalone, enablePush, watchDevices, removeDevice, thisToken, testPush, localNotify, deviceLabel,
  };
  root.Equipos = api;
})(window);
