/*
 * Interfaz de Lanzador · Equipos (React 18 + htm, sin compilación).
 * Pantallas: Iniciar sesión → Tu perfil → Equipo (crear / unirse) → App (Actividad, Chats, Equipo, Scripts).
 */
(function () {
  "use strict";
  const { useState, useEffect, useMemo, useRef, useCallback } = React;
  const html = htm.bind(React.createElement);
  const G = window.GestorEngine, E = window.Equipos;
  const L = window.LucideReact || window.lucideReact || {};
  if (window.qrcode && window.qrcode.stringToBytesFuncs && window.qrcode.stringToBytesFuncs["UTF-8"]) window.qrcode.stringToBytes = window.qrcode.stringToBytesFuncs["UTF-8"];

  // ---------- Utilidades de interfaz ----------
  const Icon = ({ name, size = 18, className = "" }) => {
    const C = L[name];
    return C ? html`<${C} size=${size} className=${className} aria-hidden="true" />` : html`<span className=${"inline-block " + className} style=${{ width: size, height: size }}></span>`;
  };
  const cx = (...a) => a.filter(Boolean).join(" ");
  const hue = (s) => { let h = 0; for (const c of String(s)) h = (h * 31 + c.charCodeAt(0)) % 360; return h; };
  const initials = (n) => String(n || "?").trim().split(/\s+/).slice(0, 2).map((w) => w[0]).join("").toUpperCase() || "?";
  const timeLabel = (ms) => {
    if (!ms) return "";
    const d = new Date(ms), now = new Date();
    const hm = d.toLocaleTimeString("es-CO", { hour: "numeric", minute: "2-digit" });
    if (d.toDateString() === now.toDateString()) return hm;
    const y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === y.toDateString()) return "Ayer " + hm;
    return d.toLocaleDateString("es-CO", { day: "numeric", month: "short" }) + " " + hm;
  };
  const DOT = { disponible: "bg-good", ocupado: "bg-bad", ausente: "bg-warn", desconectado: "bg-faint" };

  async function copyText(text) {
    try { await navigator.clipboard.writeText(text); return true; } catch (e) {
      const ta = document.createElement("textarea");
      ta.value = text; ta.style.position = "fixed"; ta.style.opacity = "0"; document.body.appendChild(ta); ta.select();
      const ok = document.execCommand("copy"); ta.remove(); return ok;
    }
  }
  function download(name, bytes) {
    const url = URL.createObjectURL(new Blob([bytes], { type: "application/octet-stream" }));
    const a = document.createElement("a"); a.href = url; a.download = name; document.body.appendChild(a); a.click(); a.remove();
    setTimeout(() => URL.revokeObjectURL(url), 4000);
  }
  // Compartir el archivo con el menú del sistema (Bluetooth, WhatsApp, Gmail, Drive…).
  // Android solo deja compartir ciertos tipos: si .ps1 no está permitido, se manda como .ps1.txt.
  async function shareFile(s) {
    if (!navigator.canShare || !navigator.share) return { ok: false, reason: "unsupported" };
    const bytes = G.fileBytes(s), name = G.fileName(s);
    const tries = [new File([bytes], name, { type: "text/plain" }), new File([bytes], name + ".txt", { type: "text/plain" })];
    for (const f of tries) {
      let can = false;
      try { can = navigator.canShare({ files: [f] }); } catch (e) { can = false; }
      if (!can) continue;
      try { await navigator.share({ files: [f], title: s.name }); return { ok: true, renamed: f.name !== name, name: f.name }; }
      catch (e) { return { ok: false, reason: e && e.name === "AbortError" ? "cancel" : "error" }; }
    }
    return { ok: false, reason: "unsupported" };
  }
  function qrSvg(text) {
    try {
      const q = window.qrcode(0, "L"); q.addData(text, "Byte"); q.make();
      return q.createSvgTag({ cellSize: 4, margin: 2, scalable: true });
    } catch (e) { return ""; }
  }
  // Sonido corto de aviso (Web Audio; se habilita con el primer toque en la app).
  let audio = null;
  const unlockAudio = () => { try { audio = audio || new (window.AudioContext || window.webkitAudioContext)(); if (audio.state === "suspended") audio.resume(); } catch (e) { audio = null; } };
  function ding() {
    if (!audio) return;
    const t = audio.currentTime;
    [880, 1320].forEach((f, i) => {
      const o = audio.createOscillator(), g = audio.createGain();
      o.frequency.value = f; o.type = "sine";
      g.gain.setValueAtTime(0.0001, t + i * 0.12); g.gain.exponentialRampToValueAtTime(0.18, t + i * 0.12 + 0.02); g.gain.exponentialRampToValueAtTime(0.0001, t + i * 0.12 + 0.25);
      o.connect(g).connect(audio.destination); o.start(t + i * 0.12); o.stop(t + i * 0.12 + 0.3);
    });
  }
  function useNow(ms) {
    const [now, setNow] = useState(Date.now());
    useEffect(() => { const t = setInterval(() => setNow(Date.now()), ms); return () => clearInterval(t); }, [ms]);
    return now;
  }

  // ---------- Piezas pequeñas ----------
  const Btn = ({ kind = "plain", className = "", children, ...p }) => html`<button type="button" ...${p} className=${cx(
    "inline-flex items-center justify-center gap-2 rounded-xl px-3 py-2 text-sm font-medium transition disabled:opacity-50 disabled:cursor-not-allowed focus:outline-none focus-visible:ring-2 focus-visible:ring-acc",
    kind === "primary" ? "bg-acc text-acc-ink hover:brightness-110" : kind === "danger" ? "bg-bad/15 text-bad hover:bg-bad/25" : kind === "ghost" ? "text-mute hover:text-ink hover:bg-raised" : "bg-raised text-ink border border-line hover:border-faint",
    className)}>${children}</button>`;
  const Field = ({ label, hint, children }) => html`<label className="block space-y-1"><span className="text-xs font-medium text-mute">${label}</span>${children}${hint && html`<span className="block text-xs text-faint">${hint}</span>`}</label>`;
  const inputCls = "w-full rounded-xl bg-canvas border border-line px-3 py-2 text-sm text-ink placeholder:text-faint focus:outline-none focus:border-acc";
  const Avatar = ({ person, size = 40, status }) => {
    const n = (person && person.name) || "?";
    return html`<span className="relative inline-block shrink-0" style=${{ width: size, height: size }}>
      ${person && person.photoURL
        ? html`<img src=${person.photoURL} alt="" referrerPolicy="no-referrer" className="w-full h-full rounded-full object-cover" />`
        : html`<span className="w-full h-full rounded-full grid place-items-center font-semibold text-canvas" style=${{ background: `hsl(${hue(person && person.uid || n)} 55% 62%)`, fontSize: size * 0.38 }}>${initials(n)}</span>`}
      ${status && html`<span title=${status.label} className=${cx("absolute -bottom-0.5 -right-0.5 rounded-full ring-2 ring-panel", DOT[status.key] || "bg-faint")} style=${{ width: size * 0.32, height: size * 0.32 }}></span>`}
    </span>`;
  };
  const LangBadge = ({ lang }) => html`<span className="shrink-0 whitespace-nowrap text-[11px] font-mono px-1.5 py-0.5 rounded-md bg-canvas border border-line text-mute">${(G.LANGS[lang] || G.LANGS.pwsh).short}</span>`;
  const Empty = ({ icon, title, children }) => html`<div className="text-center py-10 px-6 text-mute space-y-2"><${Icon} name=${icon} size=${32} className="mx-auto text-faint" /><p className="font-medium text-ink">${title}</p><div className="text-sm">${children}</div></div>`;
  const Spinner = ({ label }) => html`<div className="min-h-screen grid place-items-center text-mute"><div className="flex items-center gap-2"><${Icon} name="Loader2" className="animate-spin" />${label || "Cargando…"}</div></div>`;

  function Sheet({ title, onClose, children, wide }) {
    useEffect(() => { const k = (e) => e.key === "Escape" && onClose(); window.addEventListener("keydown", k); return () => window.removeEventListener("keydown", k); }, [onClose]);
    return html`<div className="fixed inset-0 z-40 flex items-end sm:items-center justify-center bg-black/60" onClick=${(e) => e.target === e.currentTarget && onClose()}>
      <div role="dialog" aria-modal="true" aria-label=${title} className=${cx("w-full bg-panel border border-line rounded-t-2xl sm:rounded-2xl max-h-[92vh] flex flex-col motion-safe:animate-sube", wide ? "sm:max-w-2xl" : "sm:max-w-md")}>
        <div className="flex items-center justify-between px-4 py-3 border-b border-line"><h2 className="font-semibold">${title}</h2><${Btn} kind="ghost" onClick=${onClose} aria-label="Cerrar"><${Icon} name="X" /><//></div>
        <div className="overflow-y-auto p-4 space-y-3">${children}</div>
      </div>
    </div>`;
  }
  function Screen({ title, subtitle, onBack, right, children, footer, bodyRef, onScroll }) {
    return html`<div className="fixed inset-0 z-30 bg-canvas flex flex-col motion-safe:animate-pasa">
      <header className="flex items-center gap-2 px-2 py-2 border-b border-line bg-panel">
        <${Btn} kind="ghost" onClick=${onBack} aria-label="Volver"><${Icon} name="ChevronLeft" /><//>
        <div className="min-w-0 flex-1">${typeof title === "string" ? html`<h2 className="font-semibold truncate">${title}</h2>` : title}${subtitle && html`<p className="text-xs text-mute truncate">${subtitle}</p>`}</div>
        ${right}
      </header>
      <div ref=${bodyRef} onScroll=${onScroll} className="flex-1 overflow-y-auto">${children}</div>
      ${footer}
    </div>`;
  }

  // ---------- Inicio de sesión ----------
  function Login({ inviteTeam }) {
    const [mode, setMode] = useState("entrar");
    const [f, setF] = useState({ name: "", email: "", password: "" });
    const [busy, setBusy] = useState(false);
    const [msg, setMsg] = useState(null);
    const set = (k) => (e) => setF(Object.assign({}, f, { [k]: e.target.value }));
    const run = async (fn) => { setBusy(true); setMsg(null); try { await fn(); } catch (e) { setMsg({ bad: true, text: E.authMessage(e) }); } finally { setBusy(false); } };
    const submit = (e) => {
      e.preventDefault();
      if (mode === "crear") run(() => { if (!f.name.trim()) throw { message: "Escribe tu nombre: así te verá tu equipo." }; return E.signUpEmail(f.name, f.email, f.password); });
      else if (mode === "olvide") run(async () => { await E.resetPassword(f.email); setMsg({ text: "Te enviamos un correo para crear una contraseña nueva. Revisa también Spam." }); });
      else run(() => E.signInEmail(f.email, f.password));
    };
    return html`<main className="min-h-screen grid place-items-center p-4">
      <div className="w-full max-w-sm space-y-5">
        <div className="text-center space-y-2">
          <img src="/icono-192.png" alt="" className="w-16 h-16 mx-auto rounded-2xl" />
          <h1 className="text-2xl font-semibold">Lanzador · Equipos</h1>
          <p className="text-sm text-mute">Scripts de soporte con tu equipo: chat, pedidos y avisos al celular.</p>
          ${inviteTeam && html`<p className="text-sm text-acc">Te invitaron a un equipo. Inicia sesión para unirte.</p>`}
        </div>
        <div className="bg-panel border border-line rounded-2xl p-4 space-y-4">
          <${Btn} kind="primary" className="w-full py-3" disabled=${busy} onClick=${() => run(E.signInGoogle)}>
            <svg width="18" height="18" viewBox="0 0 48 48" aria-hidden="true"><path fill="#06240f" d="M44.5 20H24v8.5h11.8C34.7 33.9 30.1 37 24 37c-7.2 0-13-5.8-13-13s5.8-13 13-13c3.1 0 5.9 1.1 8.1 2.9l6.4-6.4C34.6 4.1 29.6 2 24 2 11.8 2 2 11.8 2 24s9.8 22 22 22c11 0 21-8 21-22 0-1.3-.2-2.7-.5-4z"/></svg>
            Continuar con Google
          <//>
          <div className="flex items-center gap-3 text-xs text-faint"><span className="flex-1 h-px bg-line"></span>o con tu correo<span className="flex-1 h-px bg-line"></span></div>
          <form onSubmit=${submit} className="space-y-3">
            ${mode === "crear" && html`<${Field} label="Tu nombre (así te verá el equipo)"><input className=${inputCls} value=${f.name} onInput=${set("name")} autoComplete="name" maxLength="60" required /><//>`}
            <${Field} label="Correo"><input className=${inputCls} type="email" value=${f.email} onInput=${set("email")} autoComplete="email" required /><//>
            ${mode !== "olvide" && html`<${Field} label="Contraseña" hint=${mode === "crear" ? "Mínimo 6 caracteres." : null}><input className=${inputCls} type="password" value=${f.password} onInput=${set("password")} autoComplete=${mode === "crear" ? "new-password" : "current-password"} minLength="6" required /><//>`}
            <${Btn} kind="plain" className="w-full" disabled=${busy} type="submit">
              ${busy ? html`<${Icon} name="Loader2" className="animate-spin" />` : html`<${Icon} name=${mode === "crear" ? "UserPlus" : mode === "olvide" ? "Mail" : "LogIn"} />`}
              ${mode === "crear" ? "Crear cuenta" : mode === "olvide" ? "Enviar correo de recuperación" : "Iniciar sesión"}
            <//>
          </form>
          ${msg && html`<p role="alert" className=${cx("text-sm", msg.bad ? "text-bad" : "text-good")}>${msg.text}</p>`}
          <div className="flex justify-between text-sm">
            ${mode === "entrar"
              ? html`<button type="button" className="text-acc" onClick=${() => setMode("crear")}>Crear cuenta</button><button type="button" className="text-mute" onClick=${() => setMode("olvide")}>¿Olvidaste tu contraseña?</button>`
              : html`<button type="button" className="text-acc" onClick=${() => setMode("entrar")}>Ya tengo cuenta: iniciar sesión</button>`}
          </div>
        </div>
        <p className="text-xs text-faint text-center">Cada persona entra con su propia cuenta. Así el equipo sabe quién envía, quién pide y quién está conectado.</p>
      </div>
    </main>`;
  }

  // ---------- Perfil inicial y equipo ----------
  function Onboarding({ user, profile, inviteCode, onDone }) {
    const [step, setStep] = useState(profile ? "equipo" : "perfil");
    const [name, setName] = useState(() => { let n = ""; try { n = sessionStorage.getItem("equipos.nombre") || ""; } catch (e) { /* nada */ } return (profile && profile.name) || user.displayName || n; });
    const [cargo, setCargo] = useState((profile && profile.cargo) || "");
    const [teamName, setTeamName] = useState("");
    const [code, setCode] = useState(inviteCode || "");
    const [preview, setPreview] = useState(null);
    const [busy, setBusy] = useState(false);
    const [err, setErr] = useState("");
    const run = async (fn) => { setBusy(true); setErr(""); try { await fn(); } catch (e) { setErr(e.message || String(e)); } finally { setBusy(false); } };
    useEffect(() => {
      const c = E.cleanCode(code);
      if (c.length < 10) { setPreview(null); return undefined; }
      let live = true;
      E.getTeam(c).then((t) => live && setPreview(t || false));
      return () => { live = false; };
    }, [code]);

    return html`<main className="min-h-screen grid place-items-center p-4"><div className="w-full max-w-md space-y-4">
      <div className="flex items-center gap-3"><${Avatar} person=${{ name: name || user.email, photoURL: user.photoURL, uid: user.uid }} size=${48} />
        <div className="min-w-0"><p className="font-semibold truncate">${name || "Tu perfil"}</p><p className="text-xs text-mute truncate">${user.email} · con ${E.providerLabel(user)}</p></div>
        <${Btn} kind="ghost" className="ml-auto" onClick=${() => E.signOut()}><${Icon} name="LogOut" />Salir<//>
      </div>
      ${step === "perfil" ? html`<section className="bg-panel border border-line rounded-2xl p-4 space-y-3">
          <h1 className="text-lg font-semibold">¿Cómo te verá tu equipo?</h1>
          <${Field} label="Nombre visible"><input className=${inputCls} value=${name} onInput=${(e) => setName(e.target.value)} maxLength="60" /><//>
          <${Field} label="Cargo o rol (opcional)" hint="Ej.: Soporte técnico"><input className=${inputCls} value=${cargo} onInput=${(e) => setCargo(e.target.value)} maxLength="80" /><//>
          <${Btn} kind="primary" className="w-full" disabled=${busy || !name.trim()} onClick=${() => run(async () => { await E.saveProfile({ name: name, cargo: cargo }); setStep("equipo"); })}>Continuar<//>
        </section>`
      : html`<section className="bg-panel border border-line rounded-2xl p-4 space-y-4">
          <div><h1 className="text-lg font-semibold">Tu equipo</h1><p className="text-sm text-mute">Solo las personas de tu equipo se ven, se escriben y se piden scripts.</p></div>
          <div className="space-y-2">
            <h2 className="text-sm font-medium">Unirme con un código</h2>
            <input className=${cx(inputCls, "font-mono tracking-wider uppercase")} placeholder="XXXX-XXXX-XXXX" value=${code} onInput=${(e) => setCode(e.target.value)} />
            ${preview && html`<p className="text-sm text-good">Equipo encontrado: <b>${preview.name}</b></p>`}
            ${preview === false && html`<p className="text-sm text-bad">No existe un equipo con ese código.</p>`}
            <${Btn} kind="primary" className="w-full" disabled=${busy || !preview} onClick=${() => run(async () => { await E.joinTeam(code); onDone(); })}><${Icon} name="LogIn" />Unirme<//>
          </div>
          <div className="flex items-center gap-3 text-xs text-faint"><span className="flex-1 h-px bg-line"></span>o<span className="flex-1 h-px bg-line"></span></div>
          <div className="space-y-2">
            <h2 className="text-sm font-medium">Crear un equipo nuevo</h2>
            <input className=${inputCls} placeholder="Ej.: Soporte" value=${teamName} onInput=${(e) => setTeamName(e.target.value)} maxLength="60" />
            <${Btn} className="w-full" disabled=${busy || !teamName.trim()} onClick=${() => run(async () => { await E.createTeam(teamName); onDone(); })}><${Icon} name="Users" />Crear y obtener código<//>
          </div>
          ${err && html`<p role="alert" className="text-sm text-bad">${err}</p>`}
        </section>`}
    </div></main>`;
  }

  // ---------- Selectores ----------
  function MemberPicker({ members, meUid, now, title, onPick, onClose }) {
    const others = members.filter((m) => m.uid !== meUid);
    return html`<${Sheet} title=${title || "¿A quién?"} onClose=${onClose}>
      ${others.length ? others.map((m) => { const p = E.presence(m, now); return html`<button key=${m.uid} type="button" onClick=${() => onPick(m)} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-raised text-left">
        <${Avatar} person=${m} status=${p} /><span className="min-w-0"><span className="block font-medium truncate">${m.name}</span><span className="block text-xs text-mute truncate">${p.label}${m.cargo ? " · " + m.cargo : ""}</span></span></button>`; })
      : html`<${Empty} icon="UserPlus" title="Aún estás solo en el equipo">Invita a alguien desde la pestaña Equipo.<//>`}
    <//>`;
  }
  function ScriptPicker({ library, title, onPick, onClose }) {
    const [q, setQ] = useState("");
    const list = useMemo(() => G.search(library, q, {}), [library, q]);
    return html`<${Sheet} title=${title || "Elige un script"} onClose=${onClose}>
      <input className=${inputCls} placeholder="Buscar en mis scripts…" value=${q} onInput=${(e) => setQ(e.target.value)} autoFocus />
      ${list.length ? list.map((s) => html`<button key=${s.id} type="button" onClick=${() => onPick(s)} className="w-full flex items-center gap-3 p-2 rounded-xl hover:bg-raised text-left">
        <${Icon} name="FileCode" className="text-acc shrink-0" /><span className="min-w-0 flex-1"><span className="block font-medium truncate">${s.name}</span><span className="block text-xs text-mute truncate">${s.category}${s.notes ? " · " + s.notes : ""}</span></span><${LangBadge} lang=${s.lang} /></button>`)
      : html`<${Empty} icon="Search" title="Sin resultados">Prueba otra palabra o crea el script en la pestaña Scripts.<//>`}
    <//>`;
  }
  // Pedir un script diciendo qué se necesita, para qué y en qué sistema: así llega el script correcto.
  const SYSTEMS = ["Windows 11", "Windows 10", "Windows Server", "Linux", "No sé"];
  const Chips = ({ legend, options, value, onChange }) => html`<fieldset className="space-y-1.5"><legend className="text-xs font-medium text-mute mb-1.5">${legend}</legend>
    <div className="flex flex-wrap gap-2">${options.map((c) => html`<button key=${c} type="button" aria-pressed=${value === c} onClick=${() => onChange(value === c ? "" : c)} className=${cx("text-xs px-3 py-1.5 min-h-[36px] rounded-full border transition-colors", value === c ? "border-acc text-acc bg-acc/10" : "border-line text-mute hover:text-ink")}>${c}</button>`)}</div></fieldset>`;
  function RequestDialog({ title, intro, cta, onSend, onClose, withCategory }) {
    const [need, setNeed] = useState("");
    const [purpose, setPurpose] = useState("");
    const [system, setSystem] = useState("");
    const [cat, setCat] = useState("");
    const [busy, setBusy] = useState(false);
    const ready = need.trim() && purpose.trim();
    return html`<${Sheet} title=${title} onClose=${onClose}>
      ${intro && html`<p className="text-sm text-mute">${intro}</p>`}
      <${Field} label="¿Qué script necesitas?"><textarea className=${cx(inputCls, "min-h-[64px]")} placeholder="Ej.: uno que limpie la cola de impresión" value=${need} maxLength="200" onInput=${(e) => setNeed(e.target.value)} autoFocus></textarea><//>
      <${Field} label="¿Para qué lo vas a usar?" hint="Con esto te mandan el script correcto y te dicen cómo usarlo."><textarea className=${cx(inputCls, "min-h-[64px]")} placeholder="Ej.: la impresora de la sala 3 no imprime y no quiero reiniciar el PC" value=${purpose} maxLength="300" onInput=${(e) => setPurpose(e.target.value)}></textarea><//>
      <${Chips} legend="¿En qué sistema? (opcional)" options=${SYSTEMS} value=${system} onChange=${setSystem} />
      ${withCategory && html`<${Chips} legend="Tema (opcional)" options=${G.CATEGORIES} value=${cat} onChange=${setCat} />`}
      <${Btn} kind="primary" className="w-full" disabled=${busy || !ready} onClick=${async () => { setBusy(true); try { await onSend({ need: need.trim(), purpose: purpose.trim(), system: system === "No sé" ? "" : system, category: cat }); } finally { setBusy(false); } }}><${Icon} name="Send" />${cta}<//>
      ${need.trim() && !purpose.trim() && html`<p className="text-xs text-faint text-center">Falta contar para qué lo necesitas.</p>`}
    <//>`;
  }
  const Tag = ({ children }) => html`<span className="text-[11px] px-2 py-0.5 rounded-full bg-canvas border border-line text-mute">${children}</span>`;
  // Lo que pidió: qué, para qué y en qué sistema.
  const NeedBlock = ({ text, purpose, system, category }) => html`<div className="space-y-1">
    <p className="font-medium whitespace-pre-wrap break-words">${text}</p>
    ${purpose && html`<p className="text-sm text-mute whitespace-pre-wrap break-words"><span className="text-faint">Para qué: </span>${purpose}</p>`}
    ${(system || category) && html`<div className="flex flex-wrap gap-1.5">${system && html`<${Tag}>${system}<//>`}${category && html`<${Tag}>${category}<//>`}</div>`}
  </div>`;

  // ---------- Compartir ----------
  function ShareSheet({ script: s, onClose, onSendTeam, toast }) {
    const [qr, setQr] = useState("");
    const text = G.shareText(s);
    const wa = G.whatsappUrl(text);
    const canFiles = !!(navigator.canShare && navigator.share);
    const isAndroid = /Android/.test(navigator.userAgent);
    const doShare = async () => {
      const r = await shareFile(s);
      if (r.ok) toast(r.renamed ? "Se envió como «" + r.name + "». Quien lo reciba debe quitarle el .txt del final." : "Listo, archivo compartido.");
      else if (r.reason === "unsupported") toast("Este navegador no puede compartir archivos: usa Descargar y envíalo desde la app de archivos.");
      else if (r.reason === "error") toast("No se pudo abrir el menú Compartir.");
    };
    const Opt = ({ icon, title, sub, onClick, href, disabled }) => {
      const body = html`<${Icon} name=${icon} className="text-acc shrink-0" /><span className="min-w-0 flex-1 text-left"><span className="block font-medium">${title}</span>${sub && html`<span className="block text-xs text-mute">${sub}</span>`}</span>`;
      const cls = cx("w-full flex items-center gap-3 p-3 rounded-xl border border-line bg-canvas", disabled ? "opacity-50 pointer-events-none" : "hover:border-faint");
      return href ? html`<a className=${cls} href=${href} target="_blank" rel="noopener">${body}</a>` : html`<button type="button" className=${cls} onClick=${onClick} disabled=${disabled}>${body}</button>`;
    };
    return html`<${Sheet} title=${"Compartir «" + s.name + "»"} onClose=${onClose}>
      <${Opt} icon="Users" title="Enviar a alguien del equipo" sub="Le llega una notificación y lo guarda con un toque." onClick=${onSendTeam} />
      <${Opt} icon="Bluetooth" title="Bluetooth, WhatsApp, Gmail, Drive…" disabled=${!canFiles}
        sub=${canFiles ? (isAndroid ? "Abre el menú Compartir del celular con el archivo. En Android llega como .ps1.txt: quítale el .txt." : "Abre el menú Compartir del sistema con el archivo.") : "Este navegador no comparte archivos: usa Descargar."} onClick=${doShare} />
      <${Opt} icon="MessageCircle" title="WhatsApp como texto" disabled=${!wa} sub=${wa ? "Envía el código en el mensaje." : "El script es muy largo para un mensaje: comparte el archivo."} href=${wa || undefined} />
      <${Opt} icon="Mail" title="Correo" disabled=${!text} sub="Abre tu app de correo con el código." href=${text ? "mailto:?subject=" + encodeURIComponent("Script: " + s.name) + "&body=" + encodeURIComponent(text) : undefined} />
      <${Opt} icon="Download" title=${"Descargar " + G.fileName(s)} sub="Con su extensión real, listo para el PC." onClick=${() => { download(G.fileName(s), G.fileBytes(s)); toast("Descargado: " + G.fileName(s)); }} />
      <${Opt} icon="Copy" title="Copiar código" onClick=${async () => toast((await copyText(s.code)) ? "Código copiado." : "No se pudo copiar.")} />
      <${Opt} icon="QrCode" title="QR con el código" disabled=${s.code.length > 1800} sub=${s.code.length > 1800 ? "Muy largo para un QR." : "Escanéalo con la cámara del otro equipo."} onClick=${() => setQr(qrSvg(s.code))} />
      ${qr && html`<div className="bg-white rounded-xl p-3 mx-auto max-w-[280px]" dangerouslySetInnerHTML=${{ __html: qr }}></div>`}
    <//>`;
  }

  // ---------- Cómo usar un script (se arma solo con el código) ----------
  function guideFor(s) {
    const code = String(s.code || ""), file = G.fileName(s), rep = G.audit(s);
    const ps = s.lang === "pwsh" || s.lang === "ps5";
    const admin = /#requires\s+-runasadministrator/i.test(code) || rep.checks.some((c) => /administrador/i.test(c.title) && !/^No parece/.test(c.title));
    const help = (re) => { const m = re.exec(code); return m ? m[1].replace(/\s+/g, " ").trim() : ""; };
    const what = s.notes || help(/\.SYNOPSIS\s*\n([\s\S]*?)(?:\n\s*\.[A-Z]+\b|#>)/i) || help(/\.DESCRIPTION\s*\n([\s\S]*?)(?:\n\s*\.[A-Z]+\b|#>)/i);
    const notes = [];
    notes.push(admin ? { icon: "ShieldAlert", t: "Necesita permisos de administrador." } : { icon: "ShieldCheck", t: "No necesita permisos de administrador." });
    if (s.lang === "pwsh") {
      const only7 = G.ps7Only(code);
      notes.push(only7.length ? { icon: "AlertTriangle", t: "Solo corre en PowerShell 7 (usa " + only7.slice(0, 2).join(", ") + "). Si no la tienes: winget install Microsoft.PowerShell" } : { icon: "Info", t: "Hecho para PowerShell 7; también debería correr en Windows PowerShell 5.1." });
    }
    if (/Read-Host|\bset\s+\/p\b|\binput\s*\(|\bread\s+-[rp]/i.test(code)) notes.push({ icon: "MessageSquare", t: "Te hace preguntas mientras corre: lee cada una y responde en la ventana." });
    if (rep.score < 80) notes.push({ icon: "AlertTriangle", t: "La revisión automática le da " + rep.score + "/100: mira la pestaña Revisión antes de usarlo." });
    const steps = [{ t: "Descárgalo: botón Compartir (arriba) → Descargar. Queda en Descargas como " + file + "." }];
    if (ps) {
      steps.push({ t: (s.lang === "pwsh" ? "Abre PowerShell 7 (busca «pwsh» en Inicio)" : "Abre Windows PowerShell (búscalo en Inicio)") + (admin ? ": clic derecho → Ejecutar como administrador." : ".") });
      steps.push({ t: "Entra a la carpeta Descargas:", cmd: "cd $HOME\\Downloads" });
      steps.push({ t: "Quítale la marca de archivo descargado:", cmd: "Unblock-File .\\" + file });
      steps.push({ t: "Ejecútalo (el permiso vale solo para esta vez):", cmd: (s.lang === "pwsh" ? "pwsh" : "powershell") + " -ExecutionPolicy Bypass -File .\\" + file });
    } else if (s.lang === "cmd") {
      steps.push({ t: admin ? "Clic derecho sobre el archivo → Ejecutar como administrador." : "Doble clic sobre el archivo." });
    } else if (s.lang === "python") {
      steps.push({ t: "Abre una terminal" + (admin ? " como administrador" : "") + " en Descargas y ejecútalo (en Windows también sirve «py»):", cmd: "python " + file });
    } else {
      steps.push({ t: "Abre una terminal en la carpeta del archivo y dale permiso de ejecución:", cmd: "chmod +x " + file });
      steps.push({ t: "Ejecútalo" + (admin ? " con sudo" : "") + ":", cmd: (admin ? "sudo " : "") + "./" + file });
    }
    return { what, notes, steps, score: rep.score };
  }
  function GuideTab({ script, onCopy, onAsk, askName, onAudit }) {
    const g = useMemo(() => guideFor(script), [script]);
    return html`<div className="space-y-3">
      ${g.what && html`<section className="bg-panel border border-line rounded-xl p-3 space-y-1"><h3 className="text-xs font-medium text-mute">Qué hace</h3><p className="text-sm whitespace-pre-wrap">${g.what}</p></section>`}
      <section className="bg-panel border border-line rounded-xl p-3 space-y-2"><h3 className="text-xs font-medium text-mute">Antes de empezar</h3>
        ${g.notes.map((n, i) => html`<p key=${i} className="flex items-start gap-2 text-sm"><${Icon} name=${n.icon} size=${16} className=${cx("shrink-0 mt-0.5", /Alert/.test(n.icon) ? "text-warn" : n.icon === "ShieldAlert" ? "text-info" : "text-good")} />${n.t}</p>`)}
        ${g.score < 80 && html`<${Btn} className="text-xs" onClick=${onAudit}><${Icon} name="ListChecks" size=${14} />Ver la revisión<//>`}
      </section>
      <section className="bg-panel border border-line rounded-xl p-3 space-y-2"><h3 className="text-xs font-medium text-mute">Pasos</h3>
        <ol className="space-y-2">${g.steps.map((st, i) => html`<li key=${i} className="flex gap-2 text-sm"><span className="shrink-0 w-6 h-6 rounded-full bg-acc/15 text-acc text-xs font-semibold grid place-items-center">${i + 1}</span>
          <div className="min-w-0 flex-1 space-y-1"><p>${st.t}</p>${st.cmd && html`<div className="flex items-center gap-2"><code className="min-w-0 flex-1 font-mono text-xs bg-canvas border border-line rounded-lg px-2 py-1.5 overflow-x-auto whitespace-nowrap">${st.cmd}</code><${Btn} kind="ghost" className="shrink-0 p-2" onClick=${() => onCopy(st.cmd)} aria-label=${"Copiar " + st.cmd}><${Icon} name="Copy" size=${16} /><//></div>`}</div></li>`)}</ol>
      </section>
      ${onAsk && html`<${Btn} kind="primary" className="w-full" onClick=${onAsk}><${Icon} name="HelpCircle" />${"¿Dudas? Pregúntale a " + askName}<//>`}
    </div>`;
  }

  // ---------- Ver / editar script ----------
  function ScriptScreen({ script, editable, fromName, onBack, onSave, onDelete, onSaveCopy, onShare, onPublish, published, initialTab, onAsk, onCopy }) {
    const [s, setS] = useState(script);
    const [tab, setTab] = useState(initialTab || (editable && !script.code.trim() ? "datos" : "codigo"));
    const [dirty, setDirty] = useState(false);
    const rep = useMemo(() => G.audit(s), [s]);
    const set = (k, v) => { setS(Object.assign({}, s, { [k]: v })); setDirty(true); };
    const tabs = [["codigo", "Código"], ["uso", "Cómo usarlo"], ["auditoria", "Revisión " + rep.score]].concat(editable ? [["datos", "Datos"]] : []);
    const color = rep.score >= 80 ? "text-good" : rep.score >= 50 ? "text-warn" : "text-bad";
    return html`<${Screen} onBack=${onBack} title=${s.name || "Script nuevo"} subtitle=${fromName ? "De " + fromName : (G.LANGS[s.lang] || {}).label}
      right=${html`<${Btn} kind="ghost" onClick=${() => onShare(s)} aria-label="Compartir"><${Icon} name="Share2" /><//>`}
      footer=${html`<div className="border-t border-line bg-panel p-3 flex gap-2 flex-wrap">
        ${editable ? html`
          <${Btn} kind="primary" className="flex-1" disabled=${!dirty} onClick=${async () => { await onSave(s); setDirty(false); }}><${Icon} name="Save" />Guardar<//>
          <${Btn} onClick=${() => onPublish(s)}><${Icon} name=${published ? "Eye" : "Megaphone"} />${published ? "Quitar del equipo" : "Publicar al equipo"}<//>
          <${Btn} kind="danger" onClick=${() => onDelete(s)} aria-label="Borrar"><${Icon} name="Trash2" /><//>`
        : html`<${Btn} kind="primary" className="flex-1" onClick=${() => onSaveCopy(s)}><${Icon} name="Save" />Guardar en mis scripts<//>`}
      </div>`}>
      <div className="max-w-3xl mx-auto p-3 space-y-3">
        <div className="flex gap-1 bg-panel border border-line rounded-xl p-1">${tabs.map(([k, l]) => html`<button key=${k} type="button" aria-pressed=${tab === k} onClick=${() => setTab(k)} className=${cx("flex-1 text-sm rounded-lg py-1.5 px-1 whitespace-nowrap min-h-[36px] transition-colors", tab === k ? "bg-raised text-ink" : "text-mute")}>${l}</button>`)}</div>
        ${s.notes && tab !== "datos" && tab !== "uso" && html`<p className="text-sm text-mute bg-panel border border-line rounded-xl p-3">${s.notes}</p>`}
        ${tab === "uso" && html`<${GuideTab} script=${s} onCopy=${onCopy} onAsk=${onAsk} askName=${fromName} onAudit=${() => setTab("auditoria")} />`}
        ${tab === "codigo" && (editable
          ? html`<textarea spellCheck="false" className=${cx(inputCls, "font-mono text-xs min-h-[55vh] leading-relaxed")} value=${s.code} onInput=${(e) => set("code", e.target.value)}></textarea>`
          : html`<pre className="font-mono text-xs bg-panel border border-line rounded-xl p-3 overflow-x-auto whitespace-pre">${s.code}</pre>`)}
        ${tab === "auditoria" && html`<div className="space-y-2">
          <p className=${cx("text-sm font-medium", color)}>Puntaje ${rep.score}/100 · revisa siempre el código antes de ejecutarlo.</p>
          ${rep.checks.map((c, i) => html`<div key=${i} className="bg-panel border border-line rounded-xl p-3 space-y-1">
            <p className="flex items-center gap-2 text-sm font-medium"><${Icon} name=${c.status === "ok" ? "Check" : c.status === "info" ? "Info" : "AlertTriangle"} className=${c.status === "ok" ? "text-good" : c.status === "warn" ? "text-warn" : c.status === "info" ? "text-info" : "text-bad"} />${c.title}</p>
            <p className="text-xs text-mute">${c.detail}</p>
            ${c.fix && editable && html`<${Btn} className="text-xs" onClick=${() => set("code", G.applyFix(s.code, c.fix.id))}><${Icon} name="Wand2" size=${14} />${c.fix.label}<//>`}
          </div>`)}
          <div className="flex flex-wrap gap-2">${G.searchLinks(s).map((l) => html`<a key=${l.url} href=${l.url} target="_blank" rel="noopener" className="text-xs text-acc underline">${l.label}</a>`)}</div>
        </div>`}
        ${tab === "datos" && html`<div className="space-y-3">
          <${Field} label="Nombre"><input className=${inputCls} value=${s.name} maxLength="120" onInput=${(e) => set("name", e.target.value)} placeholder="Ej.: Reiniciar cola de impresión" /><//>
          <div className="grid grid-cols-2 gap-3">
            <${Field} label="Lenguaje"><select className=${inputCls} value=${s.lang} onChange=${(e) => set("lang", e.target.value)}>${Object.values(G.LANGS).map((l) => html`<option key=${l.id} value=${l.id}>${l.label}</option>`)}</select><//>
            <${Field} label="Categoría"><select className=${inputCls} value=${s.category} onChange=${(e) => set("category", e.target.value)}>${G.CATEGORIES.map((c) => html`<option key=${c}>${c}</option>`)}</select><//>
          </div>
          <${Field} label="Etiquetas" hint="Separadas por coma."><input className=${inputCls} value=${s.tags.join(", ")} onInput=${(e) => set("tags", e.target.value.split(",").map((t) => t.trim()).filter(Boolean))} /><//>
          <${Field} label="¿Qué problema resuelve?"><textarea className=${cx(inputCls, "min-h-[80px]")} maxLength="4000" value=${s.notes} onInput=${(e) => set("notes", e.target.value)}></textarea><//>
        </div>`}
      </div>
    <//>`;
  }

  // ---------- Chat ----------
  const KIND_ICON = { script: "FileCode", pedido: "HelpCircle", prompt: "Sparkles", texto: "MessageCircle" };
  const firstName = (n) => String(n || "").split(" ")[0] || "esa persona";
  const preview = (m) => (m.kind === "script" && m.script ? m.script.name : m.kind === "prompt" && m.prompt ? m.prompt.title || "Prompt" : String(m.text || ""));
  const toReply = (m) => ({ id: m.id, kind: m.kind, text: String(m.text || "").slice(0, 140), name: m.kind === "script" && m.script ? m.script.name : m.kind === "prompt" && m.prompt ? m.prompt.title : "" });
  const REACTION = { sirvio: { icon: "ThumbsUp", mine: "Me sirvió", other: (n) => "A " + n + " le sirvió", cls: "text-good" }, "no-sirvio": { icon: "ThumbsDown", mine: "No me funcionó", other: (n) => "A " + n + " no le funcionó", cls: "text-bad" } };
  function ChatScreen({ other, profile, meUid, now, msgs, library, onBack, onOpenScript, actions }) {
    const [text, setText] = useState("");
    const [sending, setSending] = useState(false);
    const [replyTo, setReplyTo] = useState(null);
    const [sel, setSel] = useState(null);
    const [flash, setFlash] = useState(null);
    const [newBelow, setNewBelow] = useState(false);
    const bodyRef = useRef(null), inputRef = useRef(null), atBottom = useRef(true), lastCount = useRef(0);
    const seen = useRef(new Set(msgs.map((m) => m.id)));   // los que ya estaban al abrir no se animan
    const p = E.presence(other, now), otherFirst = firstName(other.name);
    const byId = useMemo(() => new Map(msgs.map((m) => [m.id, m])), [msgs]);
    useEffect(() => { E.markRead(msgs).catch(() => {}); }, [msgs]);
    const toBottom = (smooth) => {
      const el = bodyRef.current; if (!el) return;
      el.scrollTo({ top: el.scrollHeight, behavior: smooth && !matchMedia("(prefers-reduced-motion: reduce)").matches ? "smooth" : "auto" });
      atBottom.current = true; setNewBelow(false);
    };
    // Al llegar un mensaje: si estás abajo (o lo mandaste tú) baja solo; si estás leyendo arriba, aparece «Mensajes nuevos».
    useEffect(() => {
      const n = msgs.length, last = msgs[n - 1];
      if (n > lastCount.current) { if (!lastCount.current || atBottom.current || (last && last.from === meUid)) toBottom(lastCount.current > 0); else setNewBelow(true); }
      lastCount.current = n;
    }, [msgs.length]);
    const onScroll = () => { const el = bodyRef.current; atBottom.current = el.scrollHeight - el.scrollTop - el.clientHeight < 120; if (atBottom.current && newBelow) setNewBelow(false); };
    const answered = useMemo(() => new Set(msgs.filter((m) => m.from === meUid && m.requestId).map((m) => m.requestId)), [msgs, meUid]);
    const saved = useMemo(() => new Set(library.filter((s) => s.origin).map((s) => s.origin.authorId + "/" + s.origin.scriptId)), [library]);
    const send = async (payload) => { setSending(true); try { await actions.send(other, payload); } catch (e) { /* ya se avisó */ } finally { setSending(false); } };
    const fit = () => { const t = inputRef.current; if (t) { t.style.height = "auto"; t.style.height = Math.min(t.scrollHeight, 128) + "px"; } };
    const startReply = (m, prefill) => {
      setReplyTo(m); setSel(null);
      if (prefill != null) setText(prefill);
      setTimeout(() => { const t = inputRef.current; if (t) { t.focus(); t.setSelectionRange(t.value.length, t.value.length); fit(); } }, 30);
    };
    const sendText = () => {
      const t = text.trim(); if (!t) return;
      const r = replyTo; setText(""); setReplyTo(null); setTimeout(fit, 0);
      send({ kind: "texto", text: t, replyTo: r ? toReply(r) : null });
    };
    const jumpTo = (id) => {
      const el = document.getElementById("msg-" + id);
      if (!el) { actions.toast("Ese mensaje ya no está en el chat."); return; }
      el.scrollIntoView({ block: "center", behavior: matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" });
      setFlash(id); setTimeout(() => setFlash((f) => (f === id ? null : f)), 1400);
    };
    const quoteName = (r) => { const q = byId.get(r.id); return q ? (q.from === meUid ? "Tú" : otherFirst) : "Mensaje"; };
    const react = (m, r) => {
      const next = m.reaction === r ? "" : r;
      actions.react(m, next).then(() => { if (next === "no-sirvio") startReply(m, "No me funcionó: "); }, () => {});
    };

    const bubble = (m, grouped) => {
      const mine = m.from === meUid, fresh = !seen.current.has(m.id);
      let body;
      if (m.kind === "script" && m.script) {
        const s = G.sanitizeScript(m.script);
        const isSaved = saved.has(m.from + "/" + m.script.id), rx = REACTION[m.reaction];
        body = html`${m.text && html`<p className="whitespace-pre-wrap">${m.text}</p>`}
          <div className="rounded-xl bg-canvas border border-line p-2 space-y-1">
            <p className="flex items-center gap-2 font-medium"><${Icon} name="FileCode" className="text-acc shrink-0" /><span className="min-w-0 break-words">${s.name}</span><${LangBadge} lang=${s.lang} /></p>
            ${s.notes && html`<p className="text-xs text-mute line-clamp-2">${s.notes}</p>`}
            <div className="flex gap-2 pt-1 flex-wrap">
              <${Btn} className="text-xs py-1" onClick=${() => onOpenScript(s, mine ? null : other)}><${Icon} name="Eye" size=${14} />Ver<//>
              ${!mine && html`<${Btn} kind=${isSaved ? "ghost" : "primary"} className="text-xs py-1" disabled=${isSaved} onClick=${() => actions.saveCopy(s, m.from)}><${Icon} name=${isSaved ? "Check" : "Save"} size=${14} />${isSaved ? "Guardado" : "Guardar"}<//>
                <${Btn} className="text-xs py-1" onClick=${() => onOpenScript(s, other, { tab: "uso", ask: () => startReply(m, "¿Cómo uso «" + s.name + "»? ") })}><${Icon} name="HelpCircle" size=${14} />¿Cómo lo uso?<//>`}
            </div>
          </div>
          ${!mine ? html`<div className="flex gap-2 flex-wrap" role="group" aria-label="¿Te sirvió?">${["sirvio", "no-sirvio"].map((r) => html`<button key=${r} type="button" aria-pressed=${m.reaction === r} onClick=${() => react(m, r)}
              className=${cx("inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 min-h-[32px] text-xs transition-colors", m.reaction === r ? (r === "sirvio" ? "border-good text-good bg-good/10" : "border-bad text-bad bg-bad/10") : "border-line text-mute hover:text-ink")}><${Icon} name=${REACTION[r].icon} size=${14} />${REACTION[r].mine}</button>`)}</div>`
            : rx && html`<p className=${cx("flex items-center gap-1.5 text-xs font-medium", rx.cls)}><${Icon} name=${rx.icon} size=${14} />${rx.other(otherFirst)}</p>`}`;
      } else if (m.kind === "pedido") {
        body = html`<p className="flex items-center gap-1 text-xs font-medium text-warn"><${Icon} name="HelpCircle" size=${14} />${mine ? "Pediste un script" : "Te pide un script"}</p>
          <${NeedBlock} text=${m.text} purpose=${m.purpose} system=${m.system} />
          ${!mine && (answered.has(m.id)
            ? html`<p className="text-xs text-good flex items-center gap-1"><${Icon} name="Check" size=${14} />Ya respondiste</p>`
            : html`<${Btn} kind="primary" className="text-xs py-1" onClick=${() => actions.pickScript((s) => send({ kind: "script", text: "Para tu pedido: «" + m.text.slice(0, 80) + "»", script: s, requestId: m.id, replyTo: toReply(m) }))}><${Icon} name="Send" size=${14} />Enviar un script<//>`)}`;
      } else if (m.kind === "prompt" && m.prompt) {
        body = html`<p className="flex items-center gap-1 text-xs font-medium text-info"><${Icon} name="Sparkles" size=${14} />Prompt del Asesor IA</p>
          <p className="font-medium">${m.prompt.title || "Prompt"}</p>
          <p className="text-xs text-mute line-clamp-4 whitespace-pre-wrap">${m.prompt.text}</p>
          <div className="flex gap-2"><${Btn} className="text-xs py-1" onClick=${() => actions.copy(m.prompt.text)}><${Icon} name="Copy" size=${14} />Copiar<//>
          <${Btn} className="text-xs py-1" onClick=${() => actions.openInAdvisor(m.prompt)}><${Icon} name="Wand2" size=${14} />Abrir en el Asesor<//></div>`;
      } else body = html`<p className="whitespace-pre-wrap break-words">${m.text}</p>`;
      const quote = m.replyTo && html`<button type="button" onClick=${() => jumpTo(m.replyTo.id)} className="block w-full max-w-full overflow-hidden text-left rounded-lg border-l-2 border-acc bg-canvas/70 px-2 py-1 text-xs">
        <span className="block font-medium text-acc">${quoteName(m.replyTo)}</span><span className="block text-mute truncate">${m.replyTo.name || m.replyTo.text}</span></button>`;
      const open = sel === m.id;
      return html`<div key=${m.id} id=${"msg-" + m.id} className=${cx("flex items-end gap-1", mine ? "justify-end" : "justify-start", grouped ? "mt-0.5" : "mt-2", fresh && "motion-safe:animate-entra")}>
        ${mine && html`<${Btn} kind="ghost" className="p-1.5 shrink-0 opacity-60" aria-label="Opciones del mensaje" aria-expanded=${open} onClick=${() => setSel(open ? null : m.id)}><${Icon} name="MoreVertical" size=${16} /><//>`}
        <div className=${cx("max-w-[85%] min-w-0 space-y-1", mine && "flex flex-col items-end")}>
          <div onClick=${(e) => { if (!e.target.closest("button,a")) setSel(open ? null : m.id); }} className=${cx("max-w-full min-w-0 rounded-2xl px-3 py-2 text-sm space-y-2 transition-shadow", mine ? "bg-acc/15 border border-acc/30" : "bg-panel border border-line", mine ? (grouped ? "rounded-tr-md" : "rounded-br-md") : (grouped ? "rounded-tl-md" : "rounded-bl-md"), flash === m.id && "ring-2 ring-acc")}>
            ${quote}${body}
            <p className=${cx("text-[10px] text-faint flex items-center gap-1", mine && "justify-end")}>${timeLabel(m.at)}${mine && html`<${Icon} name=${m.read ? "CheckCheck" : "Check"} size=${12} className=${m.read ? "text-info" : ""} /><span>${m.read ? "Visto" : "Enviado"}</span>`}</p>
          </div>
          ${open && html`<div className="flex gap-1 motion-safe:animate-entra">
            <${Btn} className="text-xs py-1" onClick=${() => startReply(m)}><${Icon} name="CornerUpLeft" size=${14} />Responder<//>
            <${Btn} className="text-xs py-1" onClick=${() => { setSel(null); actions.copy(m.kind === "script" && m.script ? m.script.code : m.kind === "prompt" && m.prompt ? m.prompt.text : m.text); }}><${Icon} name="Copy" size=${14} />Copiar<//>
            ${mine && html`<${Btn} kind="danger" className="text-xs py-1" onClick=${() => { setSel(null); actions.confirm("¿Borrar este mensaje?", "Se borra para los dos. No se puede deshacer.", "Borrar", () => E.deleteMessage(m.id)); }}><${Icon} name="Trash2" size=${14} />Borrar<//>`}
          </div>`}
        </div>
        ${!mine && html`<${Btn} kind="ghost" className="p-1.5 shrink-0 opacity-60" aria-label="Opciones del mensaje" aria-expanded=${open} onClick=${() => setSel(open ? null : m.id)}><${Icon} name="MoreVertical" size=${16} /><//>`}
      </div>`;
    };

    let lastDay = "", prev = null;
    const rows = msgs.map((m) => {
      const day = dayLabel(m.at), sep = day !== lastDay;
      const grouped = !sep && prev && prev.from === m.from && m.at - prev.at < 5 * 60 * 1000;
      lastDay = day; prev = m;
      return html`<${React.Fragment} key=${m.id}>${sep && html`<div className="flex justify-center py-2"><span className="text-[11px] text-mute bg-panel border border-line rounded-full px-3 py-0.5 first-letter:uppercase">${day}</span></div>`}${bubble(m, grouped)}<//>`;
    });

    return html`<${Screen} onBack=${onBack} bodyRef=${bodyRef} onScroll=${onScroll}
      title=${html`<div className="flex items-center gap-2"><${Avatar} person=${other} status=${p} size=${32} /><div className="min-w-0"><p className="font-semibold truncate">${other.name}</p><p className="text-xs text-mute truncate">${p.label}${other.cargo ? " · " + other.cargo : ""}</p></div></div>`}
      footer=${html`<div className="border-t border-line bg-panel p-2 space-y-2 relative">
        ${newBelow && html`<button type="button" onClick=${() => toBottom(true)} className="absolute -top-12 left-1/2 -translate-x-1/2 flex items-center gap-1 rounded-full bg-acc text-acc-ink text-xs font-medium px-3 py-2 shadow-lg motion-safe:animate-entra"><${Icon} name="ArrowDown" size=${14} />Mensajes nuevos</button>`}
        ${replyTo && html`<div className="flex items-start gap-2 rounded-xl bg-canvas border-l-2 border-acc px-3 py-2 motion-safe:animate-entra">
          <div className="min-w-0 flex-1"><p className="text-xs font-medium text-acc">${"Respondiendo a " + (replyTo.from === meUid ? "tu mensaje" : otherFirst)}</p><p className="text-xs text-mute truncate">${preview(replyTo)}</p></div>
          <${Btn} kind="ghost" className="p-1 shrink-0" onClick=${() => setReplyTo(null)} aria-label="Cancelar la respuesta"><${Icon} name="X" size=${16} /><//></div>`}
        <div className="flex gap-2">
          <${Btn} className="text-xs" onClick=${() => actions.pickScript((s) => send({ kind: "script", text: "", script: s, replyTo: replyTo ? toReply(replyTo) : null }).then(() => setReplyTo(null)))}><${Icon} name="Paperclip" size=${14} />Enviar script<//>
          <${Btn} className="text-xs" onClick=${() => actions.ask("Pedir un script a " + other.name, (d) => send({ kind: "pedido", text: d.need, purpose: d.purpose, system: d.system }), { cta: "Pedir" })}><${Icon} name="HelpCircle" size=${14} />Pedir script<//>
        </div>
        <form className="flex gap-2 items-end" onSubmit=${(e) => { e.preventDefault(); sendText(); }}>
          <textarea ref=${inputRef} rows="1" aria-label=${"Mensaje para " + other.name} className=${cx(inputCls, "resize-none max-h-32 leading-snug")} placeholder=${"Escribe a " + otherFirst + "…"} value=${text} maxLength="2000"
            onInput=${(e) => { setText(e.target.value); fit(); }} onKeyDown=${(e) => { if (e.key === "Enter" && !e.shiftKey && !e.nativeEvent.isComposing) { e.preventDefault(); sendText(); } }}></textarea>
          <${Btn} kind="primary" type="submit" className="shrink-0 h-[38px]" disabled=${sending || !text.trim()} aria-label="Enviar"><${Icon} name="Send" /><//>
        </form>
      </div>`}>
      <div className="max-w-3xl mx-auto px-3 pt-1 pb-3">
        ${msgs.length ? rows : html`<${Empty} icon="MessagesSquare" title=${"Empieza a hablar con " + other.name}>Envíale un script o pídele el que necesitas, diciendo para qué. Toca un mensaje para responderlo citándolo.<//>`}
        <p className="text-[11px] text-faint text-center pt-3 flex items-center justify-center gap-1"><${Icon} name="Clock" size=${12} />Los mensajes se borran solos ${E.KEEP_READ_DAYS} días después de leídos (o a los ${E.KEEP_ALL_DAYS}). Guarda en tus scripts lo que te sirva.</p>
      </div>
    <//>`;
  }

  // ---------- Perfil y ajustes ----------
  function ProfileScreen({ user, profile, team, onBack, toast, confirm }) {
    const [name, setName] = useState(profile.name);
    const [cargo, setCargo] = useState(profile.cargo || "");
    const [devices, setDevices] = useState([]);
    const [busy, setBusy] = useState("");
    const [perm, setPerm] = useState("Notification" in window ? Notification.permission : "unsupported");
    useEffect(() => E.watchDevices(setDevices), []);
    const mine = E.thisToken();
    const onThis = devices.some((d) => d.token === mine) && perm === "granted";
    const run = async (k, fn) => { setBusy(k); try { await fn(); } catch (e) { toast(e.message || String(e)); } finally { setBusy(""); } };
    const ios = E.isIOS() && !E.isStandalone();
    return html`<${Screen} title="Mi perfil" onBack=${onBack}>
      <div className="max-w-xl mx-auto p-4 space-y-4">
        <section className="bg-panel border border-line rounded-2xl p-4 space-y-3">
          <div className="flex items-center gap-3"><${Avatar} person=${Object.assign({}, profile, { uid: user.uid })} size=${56} status=${{ key: profile.status, label: E.STATUSES[profile.status] }} />
            <div className="min-w-0"><p className="font-semibold truncate">${profile.name}</p><p className="text-xs text-mute truncate">Sesión iniciada con ${E.providerLabel(user)}: ${user.email}</p></div></div>
          <div className="grid grid-cols-3 gap-2">${Object.entries(E.STATUSES).map(([k, l]) => html`<button key=${k} type="button" onClick=${() => run("st", () => E.setStatus(k))} className=${cx("flex items-center justify-center gap-2 text-sm rounded-xl border py-2", profile.status === k ? "border-acc text-ink bg-raised" : "border-line text-mute")}><span className=${cx("w-2.5 h-2.5 rounded-full", DOT[k])}></span>${l}</button>`)}</div>
          <${Field} label="Nombre visible"><input className=${inputCls} value=${name} maxLength="60" onInput=${(e) => setName(e.target.value)} /><//>
          <${Field} label="Cargo o rol"><input className=${inputCls} value=${cargo} maxLength="80" onInput=${(e) => setCargo(e.target.value)} /><//>
          <${Btn} disabled=${busy === "p" || !name.trim() || (name === profile.name && cargo === (profile.cargo || ""))} onClick=${() => run("p", async () => { await E.saveProfile({ name: name, cargo: cargo }); toast("Perfil guardado."); })}><${Icon} name="Save" />Guardar perfil<//>
        </section>

        <section className="bg-panel border border-line rounded-2xl p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><${Icon} name="Bell" />Notificaciones</h3>
          ${ios && html`<p className="text-sm text-warn">En iPhone: toca Compartir (Share) → «Agregar a inicio» (Add to Home Screen) y abre la app desde ese ícono. Solo así iOS permite avisos.</p>`}
          ${perm === "denied" && html`<p className="text-sm text-bad">Las bloqueaste en este navegador: toca el candado junto a la dirección → Notificaciones → Permitir, y recarga.</p>`}
          ${!E.pushReady() && html`<p className="text-sm text-warn">El servidor de avisos no está configurado todavía (config.js). Mientras tanto, los avisos solo salen con la app abierta.</p>`}
          <p className="text-sm text-mute">${onThis ? "Este dispositivo recibe avisos cuando te envían o te piden un script, aunque la app esté cerrada." : "Actívalas en cada celular o PC donde quieras recibir avisos."}</p>
          <div className="flex gap-2 flex-wrap">
            ${!onThis && html`<${Btn} kind="primary" disabled=${busy === "n" || perm === "denied"} onClick=${() => run("n", async () => { await E.enablePush(); setPerm(Notification.permission); toast("Notificaciones activadas en este dispositivo."); })}><${Icon} name="BellRing" />Activar en este dispositivo<//>`}
            ${devices.length > 0 && html`<${Btn} disabled=${busy === "t"} onClick=${() => run("t", async () => { const r = await E.testPush(); toast(r.ok ? (r.sent ? "Aviso de prueba enviado a " + r.sent + " dispositivo(s)." : "No hay dispositivos activos.") : "No se pudo: " + r.reason); })}><${Icon} name="Send" />Enviar prueba<//>`}
          </div>
          ${devices.map((d) => html`<div key=${d.token} className="flex items-center gap-3 text-sm bg-canvas border border-line rounded-xl p-2">
            <${Icon} name=${/Windows|Mac|Linux/.test(d.label) ? "Laptop" : "Smartphone"} className="text-mute" />
            <span className="flex-1 min-w-0"><span className="block truncate">${d.label}${d.token === mine ? " · este" : ""}</span><span className="block text-xs text-faint">Desde ${new Date(d.addedAt || 0).toLocaleDateString("es-CO")}</span></span>
            <${Btn} kind="ghost" onClick=${() => run("r", () => E.removeDevice(d.token))} aria-label="Quitar"><${Icon} name="Trash2" size=${16} /><//>
          </div>`)}
        </section>

        <section className="bg-panel border border-line rounded-2xl p-4 space-y-3">
          <h3 className="font-semibold flex items-center gap-2"><${Icon} name="Users" />Equipo: ${team ? team.name : "…"}</h3>
          <${Btn} kind="danger" onClick=${() => confirm("¿Salir del equipo?", "Dejarás de ver a sus personas, sus pedidos y sus scripts publicados. Tus scripts siguen siendo tuyos. Para volver necesitas el código.", "Salir del equipo", () => E.leaveTeam())}><${Icon} name="LogOut" />Salir del equipo<//>
        </section>
        <${Btn} className="w-full" onClick=${() => confirm("¿Cerrar sesión?", "Este dispositivo dejará de recibir avisos hasta que vuelvas a entrar.", "Cerrar sesión", () => E.signOut())}><${Icon} name="LogOut" />Cerrar sesión<//>
      </div>
    <//>`;
  }

  // ---------- Pestañas ----------
  function ActivityTab({ feed, members, meUid, now, pushOn, onOpenChat, onOpenRequest, onProfile, installEvt, onInstall }) {
    const who = (uid) => members.find((m) => m.uid === uid) || { uid: uid, name: "Alguien" };
    return html`<div className="space-y-3">
      ${!pushOn && html`<button type="button" onClick=${onProfile} className="w-full text-left flex items-center gap-3 p-3 rounded-2xl bg-warn/10 border border-warn/30">
        <${Icon} name="BellOff" className="text-warn shrink-0" /><span><span className="block font-medium">Activa las notificaciones</span><span className="block text-xs text-mute">Sin ellas no te enterarás cuando te pidan o te envíen un script.</span></span></button>`}
      ${installEvt && html`<button type="button" onClick=${onInstall} className="w-full text-left flex items-center gap-3 p-3 rounded-2xl bg-acc/10 border border-acc/30">
        <${Icon} name="Download" className="text-acc shrink-0" /><span><span className="block font-medium">Instalar la app</span><span className="block text-xs text-mute">Ícono en el inicio, pantalla completa y aparece en el menú Compartir del celular.</span></span></button>`}
      ${feed.length ? feed.map((it) => {
        const p = who(it.from);
        const label = it.type === "request" ? "pidió al equipo" : it.kind === "pedido" ? "te pide un script" : it.kind === "script" ? "te envió un script" : it.kind === "prompt" ? "te envió un prompt" : "te escribió";
        const unread = it.type === "msg" && !it.read;
        const ic = it.type === "request" ? "Megaphone" : KIND_ICON[it.kind] || "MessageCircle";
        return html`<button key=${it.type + it.id} type="button" onClick=${() => (it.type === "request" ? onOpenRequest(it) : onOpenChat(it.from))} className=${cx("w-full flex items-start gap-3 p-3 rounded-2xl text-left border transition-colors hover:border-faint", unread ? "bg-raised border-acc/40" : "bg-panel border-line")}>
          <${Avatar} person=${p} status=${E.presence(p, now)} />
          <span className="min-w-0 flex-1"><span className="block text-sm"><b>${p.name}</b> ${label}</span>
          <span className="flex items-center gap-1.5 text-sm text-mute min-w-0"><${Icon} name=${ic} size=${14} className="shrink-0 text-faint" /><span className="truncate">${preview(it)}${it.purpose ? " · para: " + it.purpose : ""}</span></span>
          <span className="block text-xs text-faint">${timeLabel(it.at)}${it.type === "request" ? " · " + (it.status === "resuelto" ? "resuelto" : "abierto") : ""}</span></span>
          ${unread && html`<span className="w-2.5 h-2.5 rounded-full bg-acc mt-2"></span>`}</button>`;
      }) : html`<${Empty} icon="Activity" title="Sin actividad todavía">Aquí verás quién te envía scripts, quién te los pide y los pedidos del equipo.<//>`}
    </div>`;
  }

  function ChatsTab({ convos, members, meUid, now, onOpenChat }) {
    const others = members.filter((m) => m.uid !== meUid && !convos.some((c) => c.uid === m.uid));
    return html`<div className="space-y-2">
      ${convos.map((c) => { const m = members.find((x) => x.uid === c.uid) || { uid: c.uid, name: "Ex miembro" }; const last = c.last;
        return html`<button key=${c.uid} type="button" onClick=${() => onOpenChat(c.uid)} className="w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-panel text-left">
          <${Avatar} person=${m} status=${E.presence(m, now)} size=${44} />
          <span className="min-w-0 flex-1"><span className="flex justify-between gap-2"><span className="font-medium truncate">${m.name}</span><span className="text-xs text-faint shrink-0">${timeLabel(last.at)}</span></span>
          <span className="flex justify-between gap-2"><span className=${cx("flex items-center gap-1 text-sm min-w-0", c.unread ? "text-ink" : "text-mute")}>${last.kind !== "texto" && html`<${Icon} name=${KIND_ICON[last.kind] || "MessageCircle"} size=${14} className="shrink-0 text-faint" />`}<span className="truncate">${last.from === meUid ? "Tú: " : ""}${last.kind === "pedido" ? "Pedido: " : ""}${preview(last)}</span></span>
          ${c.unread > 0 && html`<span className="shrink-0 min-w-[20px] h-5 px-1.5 rounded-full bg-acc text-acc-ink text-xs font-semibold grid place-items-center">${c.unread}</span>`}</span></span></button>`; })}
      ${others.length > 0 && html`<p className="text-xs text-faint pt-2 px-2">Empieza un chat</p>`}
      ${others.map((m) => html`<button key=${m.uid} type="button" onClick=${() => onOpenChat(m.uid)} className="w-full flex items-center gap-3 p-2 rounded-2xl hover:bg-panel text-left">
        <${Avatar} person=${m} status=${E.presence(m, now)} /><span className="min-w-0"><span className="block font-medium truncate">${m.name}</span><span className="block text-xs text-mute truncate">${E.presence(m, now).label}</span></span></button>`)}
      ${!convos.length && !others.length && html`<${Empty} icon="UserPlus" title="Tu equipo está vacío">Invita a tus compañeros desde la pestaña Equipo.<//>`}
    </div>`;
  }

  function TeamTab({ team, members, meUid, now, requests, focusRequest, onOpenChat, actions, toast }) {
    const [qr, setQr] = useState(false);
    const link = E.inviteLink(team.id);
    const focusRef = useRef(null);
    useEffect(() => { focusRef.current && focusRef.current.scrollIntoView({ block: "center", behavior: "smooth" }); }, [focusRequest]);
    const online = members.filter((m) => E.presence(m, now).online).length;
    const invite = async () => {
      const text = "Únete a mi equipo «" + team.name + "» en Lanzador. Código: " + E.formatCode(team.id);
      if (navigator.share) { try { await navigator.share({ title: "Lanzador · Equipos", text: text, url: link }); return; } catch (e) { if (e && e.name === "AbortError") return; } }
      toast((await copyText(text + "\n" + link)) ? "Invitación copiada: pégala en WhatsApp." : "No se pudo copiar.");
    };
    const who = (uid) => members.find((m) => m.uid === uid) || { uid: uid, name: "Alguien" };
    return html`<div className="space-y-4">
      <section className="bg-panel border border-line rounded-2xl p-4 space-y-3">
        <div className="flex items-start justify-between gap-2"><div><h2 className="font-semibold text-lg">${team.name}</h2><p className="text-xs text-mute">${members.length} persona(s) · ${online} conectada(s)</p></div>
          <span className="font-mono text-sm bg-canvas border border-line rounded-lg px-2 py-1 select-all">${E.formatCode(team.id)}</span></div>
        <div className="flex gap-2 flex-wrap">
          <${Btn} kind="primary" onClick=${invite}><${Icon} name="UserPlus" />Invitar<//>
          <${Btn} onClick=${() => setQr(!qr)}><${Icon} name="QrCode" />QR<//>
          <${Btn} onClick=${async () => toast((await copyText(E.formatCode(team.id))) ? "Código copiado." : "No se pudo copiar.")}><${Icon} name="Copy" />Código<//>
        </div>
        ${qr && html`<div className="bg-white rounded-xl p-3 mx-auto max-w-[240px]" dangerouslySetInnerHTML=${{ __html: qrSvg(link) }}></div>`}
      </section>

      <section className="space-y-2">
        <div className="flex items-center justify-between"><h3 className="font-semibold">Pedidos del equipo</h3>
          <${Btn} kind="primary" className="text-xs" onClick=${actions.newRequest}><${Icon} name="Megaphone" size=${14} />Pedir un script<//></div>
        ${requests.length ? requests.map((r) => { const p = who(r.from); const mine = r.from === meUid; const open = r.status !== "resuelto";
          return html`<div key=${r.id} ref=${r.id === focusRequest ? focusRef : null} className=${cx("bg-panel border rounded-2xl p-3 space-y-2", r.id === focusRequest ? "border-acc" : "border-line")}>
            <div className="flex items-center gap-2"><${Avatar} person=${p} size=${28} /><p className="text-sm min-w-0 flex-1 truncate"><b>${mine ? "Tú" : p.name}</b> <span className="text-faint">· ${timeLabel(r.at)}</span></p>
              <span className=${cx("text-xs px-2 py-0.5 rounded-full", open ? "bg-warn/15 text-warn" : "bg-good/15 text-good")}>${open ? "Abierto" : "Resuelto"}</span></div>
            <${NeedBlock} text=${r.text} purpose=${r.purpose} system=${r.system} category=${r.category} />
            <div className="flex gap-2 flex-wrap">
              ${!mine && open && html`<${Btn} kind="primary" className="text-xs py-1" onClick=${() => actions.answerRequest(r)}><${Icon} name="Send" size=${14} />Tengo uno: enviar<//>`}
              ${!mine && html`<${Btn} className="text-xs py-1" onClick=${() => onOpenChat(r.from)}><${Icon} name="MessageCircle" size=${14} />Escribir<//>`}
              ${mine && html`<${Btn} className="text-xs py-1" onClick=${() => E.setRequestStatus(r.id, open ? "resuelto" : "abierto")}><${Icon} name=${open ? "Check" : "RefreshCw"} size=${14} />${open ? "Marcar resuelto" : "Reabrir"}<//>
                <${Btn} kind="ghost" className="text-xs py-1" onClick=${() => E.deleteRequest(r.id)}><${Icon} name="Trash2" size=${14} />Borrar<//>`}
            </div></div>`; })
        : html`<p className="text-sm text-mute">No hay pedidos. Si necesitas un script, pídelo diciendo para qué: le llega un aviso a todo el equipo.</p>`}
      </section>

      <section className="space-y-2">
        <h3 className="font-semibold">Personas</h3>
        ${members.map((m) => { const p = E.presence(m, now); const isMe = m.uid === meUid;
          return html`<div key=${m.uid} className="flex items-center gap-3 p-2 bg-panel border border-line rounded-2xl">
            <${Avatar} person=${m} status=${p} size=${42} />
            <div className="min-w-0 flex-1"><p className="font-medium truncate">${m.name}${isMe ? " (tú)" : ""}${team.owner === m.uid ? html` <span className="text-xs text-acc">· creador</span>` : ""}</p><p className="text-xs text-mute truncate">${p.label}${m.cargo ? " · " + m.cargo : ""}</p></div>
            ${!isMe && html`<${Btn} kind="ghost" onClick=${() => onOpenChat(m.uid)} aria-label=${"Chat con " + m.name}><${Icon} name="MessageCircle" /><//>
              <${Btn} kind="ghost" onClick=${() => actions.askPerson(m)} aria-label=${"Pedir script a " + m.name}><${Icon} name="HelpCircle" /><//>`}
          </div>`; })}
      </section>
    </div>`;
  }

  function ScriptsTab({ library, community, members, meUid, publishedIds, onOpen, onOpenCommunity, actions }) {
    const [seg, setSeg] = useState("mios");
    const [q, setQ] = useState("");
    const [cat, setCat] = useState("");
    const fileRef = useRef(null);
    const mine = useMemo(() => G.search(library, q, { category: cat }), [library, q, cat]);
    // Todo lo publicado (tuyo y de los demás), del más viejo al más nuevo, como un chat de grupo.
    const team = useMemo(() => {
      const found = new Set(G.search(community.map((c) => Object.assign({}, c.script, { id: c.id })), q, { category: cat }).map((s) => s.id));
      return community.filter((c) => found.has(c.id)).sort((a, b) => a.at - b.at);
    }, [community, q, cat]);
    const who = (uid) => members.find((m) => m.uid === uid) || { uid: uid, name: "Ex miembro" };
    return html`<div className="space-y-3">
      <div className="flex gap-1 bg-panel border border-line rounded-xl p-1">${[["mios", "Mis scripts (" + library.length + ")"], ["equipo", "Del equipo (" + community.length + ")"]].map(([k, l]) => html`<button key=${k} type="button" onClick=${() => setSeg(k)} className=${cx("flex-1 text-sm rounded-lg py-1.5", seg === k ? "bg-raised text-ink" : "text-mute")}>${l}</button>`)}</div>
      <div className="flex gap-2"><div className="relative flex-1"><${Icon} name="Search" size=${16} className="absolute left-3 top-2.5 text-faint" /><input className=${cx(inputCls, "pl-9")} placeholder="Buscar (tolera errores: «resolucon»)" value=${q} onInput=${(e) => setQ(e.target.value)} /></div>
        ${seg === "mios" && html`<${Btn} kind="primary" onClick=${actions.newScript} aria-label="Nuevo script"><${Icon} name="Plus" /><//>
          <${Btn} onClick=${() => fileRef.current.click()} aria-label="Importar archivo"><${Icon} name="Upload" /><//>
          <input ref=${fileRef} type="file" multiple accept=".ps1,.psm1,.bat,.cmd,.py,.sh,.txt" className="hidden" onChange=${(e) => { actions.importFiles(Array.from(e.target.files || [])); e.target.value = ""; }} />`}</div>
      <div className="flex gap-2 overflow-x-auto pb-1">${["", ...G.CATEGORIES].map((c) => html`<button key=${c || "todas"} type="button" onClick=${() => setCat(c)} className=${cx("shrink-0 text-xs px-2.5 py-1 rounded-full border", cat === c ? "border-acc text-acc" : "border-line text-mute")}>${c || "Todas"}</button>`)}</div>
      ${seg === "mios"
        ? (mine.length ? mine.map((s) => { const rep = G.audit(s); return html`<button key=${s.id} type="button" onClick=${() => onOpen(s)} className="w-full flex items-center gap-3 p-3 bg-panel border border-line rounded-2xl text-left hover:border-faint">
            <${Icon} name="FileCode" className="text-acc shrink-0" />
            <span className="min-w-0 flex-1"><span className="block font-medium truncate">${s.name}</span><span className="block text-xs text-mute truncate">${s.category}${publishedIds.has(s.id) ? " · publicado al equipo" : ""}${s.origin ? " · de " + who(s.origin.authorId).name : ""}</span></span>
            <span className=${cx("text-xs", rep.score >= 80 ? "text-good" : rep.score >= 50 ? "text-warn" : "text-bad")}>${rep.score}</span><${LangBadge} lang=${s.lang} /></button>`; })
          : html`<${Empty} icon="FileCode" title="Sin scripts">Crea uno con + o importa .ps1, .bat, .py o .sh.<//>`)
        : html`<${TeamFeed} items=${team} filtered=${!!(q || cat)} library=${library} members=${members} meUid=${meUid} onOpenCommunity=${onOpenCommunity} actions=${actions} />`}
    </div>`;
  }

  // Scripts publicados al equipo como un grupo de WhatsApp: lo tuyo a la derecha, lo de los demás a la izquierda con su nombre.
  const dayLabel = (ms) => {
    const d = new Date(ms), now = new Date(), y = new Date(now); y.setDate(now.getDate() - 1);
    if (d.toDateString() === now.toDateString()) return "Hoy";
    if (d.toDateString() === y.toDateString()) return "Ayer";
    return d.toLocaleDateString("es-CO", { weekday: "long", day: "numeric", month: "long" });
  };
  function TeamFeed({ items, filtered, library, members, meUid, onOpenCommunity, actions }) {
    const endRef = useRef(null);
    useEffect(() => { if (!filtered && endRef.current) endRef.current.scrollIntoView({ block: "end" }); }, [items.length, filtered]);
    const who = (uid) => members.find((m) => m.uid === uid) || { uid: uid, name: "Ex miembro" };
    const saved = useMemo(() => new Set(library.filter((s) => s.origin).map((s) => s.origin.authorId + "/" + s.origin.scriptId)), [library]);
    let lastDay = "", lastOwner = "";
    return html`<div className="space-y-2">
      ${items.length ? items.map((c) => {
        const mine = c.owner === meUid, p = who(c.owner), s = c.script;
        const day = dayLabel(c.at || Date.now());
        const sep = day !== lastDay;
        const showName = !mine && (sep || lastOwner !== c.owner);
        lastDay = day; lastOwner = c.owner;
        const isSaved = saved.has(c.owner + "/" + s.id);
        return html`<${React.Fragment} key=${c.id}>
          ${sep && html`<div className="flex justify-center py-1"><span className="text-[11px] text-mute bg-panel border border-line rounded-full px-3 py-0.5 first-letter:uppercase">${day}</span></div>`}
          <div className=${cx("flex items-end gap-2", mine && "justify-end")}>
            ${!mine && (showName ? html`<${Avatar} person=${p} size=${30} />` : html`<span className="w-[30px] shrink-0"></span>`)}
            <div className=${cx("max-w-[85%] rounded-2xl px-3 py-2 text-sm space-y-2", mine ? "bg-acc/15 border border-acc/30 rounded-br-md" : "bg-panel border border-line rounded-bl-md")}>
              ${showName && html`<p className="text-xs font-semibold" style=${{ color: `hsl(${hue(p.uid || p.name)} 65% 65%)` }}>${p.name}</p>`}
              <p className="flex items-center gap-1 text-xs text-mute"><${Icon} name="Megaphone" size=${12} />${mine ? "Publicaste al equipo" : "Publicó al equipo"}</p>
              <div className="rounded-xl bg-canvas border border-line p-2 space-y-1">
                <p className="flex items-center gap-2 font-medium"><${Icon} name="FileCode" className="text-acc shrink-0" /><span className="min-w-0">${s.name}</span><${LangBadge} lang=${s.lang} /></p>
                <p className="text-xs text-faint">${s.category}</p>
                ${s.notes && html`<p className="text-xs text-mute line-clamp-2">${s.notes}</p>`}
                <div className="flex gap-2 pt-1 flex-wrap">
                  <${Btn} className="text-xs py-1" onClick=${() => onOpenCommunity(c)}><${Icon} name="Eye" size=${14} />Ver<//>
                  ${mine
                    ? html`<${Btn} kind="ghost" className="text-xs py-1" onClick=${() => actions.unpublish(c)}><${Icon} name="Trash2" size=${14} />Quitar<//>`
                    : html`<${Btn} kind=${isSaved ? "ghost" : "primary"} className="text-xs py-1" disabled=${isSaved} onClick=${() => actions.saveCopy(s, c.owner)}><${Icon} name=${isSaved ? "Check" : "Save"} size=${14} />${isSaved ? "Guardado" : "Guardar"}<//>
                      <${Btn} kind="ghost" className="text-xs py-1" onClick=${() => actions.openChat(c.owner)}><${Icon} name="MessageCircle" size=${14} />Escribir<//>`}
                </div>
              </div>
              <p className=${cx("text-[10px] text-faint", mine && "text-right")}>${timeLabel(c.at)}</p>
            </div>
          </div>
        <//>`;
      }) : html`<${Empty} icon="Users" title=${filtered ? "Sin resultados" : "Nadie ha publicado todavía"}>${filtered ? "Prueba otra palabra o quita el filtro." : "Publica tu primer script con el botón de abajo: todo el equipo lo verá aquí."}<//>`}
      <div ref=${endRef}></div>
      <${Btn} kind="primary" className="w-full" onClick=${actions.publishFromLibrary}><${Icon} name="Megaphone" />Publicar un script al equipo<//>
    </div>`;
  }

  // ---------- App principal ----------
  function Main({ user, profile, deep, clearDeep }) {
    const meUid = user.uid;
    const now = useNow(30000);
    const [tab, setTab] = useState(deep.vista && ["actividad", "chats", "equipo", "scripts"].includes(deep.vista) ? deep.vista : "actividad");
    const [team, setTeam] = useState(null);
    const [members, setMembers] = useState([]);
    const [inbox, setInbox] = useState([]);
    const [outbox, setOutbox] = useState([]);
    const [requests, setRequests] = useState([]);
    const [community, setCommunity] = useState([]);
    const [library, setLibrary] = useState(null);
    const [devices, setDevices] = useState([]);
    const [stack, setStack] = useState([]);
    const [toasts, setToasts] = useState([]);
    const [focusRequest, setFocusRequest] = useState(deep.pedido || null);
    const [installEvt, setInstallEvt] = useState(null);
    const [netOk, setNetOk] = useState(navigator.onLine);
    const ready = useRef({ inbox: false, requests: false });
    const stackRef = useRef(stack); stackRef.current = stack;
    const membersRef = useRef(members); membersRef.current = members;
    const devicesRef = useRef(devices); devicesRef.current = devices;
    const listsRef = useRef({}); listsRef.current = { inbox: inbox, outbox: outbox, requests: requests };

    // Pila de pantallas: el botón Atrás del celular cierra la última, como en Teams.
    // Se usa una sola entrada de historial como "trampa" mientras haya capas abiertas.
    const trapped = useRef(false), ignorePop = useRef(false);
    const layer = (o) => Object.assign({ key: Date.now() + Math.random() }, o);
    const push = useCallback((o) => {
      if (!trapped.current) { history.pushState({ capa: true }, ""); trapped.current = true; }
      setStack((s) => s.concat([layer(o)]));
    }, []);
    const close = useCallback((key) => setStack((s) => s.filter((x) => x.key !== key)), []);
    const replaceTop = useCallback((o) => setStack((s) => s.slice(0, -1).concat([layer(o)])), []);
    useEffect(() => {
      if (!stack.length && trapped.current) { trapped.current = false; ignorePop.current = true; history.back(); }
    }, [stack.length]);
    useEffect(() => {
      const h = () => {
        if (ignorePop.current) { ignorePop.current = false; return; }
        trapped.current = false;
        if (stackRef.current.length > 1) { history.pushState({ capa: true }, ""); trapped.current = true; }
        setStack((s) => s.slice(0, -1));
      };
      window.addEventListener("popstate", h);
      return () => window.removeEventListener("popstate", h);
    }, []);

    const toast = useCallback((title, opts) => {
      const t = Object.assign({ id: Date.now() + Math.random(), title: title }, opts || {});
      setToasts((x) => x.concat([t]).slice(-3));
      setTimeout(() => setToasts((x) => x.filter((y) => y.id !== t.id)), t.ms || 4500);
    }, []);

    // Suscripciones a Firestore.
    useEffect(() => {
      const err = (what) => (e) => toast(e.code === "resource-exhausted" ? E.errorText(e) : "Error al leer " + what + ": " + E.errorText(e), { ms: 8000 });
      const subs = [
        E.watchMembers(profile.team, setMembers, err("el equipo")),
        E.watchOutbox(meUid, setOutbox, err("tus mensajes")),
        E.watchCommunity(profile.team, setCommunity, err("los scripts del equipo")),
        E.watchLibrary(setLibrary, err("tus scripts")),
        E.watchDevices(setDevices),
        E.watchInbox(meUid, (all, added) => {
          setInbox(all);
          if (!ready.current.inbox) { ready.current.inbox = true; return; }
          added.filter((m) => !m.read).forEach(onIncoming);
        }, err("tus mensajes")),
        E.watchRequests(profile.team, (all, added) => {
          setRequests(all);
          if (!ready.current.requests) { ready.current.requests = true; return; }
          added.filter((r) => r.from !== meUid).forEach(onTeamRequest);
        }, err("los pedidos")),
      ];
      E.getTeam(profile.team).then(setTeam);
      E.startPresence(meUid);
      // Avisos: deja al día el token de este dispositivo; si nunca se decidió aquí (p. ej. un teléfono nuevo), se ofrece.
      E.refreshPush();
      const offer = setTimeout(() => {
        if (!E.shouldOfferPush()) return;
        E.pushOffered();
        confirm("¿Avisos en este dispositivo?", "Así te llegan los mensajes del chat y los pedidos aunque la app esté cerrada. Cada teléfono o PC se activa por separado.", "Activar avisos",
          () => E.enablePush().then(() => toast("Notificaciones activadas en este dispositivo."), (e) => toast(e.message)), { kind: "primary", cancel: "Ahora no" });
      }, 2500);
      // Limpieza de mensajes viejos (cuando ya cargaron las listas).
      const clean = setTimeout(() => { E.cleanup({ team: profile.team, inbox: listsRef.current.inbox, outbox: listsRef.current.outbox, requests: listsRef.current.requests }).catch(() => {}); }, 8000);
      return () => { clearTimeout(offer); clearTimeout(clean); subs.forEach((u) => u && u()); E.stopPresence(); };
    }, [profile.team, meUid]);

    const who = (uid) => membersRef.current.find((m) => m.uid === uid) || { uid: uid, name: "Ex miembro" };
    const nameOf = (uid) => (membersRef.current.find((m) => m.uid === uid) || {}).name || "Alguien del equipo";
    function onIncoming(m) {
      const top = stackRef.current[stackRef.current.length - 1];
      if (top && top.type === "chat" && top.uid === m.from && document.visibilityState === "visible") return; // ya lo estás viendo
      const n = nameOf(m.from);
      const title = m.kind === "pedido" ? "📩 " + n + " te pide un script" : m.kind === "script" ? "📜 " + n + " te envió «" + ((m.script && m.script.name) || "un script") + "»" : m.kind === "prompt" ? "✨ " + n + " te envió un prompt" : "💬 " + n;
      notifyHere(title, m.kind === "script" ? "Toca para verlo y guardarlo" : m.text, () => openChat(m.from), "/?chat=" + m.from, "chat-" + m.from);
    }
    function onTeamRequest(r) {
      notifyHere("📣 " + nameOf(r.from) + " pide un script al equipo", r.text, () => openRequest(r), "/?pedido=" + r.id, "pedido-" + r.id);
    }
    function notifyHere(title, body, onOpen, link, tag) {
      if (document.visibilityState === "visible") {
        ding(); if (navigator.vibrate) navigator.vibrate([60, 40, 60]);
        toast(title, { body: body, onOpen: onOpen, ms: 7000 });
      } else if (!E.pushReady() || !devicesRef.current.some((d) => d.token === E.thisToken())) {
        // Con push activo el aviso llega por Firebase; sin push, lo muestra la app abierta en segundo plano.
        E.localNotify(title, body, link, tag).catch(() => {});
      }
    }

    // Insignia de no leídos (ícono de la app y título de la pestaña).
    const unread = inbox.filter((m) => !m.read).length;
    useEffect(() => {
      document.title = (unread ? "(" + unread + ") " : "") + "Lanzador · Equipos";
      if (navigator.setAppBadge) (unread ? navigator.setAppBadge(unread) : navigator.clearAppBadge()).catch(() => {});
    }, [unread]);

    useEffect(() => {
      const bip = (e) => { e.preventDefault(); setInstallEvt(e); };
      const on = () => setNetOk(true), off = () => setNetOk(false);
      const swMsg = (e) => { if (e.data && e.data.tipo === "abrir") handleLink(e.data.link); };
      window.addEventListener("beforeinstallprompt", bip); window.addEventListener("online", on); window.addEventListener("offline", off);
      navigator.serviceWorker && navigator.serviceWorker.addEventListener("message", swMsg);
      document.addEventListener("pointerdown", unlockAudio, { once: true });
      return () => { window.removeEventListener("beforeinstallprompt", bip); window.removeEventListener("online", on); window.removeEventListener("offline", off); navigator.serviceWorker && navigator.serviceWorker.removeEventListener("message", swMsg); };
    }, []);

    // Enlaces directos (desde una notificación, un acceso directo o "Compartir" de otra app).
    function handleLink(link) {
      const u = new URL(link, location.origin);
      if (u.searchParams.get("chat")) openChat(u.searchParams.get("chat"));
      else if (u.searchParams.get("pedido")) openRequest({ id: u.searchParams.get("pedido") });
    }
    useEffect(() => {
      if (library === null) return;
      if (deep.chat) openChat(deep.chat);
      if (deep.pedido) openRequest({ id: deep.pedido });
      if (deep.accion === "pedir") newRequest();
      if (deep.compartido) receiveShared();
      clearDeep();
    }, [library === null]);

    // ----- Acciones -----
    const pushResult = (r, who) => {
      if (!r || r.ok && r.sent > 0 || r.reason === "sin-configurar") return;
      if (r.ok) toast("Enviado. " + (who ? who + " aún no activó" : "Nadie más tiene activadas") + " las notificaciones: lo verá al abrir la app.");
      else toast("Enviado, pero no se pudo avisar: " + r.reason);
    };
    // Si las reglas de Firestore aún son las anteriores, lo nuevo viaja dentro del texto: se avisa una vez.
    const warnedRules = useRef(false);
    const checkRules = () => { if (E.rulesOutdated() && !warnedRules.current) { warnedRules.current = true; toast("Enviado sin los datos nuevos: quien administra la app debe pegar las reglas nuevas de Firestore.", { ms: 8000 }); } };
    const send = async (other, payload) => {
      try { const r = await E.sendMessage(profile, other.uid, payload); pushResult(r.pushed, other.name.split(" ")[0]); checkRules(); }
      catch (e) { toast("No se envió: " + (e.code === "permission-denied" ? "esa persona ya no está en tu equipo." : E.errorText(e))); throw e; }
    };
    const react = (m, r) => E.react(m.id, r).then(() => { if (r) toast(r === "sirvio" ? "Listo: " + nameOf(m.from).split(" ")[0] + " verá que te sirvió." : "Cuéntale qué error te salió."); }, (e) => { toast(e.message); throw e; });
    const pickScript = (cb, title) => push({ type: "pickScript", title: title, cb: cb });
    const ask = (title, cb, extra) => push(Object.assign({ type: "ask", title: title, cb: cb }, extra || {}));
    const saveCopy = async (s, authorId) => { await E.saveCopy(s, authorId); toast("Guardado en tus scripts."); };
    const openChat = (uid) => {
      if (uid === meUid) return;
      const top = stackRef.current[stackRef.current.length - 1];
      if (top && top.type === "chat") replaceTop({ type: "chat", uid: uid }); else push({ type: "chat", uid: uid });
    };
    const openRequest = (r) => { setTab("equipo"); setFocusRequest(r.id); };
    const newRequest = () => ask("Pedir un script al equipo", async (d) => {
      const r = await E.createRequest(profile, d.need, d.category, { purpose: d.purpose, system: d.system }); setTab("equipo"); toast("Pedido enviado al equipo."); pushResult(r.pushed, null); checkRules();
    }, { intro: "Di qué necesitas y para qué: quien lo tenga te lo envía y te explica cómo usarlo. Le llega un aviso a todos.", withCategory: true, cta: "Pedir al equipo" });
    const answerRequest = (r) => pickScript(async (s) => {
      const other = membersRef.current.find((m) => m.uid === r.from);
      if (!other) { toast("Esa persona ya no está en el equipo."); return; }
      await send(other, { kind: "script", text: "Para tu pedido: «" + r.text.slice(0, 80) + "»", script: s, requestId: r.id }).then(() => toast("Script enviado a " + other.name + ". Toca para ver el chat.", { onOpen: () => openChat(other.uid), ms: 7000 }), () => {});
    }, "¿Qué script le envías?");
    const askPerson = (m) => ask("Pedir un script a " + m.name, async (d) => { await send(m, { kind: "pedido", text: d.need, purpose: d.purpose, system: d.system }); openChat(m.uid); }, { cta: "Pedir" });
    const sendTo = (s) => push({ type: "pickMember", title: "¿A quién le envías «" + s.name + "»?", cb: async (m) => {
      // Como en WhatsApp: después de enviar, se abre el chat donde quedó el script.
      await send(m, { kind: "script", text: "", script: s }).then(() => { openChat(m.uid); toast("Enviado a " + m.name + ". Quedó en su chat (pestaña Chats)."); }, () => {});
    } });
    const share = (s) => push({ type: "share", script: s });
    const openScript = (s, from, opts) => push(Object.assign({ type: "script", script: s, editable: !from && library && library.some((x) => x.id === s.id), from: from }, opts || {}));
    const newScript = () => push({ type: "script", script: G.newScript("ps5"), editable: true });
    const publishedIds = useMemo(() => new Set(community.filter((c) => c.owner === meUid).map((c) => c.id.slice(meUid.length + 1))), [community, meUid]);
    const togglePublish = async (s) => {
      try {
        if (publishedIds.has(s.id)) { await E.unpublish(s.id); toast("Ya no está publicado en el equipo."); }
        else { await E.saveScript(s); await E.publish(profile, s); toast("Publicado: todo el equipo lo ve en Scripts → Del equipo."); }
      } catch (e) { toast("No se pudo: " + e.message); }
    };
    const confirm = (title, text, cta, fn, more) => push(Object.assign({ type: "confirm", title: title, text: text, cta: cta, fn: fn }, more || {}));
    const importFiles = async (files) => {
      let ok = 0, bad = [];
      for (const f of files.slice(0, 20)) {
        const name = f.name.replace(/(\.(ps1|psm1|bat|cmd|py|sh))\.txt$/i, "$1");
        const s = G.scriptFromFile(name, G.decodeText(await f.arrayBuffer()));
        if (s) { await E.saveScript(s); ok++; } else bad.push(f.name);
      }
      toast((ok ? ok + " script(s) agregado(s). " : "") + (bad.length ? "No reconocí: " + bad.join(", ") + " (usa .ps1, .bat, .cmd, .py o .sh)." : ""));
    };
    async function receiveShared() {
      try {
        const cache = await caches.open("compartidos");
        const res = await cache.match("/compartido.json");
        if (!res) return;
        const data = await res.json();
        await cache.delete("/compartido.json");
        const files = (data.items || []).map((it) => new File([new Uint8Array(it.bytes)], it.name));
        if (files.length) { setTab("scripts"); await importFiles(files); }
        else if (data.text && data.text.trim()) push({ type: "script", script: Object.assign(G.newScript("ps5"), { name: "Recibido", code: data.text }), editable: true });
      } catch (e) { toast("No se pudo leer lo compartido."); }
    }
    const openInAdvisor = (p) => { try { localStorage.setItem("equipos.promptEntrante", JSON.stringify({ title: p.title, text: p.text, at: Date.now() })); } catch (e) { /* sin almacenamiento */ } location.href = "/asesor/?desde=equipos"; };
    const unpublish = (c) => confirm("¿Quitar «" + c.script.name + "» del equipo?", "Deja de verse en «Del equipo». El script sigue en tu biblioteca.", "Quitar", async () => { await E.unpublish(c.script.id); toast("Quitado del equipo."); });
    const publishFromLibrary = () => pickScript(async (s) => {
      if (publishedIds.has(s.id)) { toast("«" + s.name + "» ya está publicado."); return; }
      try { await E.publish(profile, s); toast("Publicado: el equipo lo ve en «Del equipo»."); } catch (e) { toast("No se pudo publicar: " + e.message); }
    }, "¿Qué script publicas al equipo?");
    const copy = async (t) => toast((await copyText(t)) ? "Copiado." : "No se pudo copiar.");
    const actions = { send, react, pickScript, ask, confirm, toast, saveCopy, unpublish, publishFromLibrary, openChat, copy, openInAdvisor, newRequest, answerRequest, askPerson, newScript, importFiles };

    // ----- Datos derivados -----
    const convos = useMemo(() => {
      const map = new Map();
      inbox.concat(outbox).forEach((m) => {
        const other = m.from === meUid ? m.to : m.from;
        const c = map.get(other) || { uid: other, msgs: [], unread: 0 };
        c.msgs.push(m); if (m.to === meUid && !m.read) c.unread++;
        map.set(other, c);
      });
      return Array.from(map.values()).map((c) => { c.msgs.sort((a, b) => a.at - b.at); c.last = c.msgs[c.msgs.length - 1]; return c; }).sort((a, b) => b.last.at - a.last.at);
    }, [inbox, outbox, meUid]);
    const feed = useMemo(() => inbox.map((m) => Object.assign({ type: "msg" }, m)).concat(requests.filter((r) => r.from !== meUid).map((r) => Object.assign({ type: "request" }, r))).sort((a, b) => b.at - a.at).slice(0, 60), [inbox, requests, meUid]);
    const pushOn = devices.some((d) => d.token === E.thisToken()) && "Notification" in window && Notification.permission === "granted";
    const meMember = Object.assign({ uid: meUid }, profile);
    const openReq = requests.filter((r) => r.status !== "resuelto" && r.from !== meUid).length;

    if (library === null) return html`<${Spinner} label="Conectando con tu equipo…" />`;

    const TABS = [["actividad", "Activity", "Actividad", unread], ["chats", "MessageCircle", "Chats", convos.reduce((n, c) => n + c.unread, 0)], ["equipo", "Users", "Equipo", openReq], ["scripts", "FileCode", "Scripts", 0]];
    const renderLayer = (o) => {
      const done = () => close(o.key);
      switch (o.type) {
        case "chat": {
          const other = members.find((m) => m.uid === o.uid) || { uid: o.uid, name: "Ex miembro", status: "ausente" };
          const c = convos.find((x) => x.uid === o.uid);
          return html`<${ChatScreen} key=${o.key} other=${other} profile=${profile} meUid=${meUid} now=${now} msgs=${c ? c.msgs : []} library=${library} onBack=${done} actions=${actions} onOpenScript=${openScript} />`;
        }
        case "script": {
          const from = o.from ? (o.from.name || nameOf(o.from.uid)) : null;
          return html`<${ScriptScreen} key=${o.key} script=${o.script} editable=${o.editable} fromName=${from} published=${publishedIds.has(o.script.id)} onBack=${done}
            initialTab=${o.tab} onCopy=${copy} onAsk=${o.ask ? () => { done(); o.ask(); } : null}
            onSave=${async (s) => { await E.saveScript(s); toast("Guardado."); }} onShare=${share} onPublish=${togglePublish}
            onDelete=${(s) => confirm("¿Borrar «" + (s.name || "este script") + "»?", "Se borra de todos tus dispositivos. No se puede deshacer.", "Borrar", async () => { if (publishedIds.has(s.id)) await E.unpublish(s.id); await E.deleteScript(s.id); done(); })}
            onSaveCopy=${async (s) => { await saveCopy(s, (o.from && o.from.uid) || "equipo"); done(); }} />`;
        }
        case "profile": return html`<${ProfileScreen} key=${o.key} user=${user} profile=${profile} team=${team} onBack=${done} toast=${toast} confirm=${confirm} />`;
        case "pickScript": return html`<${ScriptPicker} key=${o.key} library=${library} title=${o.title} onClose=${done} onPick=${(s) => { done(); o.cb(s); }} />`;
        case "pickMember": return html`<${MemberPicker} key=${o.key} members=${members} meUid=${meUid} now=${now} title=${o.title} onClose=${done} onPick=${(m) => { done(); o.cb(m); }} />`;
        case "ask": return html`<${RequestDialog} key=${o.key} title=${o.title} intro=${o.intro} cta=${o.cta || "Enviar"} withCategory=${o.withCategory} onClose=${done}
          onSend=${async (d) => { try { done(); await o.cb(d); } catch (e) { /* el error ya se mostró */ } }} />`;
        case "share": return html`<${ShareSheet} key=${o.key} script=${o.script} onClose=${done} toast=${toast} onSendTeam=${() => { done(); sendTo(o.script); }} />`;
        case "confirm": return html`<${Sheet} key=${o.key} title=${o.title} onClose=${done}><p className="text-sm text-mute">${o.text}</p>
          <div className="flex gap-2 justify-end"><${Btn} onClick=${done}>${o.cancel || "Cancelar"}<//><${Btn} kind=${o.kind || "danger"} onClick=${async () => { done(); try { await o.fn(); } catch (e) { toast(e.message); } }}>${o.cta}<//></div><//>`;
        default: return null;
      }
    };
    return html`<div className="min-h-screen flex flex-col">
      <header className="sticky top-0 z-20 bg-canvas/95 backdrop-blur border-b border-line">
        <div className="max-w-3xl mx-auto flex items-center gap-3 px-3 py-2">
          <img src="/icono-192.png" alt="" className="w-8 h-8 rounded-lg" />
          <div className="min-w-0 flex-1"><p className="font-semibold truncate leading-tight">${team ? team.name : "Lanzador"}</p><p className="text-xs text-mute truncate">${netOk ? members.filter((m) => E.presence(m, now).online).length + " conectado(s)" : "Sin internet · se enviará al reconectar"}</p></div>
          <a href="/asesor/" className="flex items-center gap-1.5 rounded-full border border-line px-3 py-1.5 text-xs text-mute hover:text-ink hover:bg-panel" aria-label="Abrir el Asesor IA"><${Icon} name="Sparkles" size=${16} className="text-acc" /><span className="hidden sm:inline">Asesor IA</span></a>
          <button type="button" onClick=${() => push({ type: "profile" })} className="flex items-center gap-2 rounded-full pl-2 pr-1 py-1 hover:bg-panel" aria-label="Mi perfil">
            <span className="text-right hidden sm:block"><span className="block text-sm leading-tight">${profile.name}</span><span className="block text-xs text-mute leading-tight">${E.STATUSES[profile.status]}</span></span>
            <${Avatar} person=${meMember} status=${{ key: profile.status, label: E.STATUSES[profile.status] }} size=${36} />
          </button>
        </div>
      </header>
      <main className="flex-1 max-w-3xl w-full mx-auto p-3 pb-24">
        ${tab === "actividad" && html`<${ActivityTab} feed=${feed} members=${members} meUid=${meUid} now=${now} pushOn=${pushOn} onOpenChat=${openChat} onOpenRequest=${openRequest} onProfile=${() => push({ type: "profile" })} installEvt=${installEvt} onInstall=${async () => { installEvt.prompt(); await installEvt.userChoice.catch(() => null); setInstallEvt(null); }} />`}
        ${tab === "chats" && html`<${ChatsTab} convos=${convos} members=${members} meUid=${meUid} now=${now} onOpenChat=${openChat} />`}
        ${tab === "equipo" && team && html`<${TeamTab} team=${team} members=${members} meUid=${meUid} now=${now} requests=${requests} focusRequest=${focusRequest} onOpenChat=${openChat} actions=${actions} toast=${toast} />`}
        ${tab === "scripts" && html`<${ScriptsTab} library=${library} community=${community} members=${members} meUid=${meUid} publishedIds=${publishedIds} onOpen=${(s) => openScript(s, null)} onOpenCommunity=${(c) => { const own = c.owner === meUid && library.find((x) => x.id === c.script.id); push(own ? { type: "script", script: own, editable: true } : { type: "script", script: c.script, editable: false, from: who(c.owner) }); }} actions=${actions} />`}
      </main>
      <nav className="fixed bottom-0 inset-x-0 z-20 bg-panel border-t border-line" style=${{ paddingBottom: "env(safe-area-inset-bottom)" }}>
        <div className="max-w-3xl mx-auto grid grid-cols-4">${TABS.map(([k, ic, l, n]) => html`<button key=${k} type="button" onClick=${() => setTab(k)} className=${cx("relative flex flex-col items-center gap-0.5 py-2 text-xs", tab === k ? "text-acc" : "text-mute")} aria-current=${tab === k ? "page" : undefined}>
          <${Icon} name=${ic} size=${22} />${l}${n > 0 && html`<span className="absolute top-1 left-1/2 ml-2 min-w-[18px] h-[18px] px-1 rounded-full bg-bad text-white text-[10px] font-semibold grid place-items-center">${n > 99 ? "99+" : n}</span>`}</button>`)}</div>
      </nav>
      ${stack.map(renderLayer)}
      <div className="fixed top-2 inset-x-0 z-50 flex flex-col items-center gap-2 px-3 pointer-events-none" aria-live="polite">
        ${toasts.map((t) => html`<button key=${t.id} type="button" onClick=${() => { setToasts((x) => x.filter((y) => y.id !== t.id)); t.onOpen && t.onOpen(); }} className="pointer-events-auto w-full max-w-md text-left bg-raised border border-line shadow-xl rounded-2xl px-4 py-3 motion-safe:animate-entra">
          <p className="text-sm font-medium">${t.title}</p>${t.body && html`<p className="text-xs text-mute truncate">${t.body}</p>`}</button>`)}
      </div>
    </div>`;
  }

  // ---------- Raíz ----------
  function readDeep() {
    const q = new URLSearchParams(location.search);
    const d = {};
    ["chat", "pedido", "equipo", "vista", "accion", "compartido"].forEach((k) => { if (q.get(k)) d[k] = q.get(k).slice(0, 80); });
    if (d.equipo) try { sessionStorage.setItem("equipos.invitacion", d.equipo); } catch (e) { /* sin almacenamiento */ }
    try { if (!d.equipo) d.equipo = sessionStorage.getItem("equipos.invitacion") || undefined; } catch (e) { /* sin almacenamiento */ }
    return d;
  }
  function App() {
    const [user, setUser] = useState(undefined);
    const [profile, setProfile] = useState(undefined);
    const [okTeam, setOkTeam] = useState("");
    const [deep, setDeep] = useState(readDeep);
    const clearDeep = useCallback(() => { setDeep({}); try { sessionStorage.removeItem("equipos.invitacion"); } catch (e) { /* nada */ } if (location.search) history.replaceState(history.state, "", "/"); }, []);
    useEffect(() => E.onAuth((u) => { setUser(u); if (!u) setProfile(undefined); }), []);
    useEffect(() => {
      if (!user) return undefined;
      setProfile(undefined);
      return E.watchProfile(user.uid, (p, confirmed) => { setProfile(p); if (p && confirmed) setOkTeam(p.team); }, () => setProfile(null));
    }, [user && user.uid]);
    // Invitación con enlace estando ya en otro equipo.
    const [invite, setInvite] = useState(null);
    useEffect(() => {
      if (profile && profile.team && deep.equipo && E.cleanCode(deep.equipo) !== profile.team) E.getTeam(deep.equipo).then((t) => t && setInvite(t));
    }, [profile && profile.team, deep.equipo]);

    if (user === undefined) return html`<${Spinner} />`;
    if (!user) return html`<${Login} inviteTeam=${!!deep.equipo} />`;
    if (profile === undefined) return html`<${Spinner} label="Cargando tu perfil…" />`;
    if (!profile || !profile.team) return html`<${Onboarding} user=${user} profile=${profile} inviteCode=${deep.equipo || ""} onDone=${() => {}} />`;
    // Espera a que el servidor confirme la entrada al equipo: antes, las reglas aún no te ven como miembro.
    if (profile.team !== okTeam) return html`<${Spinner} label="Entrando al equipo…" />`;
    return html`<${React.Fragment}>
      <${Main} key=${profile.team} user=${user} profile=${profile} deep=${deep} clearDeep=${clearDeep} />
      ${invite && html`<${Sheet} title="Invitación a otro equipo" onClose=${() => { setInvite(null); clearDeep(); }}>
        <p className="text-sm">Te invitaron a <b>${invite.name}</b>. Solo puedes estar en un equipo a la vez: si te cambias, dejarás de ver el equipo actual.</p>
        <div className="flex gap-2 justify-end"><${Btn} onClick=${() => { setInvite(null); clearDeep(); }}>Quedarme<//><${Btn} kind="primary" onClick=${async () => { await E.joinTeam(invite.id); setInvite(null); clearDeep(); }}>Cambiarme<//></div>
      <//>`}
    <//>`;
  }

  window.__startLanzador = function () {
    E.init().then(() => {
      ReactDOM.createRoot(document.getElementById("root")).render(html`<${App} />`);
    }).catch((e) => {
      document.getElementById("root").innerHTML = '<div style="padding:24px;font-family:system-ui;color:#f07a62">No se pudo iniciar: ' + String(e && e.message || e).replace(/</g, "&lt;") + "</div>";
    });
  };
})();
