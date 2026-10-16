/*
 * Puente Asesor IA ↔ Lanzador · Equipos.
 * Usa la misma sesión que la app (mismo sitio): enviar el prompt a un compañero con aviso push,
 * y ver si te llegaron mensajes nuevos mientras usas el Asesor.
 */
(function () {
  "use strict";
  const LIBS = ["/vendor/firebase-app-compat.js", "/vendor/firebase-auth-compat.js", "/vendor/firebase-firestore-compat.js", "/vendor/firebase-messaging-compat.js", "/motor.js", "/equipos.js"];
  const C = { bg: "#111a16", raised: "#17231d", line: "#263730", ink: "#e2ebe6", mute: "#8fa39a", acc: "#3ddc84", accInk: "#06240f", bad: "#f07a62" };
  let readyP = null, state = { user: null, profile: null, members: [] };

  const load = (src) => new Promise((ok, bad) => { const s = document.createElement("script"); s.src = src; s.onload = ok; s.onerror = () => bad(new Error("No cargó " + src)); document.head.appendChild(s); });
  function ready() {
    readyP = readyP || (async () => {
      await load("/config.js").catch(() => {}); // opcional: en Firebase Hosting puede no existir
      for (const src of LIBS) await load(src);
      const E = window.Equipos;
      await E.init();
      state.user = await new Promise((ok) => { const off = E.onAuth((u) => { off(); ok(u); }); });
      if (state.user) {
        state.profile = await new Promise((ok) => { const off = E.watchProfile(state.user.uid, (p, confirmed) => { if (!confirmed && p) return; off(); ok(p); }, () => ok(null)); });
        if (state.profile && state.profile.team) {
          E.watchMembers(state.profile.team, (m) => { state.members = m; }, () => {});
          watchUnread(E);
        }
      }
      return E;
    })();
    return readyP;
  }

  // ---------- Ventanas (sin depender de los estilos del Asesor) ----------
  function el(tag, css, text) { const e = document.createElement(tag); if (css) e.style.cssText = css; if (text != null) e.textContent = text; return e; }
  function modal(title) {
    const back = el("div", "position:fixed;inset:0;z-index:9999;background:rgba(0,0,0,.6);display:flex;align-items:flex-end;justify-content:center;font-family:system-ui,sans-serif");
    const box = el("div", `width:100%;max-width:440px;max-height:85vh;overflow:auto;background:${C.bg};color:${C.ink};border:1px solid ${C.line};border-radius:16px 16px 0 0;padding:16px;box-sizing:border-box`);
    const head = el("div", "display:flex;justify-content:space-between;align-items:center;margin-bottom:12px");
    head.appendChild(el("strong", "font-size:16px", title));
    const x = el("button", `background:none;border:0;color:${C.mute};font-size:22px;cursor:pointer`, "×");
    x.setAttribute("aria-label", "Cerrar");
    head.appendChild(x); box.appendChild(head); back.appendChild(box); document.body.appendChild(back);
    const close = () => back.remove();
    x.onclick = close; back.onclick = (e) => { if (e.target === back) close(); };
    return { box, close, onClose: (fn) => { x.addEventListener("click", fn); back.addEventListener("click", (e) => e.target === back && fn()); } };
  }
  const btn = (text, primary) => el("button", `display:block;width:100%;margin-top:8px;padding:10px;border-radius:12px;border:1px solid ${primary ? C.acc : C.line};background:${primary ? C.acc : C.raised};color:${primary ? C.accInk : C.ink};font-weight:600;cursor:pointer`, text);

  function askLogin(reason) {
    const m = modal("Enviar a tu equipo");
    m.box.appendChild(el("p", `color:${C.mute};font-size:14px;margin:0 0 8px`, reason));
    const go = btn("Abrir Lanzador · Equipos", true);
    go.onclick = () => { location.href = "/"; };
    m.box.appendChild(go);
  }
  function pickMember(E, prompt) {
    return new Promise((resolve) => {
      const others = state.members.filter((p) => p.uid !== state.user.uid);
      const m = modal("¿A quién le envías el prompt?");
      m.onClose(() => resolve(null));
      if (!others.length) m.box.appendChild(el("p", `color:${C.mute};font-size:14px`, "Aún no hay más personas en tu equipo. Invítalas desde la app."));
      const now = Date.now();
      others.forEach((p) => {
        const pr = E.presence(p, now);
        const row = el("button", `display:flex;gap:10px;align-items:center;width:100%;text-align:left;padding:10px;margin-bottom:6px;border-radius:12px;border:1px solid ${C.line};background:${C.raised};color:${C.ink};cursor:pointer`);
        const dot = el("span", `width:10px;height:10px;border-radius:50%;flex:none;background:${pr.online ? (p.status === "ocupado" ? C.bad : p.status === "ausente" ? "#f0b44c" : C.acc) : "#5d706a"}`);
        const txt = el("span", "min-width:0");
        txt.appendChild(el("span", "display:block;font-weight:600", p.name));
        txt.appendChild(el("span", `display:block;font-size:12px;color:${C.mute}`, pr.label));
        row.appendChild(dot); row.appendChild(txt);
        row.onclick = async () => {
          row.disabled = true;
          try {
            const r = await E.sendMessage(state.profile, p.uid, { kind: "prompt", text: "", prompt: prompt });
            m.close();
            const first = p.name.split(" ")[0];
            resolve(r.pushed && r.pushed.ok && r.pushed.sent ? "Enviado a " + first + ": le llegó la notificación." : r.pushed && r.pushed.ok ? "Enviado a " + first + ". Aún no activa notificaciones: lo verá al abrir la app." : "Enviado a " + first + ".");
          } catch (e) { m.close(); resolve("No se envió: " + (e.code === "permission-denied" ? "esa persona ya no está en tu equipo." : e.message)); }
        };
        m.box.appendChild(row);
      });
    });
  }

  async function enviar(prompt) {
    let E;
    try { E = await ready(); } catch (e) { return "No se pudo conectar con Lanzador · Equipos: " + e.message; }
    if (!state.user) { askLogin("Inicia sesión en Lanzador · Equipos (con la misma cuenta) y vuelve aquí."); return "Inicia sesión para enviar."; }
    if (!state.profile || !state.profile.team) { askLogin("Primero únete a un equipo o crea uno en Lanzador · Equipos."); return "Únete a un equipo para enviar."; }
    return (await pickMember(E, prompt)) || "Envío cancelado.";
  }

  // ---------- Mensajes nuevos mientras usas el Asesor ----------
  function watchUnread(E) {
    const pill = el("a", `position:fixed;right:12px;top:calc(12px + env(safe-area-inset-top, 0px));z-index:9998;display:none;align-items:center;gap:8px;padding:8px 12px;border-radius:999px;background:${C.acc};color:${C.accInk};font:600 14px system-ui,sans-serif;text-decoration:none;box-shadow:0 6px 20px rgba(0,0,0,.4)`);
    pill.href = "/";
    document.body.appendChild(pill);
    let first = true;
    E.watchInbox(state.user.uid, (all, added) => {
      const n = all.filter((m) => !m.read).length;
      // Siempre visible para volver al Lanzador; muestra los mensajes nuevos si hay.
      pill.textContent = n ? "← Equipo · " + n + (n === 1 ? " nuevo" : " nuevos") : "← Equipo";
      pill.style.display = "inline-flex";
      pill.style.opacity = n ? "1" : ".85";
      if (!first && added.some((m) => !m.read)) { pill.animate && pill.animate([{ transform: "scale(1)" }, { transform: "scale(1.12)" }, { transform: "scale(1)" }], { duration: 400, iterations: 2 }); if (navigator.vibrate) navigator.vibrate(80); }
      first = false;
    }, () => {});
  }

  window.AsesorPuente = { enviar: enviar };
  window.dispatchEvent(new Event("asesor-puente"));
  // Conecta en segundo plano para mostrar los mensajes nuevos del equipo.
  ready().catch(() => {});
})();
